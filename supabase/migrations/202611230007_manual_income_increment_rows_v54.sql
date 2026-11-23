-- RiderSpot v54: each positive manual actual-total adjustment is a distinct
-- rider_earnings source_type=manual ledger row with note "수기입력 추가분".
-- Auto income remains idempotent; delayed auto captures can reallocate across
-- multiple manual supplements without changing daily totals or GPS data.
-- No existing earnings rows are altered by this migration.

create or replace function public.rs_save_daily_income_guarded(
  p_date date, p_values jsonb, p_expected jsonb
) returns void
language plpgsql security invoker set search_path = ''
as $rs$
declare
  owner_id uuid := auth.uid();
  platform_key text;
  target numeric;
  expected_total numeric;
  actual_total numeric;
  automatic_total numeric;
  new_delta numeric;
  remaining numeric;
  topup_sum numeric;
  decrease numeric;
  adjustment_row record;
  adjustment_note constant text := '자동수집 누락분 보충 · 실제 총수입 기준';
  increment_note constant text := '수기입력 추가분';
begin
  if owner_id is null or p_date is null
    or pg_catalog.jsonb_typeof(p_values) is distinct from 'object'
    or pg_catalog.jsonb_typeof(p_expected) is distinct from 'object' then
    raise exception 'RS_INVALID_REQUEST';
  end if;

  -- Keep historic manual-write ordering; also serialize against
  -- rs_append_auto_income which locks the exact user/platform/work-date.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(owner_id::text || p_date::text,0));
  for platform_key in
    select key from pg_catalog.jsonb_object_keys(p_values) as key order by key
  loop
    if platform_key not in ('쿠팡이츠','배민')
       or not (p_expected ? platform_key) then
      raise exception 'RS_INVALID_PLATFORM_OR_EXPECTED';
    end if;
    if pg_catalog.jsonb_typeof(p_values->platform_key) not in ('number','null')
       or pg_catalog.jsonb_typeof(p_expected->platform_key) not in ('number','null') then
      raise exception 'RS_INVALID_AMOUNT';
    end if;
    target := (p_values->>platform_key)::numeric;
    expected_total := (p_expected->>platform_key)::numeric;
    if (target is not null and
        (target <> pg_catalog.trunc(target) or target not between 0 and 100000000))
       or (expected_total is not null and
        (expected_total <> pg_catalog.trunc(expected_total) or expected_total not between 0 and 100000000)) then
      raise exception 'RS_INVALID_AMOUNT';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(owner_id::text || ':' || platform_key || ':' || p_date::text,0));

    -- Evaluate the current value atomically. If automatic recognition arrived
    -- after the UI was opened, require a fresh read instead of double counting.
    select pg_catalog.sum(gross_won) filter (where gross_entered is not false),
           coalesce(pg_catalog.sum(gross_won) filter
             (where gross_entered is not false and source_type='auto'),0)
      into actual_total,automatic_total
    from public.rider_earnings
    where user_id=owner_id and work_date=p_date and platform=platform_key;
    if actual_total is distinct from expected_total then
      raise exception 'RS_INCOME_CONFLICT';
    end if;
    if target is distinct from actual_total and exists(
      select 1 from public.rider_earnings
      where user_id=owner_id and work_date=p_date and platform=platform_key
        and paid_at is not null
    ) then
      raise exception 'RS_SETTLED_INCOME';
    end if;

    -- Every explicit increase is its own auditable entry. Do not rewrite a
    -- prior manual addition when the rider enters a new actual-day total.
    -- As before, NULL clears only unlocked/undetailed supplement rows.
    if target is null then
      select coalesce(sum(gross_won),0) into topup_sum
      from public.rider_earnings
      where user_id=owner_id and work_date=p_date and platform=platform_key
        and source_type='manual' and paid_at is null
        and gross_entered is not false
        and note in (adjustment_note,increment_note)
        and expenses_won=0 and promo_won=0 and tip_won=0 and deliveries=0;
      target:=coalesce(actual_total,0)-topup_sum;
    end if;

    new_delta:=target-coalesce(actual_total,0);
    if new_delta>0 then
      -- Example: current total 90,000, entered 100,000 -> +10,000 row.
      insert into public.rider_earnings (
        user_id,work_date,platform,gross_won,gross_entered,expense_scope,
        note,source_type,manual_snapshot_at
      ) values (
        owner_id,p_date,platform_key,new_delta,true,'other_only',
        increment_note,'manual',pg_catalog.clock_timestamp()
      );
    elsif new_delta<0 then
      -- A corrected LOWER actual total can reduce only non-settled manual
      -- supplements, newest first. Existing auto captures never change.
      remaining:=-new_delta;
      for adjustment_row in
        select id,gross_won
        from public.rider_earnings
        where user_id=owner_id and work_date=p_date and platform=platform_key
          and source_type='manual' and paid_at is null
          and gross_entered is not false and gross_won>0
          and note in (adjustment_note,increment_note)
          and expenses_won=0 and promo_won=0 and tip_won=0 and deliveries=0
        order by coalesce(manual_snapshot_at,created_at) desc,created_at desc,id desc
        for update
      loop
        exit when remaining<=0;
        decrease:=least(adjustment_row.gross_won,remaining);
        update public.rider_earnings
        set gross_won=gross_won-decrease,
            gross_entered=(gross_won-decrease)>0,
            updated_at=pg_catalog.now()
        where id=adjustment_row.id and user_id=owner_id
          and source_type='manual' and paid_at is null;
        remaining:=remaining-decrease;
      end loop;
      if remaining>0 then
        raise exception '입력한 총수입이 기존 자동수집·확정 수익보다 적어요. 수익 내역에서 확인해 주세요.';
      end if;
    end if;
  end loop;
end;
$rs$;

revoke all on function public.rs_save_daily_income_guarded(date,jsonb,jsonb)
  from public,anon;
grant execute on function public.rs_save_daily_income_guarded(date,jsonb,jsonb)
  to authenticated;


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

  day := ((p_captured_at at time zone 'Asia/Seoul') - interval '3 hours')::date;
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
