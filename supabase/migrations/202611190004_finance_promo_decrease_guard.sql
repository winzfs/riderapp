
-- v204b: when lowering gross, update the old promo/tip breakdown inside the
-- same database transaction while holding the same daily advisory locks.
create or replace function public.rs_save_income_with_components(
 p_id uuid,p_date date,p_platform text,p_gross numeric,
 p_deliveries integer,p_expenses numeric,p_note text,
 p_expected_updated timestamptz,p_promo numeric,p_tip numeric)
returns uuid language plpgsql security invoker set search_path = ''
as $$
declare
 owner_id uuid := auth.uid();
 record_id uuid;
 prior_date date;
 lock_day date;
 actual_updated timestamptz;
 old_parts numeric;
 expected_version timestamptz := p_expected_updated;
begin
 if owner_id is null or p_promo is null or p_tip is null
  or p_promo<0 or p_tip<0 or p_promo<>trunc(p_promo) or p_tip<>trunc(p_tip)
  or p_gross is null or p_promo+p_tip>p_gross
 then raise exception 'RS_INVALID_BREAKDOWN'; end if;
 if p_id is not null then
   select work_date,coalesce(promo_won,0)+coalesce(tip_won,0)
     into prior_date,old_parts
   from public.rider_earnings where id=p_id and user_id=owner_id;
   if prior_date is null then raise exception 'RS_RECORD_NOT_FOUND'; end if;
   if old_parts>p_gross then
     for lock_day in select distinct d from (values(p_date),(prior_date)) as t(d)
       where d is not null order by d loop
       perform pg_advisory_xact_lock(hashtextextended(owner_id::text || lock_day::text,0));
     end loop;
     select updated_at into actual_updated from public.rider_earnings
       where id=p_id and user_id=owner_id for update;
     if actual_updated is distinct from p_expected_updated then
       raise exception 'RS_INCOME_CONFLICT'; end if;
     update public.rider_earnings set promo_won=0,tip_won=0
       where id=p_id and user_id=owner_id
       returning updated_at into expected_version;
   end if;
 end if;
 record_id := public.rs_save_income_record(p_id,p_date,p_platform,p_gross,
   p_deliveries,p_expenses,p_note,expected_version);
 update public.rider_earnings
 set promo_won=p_promo,tip_won=p_tip
 where id=record_id and user_id=owner_id;
 if not found then raise exception 'RS_RECORD_NOT_FOUND'; end if;
 return record_id;
end;
$$;
revoke all on function public.rs_save_income_with_components(
 uuid,date,text,numeric,integer,numeric,text,timestamptz,numeric,numeric) from public,anon;
grant execute on function public.rs_save_income_with_components(
 uuid,date,text,numeric,integer,numeric,text,timestamptz,numeric,numeric) to authenticated;
