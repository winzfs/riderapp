-- RiderSpot v57. New capture dates roll over at 00:00 KST, never 03:00.
-- Existing GPS and route points remain untouched. Only wrongly dated
-- post-midnight captures since 2026-11-24 and their unpaid AUTO ledger sums
-- are reallocated to the correct calendar date. Pre-change historical records
-- from earlier dates are not silently reinterpreted.
create or replace function public.rs_append_auto_income(
  p_capture_id text,
  p_captured_at timestamptz,
  p_platform text,
  p_amount integer,
  p_base integer,
  p_extra integer,
  p_reward integer
) returns jsonb
language plpgsql security definer set search_path = ''
as $rs$
declare
  owner uuid := auth.uid();
  day date;
  prior public.rider_auto_deliveries%rowtype;
  duplicate_id uuid;
  earning uuid;
  record_id uuid;
  adjustment_row record;
  amount_left numeric;
  reduce_by numeric;
  offset_amount numeric := 0;
  auto_note constant text := '자동 수집 배달료 · 건별 원장 연동';
  adjustment_note constant text := '자동수집 누락분 보충 · 실제 총수입 기준';
  increment_note constant text := '수기입력 추가분';
begin
  if owner is null then raise exception 'RS_LOGIN_REQUIRED'; end if;
  if p_capture_id is null
     or p_capture_id !~ '^[0-9]{10,17}-[0-9]{1,6}$'
     or pg_catalog.length(p_capture_id)>48
     or p_platform not in ('쿠팡이츠','배민')
     or p_amount is null or p_amount not between 500 and 150000
     or p_base is null or p_extra is null or p_reward is null
     or p_base<0 or p_extra<0 or p_reward<0
     or p_base+p_extra+p_reward<>p_amount
     or p_captured_at is null
     or p_captured_at < pg_catalog.now()-interval '7 days'
     or p_captured_at > pg_catalog.now()+interval '10 minutes'
  then raise exception 'RS_AUTO_INVALID_CAPTURE'; end if;

  -- Calendar date of the completed delivery: 00:00-23:59:59 KST.
  day := (p_captured_at at time zone 'Asia/Seoul')::date;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(owner::text || ':' || p_platform || ':' || day::text,0));

  -- Idempotence: never count a capture ID twice.
  select * into prior from public.rider_auto_deliveries
    where user_id=owner and capture_id=p_capture_id for update;
  if found then
    if prior.platform<>p_platform or prior.gross_won<>p_amount
       or prior.base_won<>p_base or prior.extra_won<>p_extra
       or prior.reward_won<>p_reward
    then raise exception 'RS_AUTO_CAPTURE_COLLISION'; end if;
    return pg_catalog.jsonb_build_object('created',false,'status',prior.status,
      'applied',prior.status='applied','capture_id',p_capture_id,
      'work_date',prior.work_date);
  end if;

  -- A second accessibility event from the *same* completion screen can use
  -- a new capture ID. Only the exact platform+full amount breakdown within
  -- 30 seconds is considered that same screen; never ask for a manual tap.
  select id into duplicate_id from public.rider_auto_deliveries
    where user_id=owner and platform=p_platform and work_date=day
      and gross_won=p_amount and base_won=p_base
      and extra_won=p_extra and reward_won=p_reward
      and captured_at between p_captured_at-interval '30 seconds'
                          and p_captured_at+interval '30 seconds'
      and status in ('applied','covered')
    order by captured_at desc limit 1;
  if duplicate_id is not null then
    insert into public.rider_auto_deliveries
      (user_id,capture_id,captured_at,work_date,platform,gross_won,
       base_won,extra_won,reward_won,status)
    values
      (owner,p_capture_id,p_captured_at,day,p_platform,p_amount,
       p_base,p_extra,p_reward,'covered');
    return pg_catalog.jsonb_build_object('created',true,'status','covered',
      'applied',false,'capture_id',p_capture_id,'work_date',day);
  end if;

  -- Legitimate strong captures must not wait just because a manual daily
  -- total exists. The database ledger is the source of truth for capture IDs.
  insert into public.rider_auto_deliveries
    (user_id,capture_id,captured_at,work_date,platform,gross_won,
     base_won,extra_won,reward_won,status)
  values
    (owner,p_capture_id,p_captured_at,day,p_platform,p_amount,
     p_base,p_extra,p_reward,'applied')
  returning id into record_id;

  -- Do not mutate paid/settled entries. Add a fresh auto ledger row instead.
  select id into earning
  from public.rider_earnings
  where user_id=owner and work_date=day and platform=p_platform
    and source_type='auto' and paid_at is null and deliveries < 300
    and gross_won + p_amount <= 100000000
  order by created_at limit 1 for update;

  if earning is null then
    insert into public.rider_earnings
      (user_id,work_date,platform,gross_won,deliveries,gross_entered,
       expense_scope,note,source_type,promo_won)
    values
      (owner,day,p_platform,p_amount,1,true,'other_only',
       auto_note,'auto',p_reward)
    returning id into earning;
  else
    update public.rider_earnings
    set gross_won=gross_won+p_amount,
        deliveries=deliveries+1,
        promo_won=promo_won+p_reward,
        updated_at=pg_catalog.now()
    where id=earning and user_id=owner and paid_at is null;
  end if;

  -- A manual daily total is a snapshot taken at a specific timestamp.
  -- Only a late recognition of a delivery completed BEFORE that snapshot
  -- may replace its covered/manual-shortfall amount. A NEW delivery completed
  -- AFTER manual entry must ADD to the total (never reduce manual earnings).
  -- Use actual captured_at rather than arrival time to handle backfilled events.
  -- A late automatic capture may correspond to several separately logged
  -- manual increments. Offset only rows created AFTER that delivery happened.
  -- Newly completed deliveries never decrease an earlier manual line.
  amount_left:=p_amount;
  for adjustment_row in
    select id,gross_won
    from public.rider_earnings
    where user_id=owner and work_date=day and platform=p_platform
      and source_type='manual' and gross_entered=true and paid_at is null
      and note in (adjustment_note,increment_note)
      and expenses_won=0 and promo_won=0 and tip_won=0 and deliveries=0
      and gross_won>0
      and p_captured_at<=coalesce(manual_snapshot_at,created_at)
    order by coalesce(manual_snapshot_at,created_at) desc,created_at desc,id desc
    for update
  loop
    exit when amount_left<=0;
    reduce_by:=least(adjustment_row.gross_won,amount_left);
    update public.rider_earnings
    set gross_won=gross_won-reduce_by,
        gross_entered=(gross_won-reduce_by)>0,
        updated_at=pg_catalog.now()
    where id=adjustment_row.id and user_id=owner
      and source_type='manual' and paid_at is null;
    amount_left:=amount_left-reduce_by;
    offset_amount:=offset_amount+reduce_by;
  end loop;

  update public.rider_auto_deliveries
  set earning_id=earning
  where id=record_id and user_id=owner;
  return pg_catalog.jsonb_build_object(
    'created',true,'status','applied','applied',true,
    'reallocated_manual_won',offset_amount,
    'capture_id',p_capture_id,'work_date',day);
end;
$rs$;
revoke all on function public.rs_append_auto_income(
  text,timestamptz,text,integer,integer,integer,integer) from public,anon;
grant execute on function public.rs_append_auto_income(
  text,timestamptz,text,integer,integer,integer,integer) to authenticated;


DO $repair$
DECLARE
  row record;
  old_earning public.rider_earnings%rowtype;
  destination uuid;
  transferred integer := 0;
BEGIN
  for row in
    select d.id,d.user_id,d.platform,d.work_date,d.captured_at,
      d.earning_id,d.gross_won,d.reward_won,d.status,
      (d.captured_at at time zone 'Asia/Seoul')::date as correct_day
    from public.rider_auto_deliveries d
    where d.captured_at >= timestamptz '2026-11-24 00:00:00+09'
      and d.work_date <> (d.captured_at at time zone 'Asia/Seoul')::date
    order by d.captured_at,d.id
    for update of d
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(row.user_id::text||':'||row.platform||':'||row.work_date::text,0));
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(row.user_id::text||':'||row.platform||':'||row.correct_day::text,0));

    if row.status <> 'applied' then
      -- A skipped/covered capture has no ledger amount to transfer.
      update public.rider_auto_deliveries
      set work_date=row.correct_day
      where id=row.id and user_id=row.user_id;
      continue;
    end if;
    select * into old_earning from public.rider_earnings
    where id=row.earning_id and user_id=row.user_id and work_date=row.work_date
      and platform=row.platform and source_type='auto'
    for update;
    if not found or old_earning.paid_at is not null
      or old_earning.gross_won < row.gross_won
      or old_earning.deliveries < 1
      or old_earning.promo_won < row.reward_won
      then raise exception 'RS_V57_UNSAFE_OR_SETTLED_DAY_MIGRATION'; end if;

    update public.rider_earnings
    set gross_won=gross_won-row.gross_won,
        deliveries=deliveries-1,
        promo_won=promo_won-row.reward_won,
        updated_at=pg_catalog.now()
    where id=old_earning.id and user_id=row.user_id;

    select id into destination from public.rider_earnings
    where user_id=row.user_id and work_date=row.correct_day
      and platform=row.platform and source_type='auto'
      and paid_at is null and deliveries < 300
      and gross_won+row.gross_won <= 100000000
    order by created_at limit 1 for update;

    if destination is null then
      insert into public.rider_earnings
        (user_id,work_date,platform,gross_won,deliveries,gross_entered,
         expense_scope,note,source_type,promo_won)
      values
        (row.user_id,row.correct_day,row.platform,row.gross_won,1,true,
         'other_only','자동 수집 배달료 · 건별 원장 연동','auto',row.reward_won)
      returning id into destination;
    else
      update public.rider_earnings
      set gross_won=gross_won+row.gross_won,
          deliveries=deliveries+1,
          promo_won=promo_won+row.reward_won,
          gross_entered=true,
          updated_at=pg_catalog.now()
      where id=destination and user_id=row.user_id;
    end if;
    update public.rider_auto_deliveries
    set work_date=row.correct_day,earning_id=destination
    where id=row.id and user_id=row.user_id;
    transferred:=transferred+1;
  end loop;
  raise notice 'RiderSpot v57 migrated % post-midnight auto-capture rows without duplicate additions',transferred;
END $repair$;
