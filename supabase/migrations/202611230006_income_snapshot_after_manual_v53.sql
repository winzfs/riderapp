-- RiderSpot v53: corrected manual-daily-total snapshot semantics.
-- Prevent new automatic earnings from cancelling manual income after entry.
-- GPS, local backup and all other account data are unchanged.
ALTER TABLE public.rider_earnings
  ADD COLUMN IF NOT EXISTS manual_snapshot_at timestamptz;

-- Existing legacy top-ups have not stored a separate snapshot time. Their
-- initial creation time is the conservative available baseline.
UPDATE public.rider_earnings
SET manual_snapshot_at=created_at
WHERE source_type='manual'
  AND note='자동수집 누락분 보충 · 실제 총수입 기준'
  AND manual_snapshot_at IS NULL;

-- Correct the confirmed 2026-11-23 local income incident in this same
-- transaction as the function upgrade. Restrict to the exact timestamp
-- of the affected manual snapshot, and refuse to touch ambiguous records.
-- All actual GPS/auto-delivery records remain untouched.
DO $repair$
DECLARE
  target_record record;
  affected int;
  corrected numeric;
  new_total numeric;
BEGIN
  SELECT id,user_id,work_date,platform,created_at,gross_won
  INTO target_record
  FROM public.rider_earnings
  WHERE work_date=date '2026-11-23'
    AND platform='쿠팡이츠'
    AND source_type='manual'
    AND note='자동수집 누락분 보충 · 실제 총수입 기준'
    AND created_at >= timestamptz '2026-11-23 10:01:07+00'
    AND created_at < timestamptz '2026-11-23 10:01:08+00'
    AND manual_snapshot_at=created_at
    AND gross_won>0
    AND paid_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RS_V53_HISTORICAL_REPAIR_TARGET_CHANGED';
  END IF;
  IF (SELECT count(*) FROM public.rider_earnings
      WHERE user_id=target_record.user_id
        AND work_date=target_record.work_date
        AND platform=target_record.platform
        AND source_type='manual'
        AND note='자동수집 누락분 보충 · 실제 총수입 기준') <> 1 THEN
    RAISE EXCEPTION 'RS_V53_HISTORICAL_REPAIR_AMBIGUOUS';
  END IF;

  SELECT coalesce(sum(d.gross_won),0)
    INTO corrected
  FROM public.rider_auto_deliveries d
  WHERE d.user_id=target_record.user_id
    AND d.work_date=target_record.work_date
    AND d.platform=target_record.platform
    AND d.status='applied'
    AND d.captured_at>target_record.created_at;
  IF corrected<=0 OR corrected>100000 OR target_record.gross_won+corrected>100000000 THEN
    RAISE EXCEPTION 'RS_V53_HISTORICAL_REPAIR_AMOUNT_UNSAFE: %',corrected;
  END IF;
  UPDATE public.rider_earnings
  SET gross_won=gross_won+corrected, gross_entered=true,
      updated_at=pg_catalog.now()
  WHERE id=target_record.id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected<>1 THEN
    RAISE EXCEPTION 'RS_V53_HISTORICAL_REPAIR_WRITE_FAILED';
  END IF;
  RAISE NOTICE 'v53 restored post-snapshot captured income % without creating any auto duplicate',corrected;
END $repair$;


-- RiderSpot: actual daily income reconciliation, 2026-11-23.
-- Keep automatic income and per-delivery ledger immutable through manual daily-total input.
-- Existing RPC name/signature are preserved for finance and timeline clients.
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
  fixed_manual numeric;
  desired_manual numeric;
  adjustment_id uuid;
  adjustment_amount numeric;
  adjustment_entered boolean;
  adjustment_note constant text := '자동수집 누락분 보충 · 실제 총수입 기준';
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

    -- Prefer the prior automatic-shortfall entry; alternatively reuse one
    -- ordinary undetailed manual total. Never edit auto, paid, or detailed rows.
    adjustment_id := null;
    adjustment_amount := 0;
    adjustment_entered := false;
    select id,gross_won,gross_entered into
      adjustment_id,adjustment_amount,adjustment_entered
    from public.rider_earnings
    where user_id=owner_id and work_date=p_date and platform=platform_key
      and source_type='manual' and paid_at is null
      and expenses_won=0 and promo_won=0 and tip_won=0 and deliveries=0
      and (note=adjustment_note or pg_catalog.btrim(note)='')
    order by case when note=adjustment_note then 0 else 1 end,created_at,id
    limit 1 for update;

    select coalesce(pg_catalog.sum(gross_won),0) into fixed_manual
    from public.rider_earnings
    where user_id=owner_id and work_date=p_date and platform=platform_key
      and source_type='manual' and gross_entered is not false
      and (adjustment_id is null or id<>adjustment_id);

    -- A cleared field means remove manual adjustment, not erase auto captures.
    desired_manual := coalesce(target,automatic_total) - automatic_total - fixed_manual;
    if desired_manual < 0 then
      raise exception '입력한 총수입보다 이미 기록된 자동·수동 수익이 많아요. 수익 내역을 확인해 주세요.';
    end if;
    if desired_manual > 100000000 then
      raise exception 'RS_INVALID_AMOUNT';
    end if;

    if adjustment_id is not null then
      if adjustment_amount is distinct from desired_manual
         or adjustment_entered is distinct from (desired_manual>0)
         or target is not null then
        update public.rider_earnings set
          gross_won=desired_manual,
          gross_entered=(desired_manual>0),
          note=adjustment_note,
          manual_snapshot_at=pg_catalog.clock_timestamp(),
          updated_at=pg_catalog.now()
        where id=adjustment_id and user_id=owner_id and source_type='manual';
      end if;
    elsif desired_manual > 0 then
      insert into public.rider_earnings (
        user_id,work_date,platform,gross_won,gross_entered,expense_scope,
        note,source_type,manual_snapshot_at
      ) values (
        owner_id,p_date,platform_key,desired_manual,true,'other_only',
        adjustment_note,'manual',pg_catalog.clock_timestamp()
      );
    end if;
  end loop;
end;
$rs$;

revoke all on function public.rs_save_daily_income_guarded(date,jsonb,jsonb)
  from public,anon;
grant execute on function public.rs_save_daily_income_guarded(date,jsonb,jsonb)
  to authenticated;

-- RiderSpot v51: strong completed-delivery captures auto-apply without daily
-- manual-entry confirmation. Real-total manual topups are rebalanced atomically,
-- so recognizing a previously supplemented delivery does not double-count it.
-- Existing records/statuses and user choices are never rewritten by migration.
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
  adjustment_id uuid;
  adjustment_amount numeric;
  offset_amount numeric := 0;
  auto_note constant text := '자동 수집 배달료 · 건별 원장 연동';
  adjustment_note constant text := '자동수집 누락분 보충 · 실제 총수입 기준';
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
  select id,gross_won into adjustment_id,adjustment_amount
  from public.rider_earnings
  where user_id=owner and work_date=day and platform=p_platform
    and source_type='manual' and gross_entered=true and paid_at is null
    and note=adjustment_note
    and expenses_won=0 and promo_won=0 and tip_won=0 and deliveries=0
    and gross_won>0
    and p_captured_at <= coalesce(manual_snapshot_at,created_at)
  order by created_at,id limit 1 for update;
  if adjustment_id is not null then
    offset_amount := least(adjustment_amount,p_amount);
    update public.rider_earnings
    set gross_won=gross_won-offset_amount,
        gross_entered=(gross_won-offset_amount)>0,
        updated_at=pg_catalog.now()
    where id=adjustment_id and user_id=owner
      and source_type='manual' and paid_at is null;
  end if;

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
