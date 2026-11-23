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
         or adjustment_entered is distinct from (desired_manual>0) then
        update public.rider_earnings set
          gross_won=desired_manual,
          gross_entered=(desired_manual>0),
          note=adjustment_note,
          updated_at=pg_catalog.now()
        where id=adjustment_id and user_id=owner_id and source_type='manual';
      end if;
    elsif desired_manual > 0 then
      insert into public.rider_earnings (
        user_id,work_date,platform,gross_won,gross_entered,expense_scope,
        note,source_type
      ) values (
        owner_id,p_date,platform_key,desired_manual,true,'other_only',
        adjustment_note,'manual'
      );
    end if;
  end loop;
end;
$rs$;

revoke all on function public.rs_save_daily_income_guarded(date,jsonb,jsonb)
  from public,anon;
grant execute on function public.rs_save_daily_income_guarded(date,jsonb,jsonb)
  to authenticated;
