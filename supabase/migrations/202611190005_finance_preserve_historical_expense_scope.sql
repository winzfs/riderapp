-- Preserve historical expense_scope when editing a legacy income.
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
      gross_entered=true
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
$function$;
