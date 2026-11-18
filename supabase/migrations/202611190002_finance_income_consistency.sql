-- v203 previously applied to Supabase; consistent migration for future environments.
alter table public.rider_earnings
 add column if not exists updated_at timestamptz not null default now();

CREATE OR REPLACE FUNCTION public.rs_save_daily_income_guarded(p_date date, p_values jsonb, p_expected jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  owner_id uuid := auth.uid();
  platform_key text;
  target numeric;
  expected_total numeric;
  actual_total numeric;
  item record;
  n integer;
  i integer;
  remaining numeric;
  assigned numeric;
begin
  if owner_id is null or p_date is null or jsonb_typeof(p_values) is distinct from 'object'
    or jsonb_typeof(p_expected) is distinct from 'object' then
    raise exception 'RS_INVALID_REQUEST';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text || p_date::text, 0));
  for platform_key in select key from jsonb_object_keys(p_values) as key order by key loop
    if platform_key not in ('쿠팡이츠','배민') or not p_expected ? platform_key then
      raise exception 'RS_INVALID_PLATFORM_OR_EXPECTED';
    end if;
    if jsonb_typeof(p_values->platform_key) not in ('number','null')
      or jsonb_typeof(p_expected->platform_key) not in ('number','null') then
      raise exception 'RS_INVALID_AMOUNT';
    end if;
    target := (p_values->>platform_key)::numeric;
    expected_total := (p_expected->>platform_key)::numeric;
    if (target is not null and (target<>trunc(target) or target not between 0 and 100000000))
      or (expected_total is not null and
        (expected_total<>trunc(expected_total) or expected_total not between 0 and 100000000)) then
      raise exception 'RS_INVALID_AMOUNT';
    end if;
    select sum(gross_won) filter (where gross_entered is not false) into actual_total
      from public.rider_earnings
      where user_id=owner_id and work_date=p_date and platform=platform_key;
    if actual_total is distinct from expected_total then
      raise exception 'RS_INCOME_CONFLICT';
    end if;
    if target is distinct from actual_total and exists(
      select 1 from public.rider_earnings
      where user_id=owner_id and work_date=p_date and platform=platform_key and paid_at is not null
    ) then raise exception 'RS_SETTLED_INCOME'; end if;
    select count(*) into n from public.rider_earnings
      where user_id=owner_id and work_date=p_date and platform=platform_key;
    if n=0 then
      if target is not null then
        insert into public.rider_earnings(user_id,work_date,platform,gross_won,gross_entered,expense_scope)
        values(owner_id,p_date,platform_key,target,true,'other_only');
      end if;
    else
      remaining := coalesce(target,0);
      i := 0;
      for item in
        select id,gross_won from public.rider_earnings
        where user_id=owner_id and work_date=p_date and platform=platform_key
        order by created_at,id for update
      loop
        i := i+1;
        assigned := case when i=n then remaining else least(remaining,greatest(item.gross_won,0)) end;
        update public.rider_earnings
          set gross_won=assigned,gross_entered=(target is not null)
          where id=item.id and user_id=owner_id;
        remaining := remaining-assigned;
      end loop;
    end if;
  end loop;
end;
$function$


CREATE OR REPLACE FUNCTION public.rs_save_income_record(p_id uuid, p_date date, p_platform text, p_gross numeric, p_deliveries integer, p_expenses numeric, p_note text, p_expected_updated timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  owner_id uuid := auth.uid();
  existing record;
  record_id uuid;
  prior_date date;
  lock_day date;
begin
  if owner_id is null or p_date is null or p_platform is null
     or p_platform not in ('쿠팡이츠','배민','기타','배민커넥트')
     or p_gross is null or p_gross<>trunc(p_gross) or p_gross not between 0 and 100000000
     or p_expenses is null or p_expenses<>trunc(p_expenses) or p_expenses not between 0 and 100000000
     or p_deliveries is null or p_deliveries not between 0 and 300
     or char_length(coalesce(p_note,''))>300 then raise exception 'RS_INVALID_AMOUNT'; end if;
  if p_id is not null then
    select work_date into prior_date from public.rider_earnings
      where id=p_id and user_id=owner_id;
    if prior_date is null then raise exception 'RS_RECORD_NOT_FOUND'; end if;
  end if;
  for lock_day in select distinct d from (values(p_date),(prior_date)) as t(d)
    where d is not null order by d loop
    perform pg_advisory_xact_lock(hashtextextended(owner_id::text || lock_day::text,0));
  end loop;
  if p_id is not null then
    select id,work_date,platform,updated_at,paid_at into existing
      from public.rider_earnings where id=p_id and user_id=owner_id for update;
    if not found then raise exception 'RS_RECORD_NOT_FOUND'; end if;
    if p_expected_updated is null or existing.updated_at is distinct from p_expected_updated then
      raise exception 'RS_INCOME_CONFLICT';
    end if;
    if (existing.work_date<>p_date or existing.platform<>p_platform) and exists(
      select 1 from public.rider_earnings
        where user_id=owner_id and id<>p_id and work_date=p_date and platform=p_platform
    ) then raise exception 'RS_DUPLICATE_DAY_PLATFORM'; end if;
    update public.rider_earnings set work_date=p_date,platform=p_platform,gross_won=p_gross,
      deliveries=p_deliveries,expenses_won=p_expenses,note=coalesce(p_note,''),
      gross_entered=true,expense_scope='other_only'
      where id=p_id and user_id=owner_id returning id into record_id;
  else
    if exists(select 1 from public.rider_earnings
      where user_id=owner_id and work_date=p_date and platform=p_platform)
    then raise exception 'RS_DUPLICATE_DAY_PLATFORM'; end if;
    insert into public.rider_earnings(
      user_id,work_date,platform,gross_won,deliveries,expenses_won,note,
      gross_entered,expense_scope
    ) values(owner_id,p_date,p_platform,p_gross,p_deliveries,p_expenses,coalesce(p_note,''),
      true,'other_only')
      returning id into record_id;
  end if;
  return record_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.rs_touch_rider_earnings()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$function$


drop trigger if exists rs_touch_rider_earnings on public.rider_earnings;
create trigger rs_touch_rider_earnings before update on public.rider_earnings
for each row execute function public.rs_touch_rider_earnings();

revoke all on function public.rs_save_daily_income_guarded(date,jsonb,jsonb) from public,anon;
revoke all on function public.rs_save_income_record(uuid,date,text,numeric,integer,numeric,text,timestamptz) from public,anon;
grant execute on function public.rs_save_daily_income_guarded(date,jsonb,jsonb) to authenticated;
grant execute on function public.rs_save_income_record(uuid,date,text,numeric,integer,numeric,text,timestamptz) to authenticated;
