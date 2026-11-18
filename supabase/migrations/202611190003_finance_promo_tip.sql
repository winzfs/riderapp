
-- v204: promotion and tip are components already contained in gross revenue.
alter table public.rider_earnings
 add column if not exists promo_won numeric not null default 0,
 add column if not exists tip_won numeric not null default 0;
alter table public.rider_earnings
 add constraint rider_income_components_valid
 check (promo_won>=0 and tip_won>=0 and promo_won=trunc(promo_won)
  and tip_won=trunc(tip_won) and promo_won+tip_won<=gross_won);

create or replace function public.rs_save_income_with_components(
 p_id uuid,p_date date,p_platform text,p_gross numeric,
 p_deliveries integer,p_expenses numeric,p_note text,
 p_expected_updated timestamptz,p_promo numeric,p_tip numeric)
returns uuid language plpgsql security invoker set search_path = ''
as $$
declare record_id uuid;
begin
 if p_promo is null or p_tip is null or p_promo<0 or p_tip<0
  or p_promo<>trunc(p_promo) or p_tip<>trunc(p_tip)
  or p_gross is null or p_promo+p_tip>p_gross
 then raise exception 'RS_INVALID_BREAKDOWN'; end if;
 record_id := public.rs_save_income_record(p_id,p_date,p_platform,p_gross,
   p_deliveries,p_expenses,p_note,p_expected_updated);
 update public.rider_earnings
 set promo_won=p_promo,tip_won=p_tip
 where id=record_id and user_id=auth.uid();
 if not found then raise exception 'RS_RECORD_NOT_FOUND'; end if;
 return record_id;
end;
$$;
revoke all on function public.rs_save_income_with_components(
 uuid,date,text,numeric,integer,numeric,text,timestamptz,numeric,numeric) from public,anon;
grant execute on function public.rs_save_income_with_components(
 uuid,date,text,numeric,integer,numeric,text,timestamptz,numeric,numeric) to authenticated;
