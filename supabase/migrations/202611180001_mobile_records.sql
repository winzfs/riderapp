alter table public.maintenance_logs
  add column if not exists service_items text[],
  add column if not exists workshop text,
  alter column cost_won drop not null;
alter table public.rider_earnings add column if not exists gross_entered boolean not null default true;

-- Serialize same-day quick edits and preserve legacy per-shift detail rows.
create or replace function public.set_rider_daily_income(p_date date, p_values jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  platform_key text;
  target numeric;
  remaining numeric;
  entry record;
begin
  if owner_id is null or p_date is null or jsonb_typeof(p_values) is distinct from 'object' then
    raise exception 'Invalid account or date';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text || p_date::text, 0));
  for platform_key in select jsonb_object_keys(p_values) loop
    if platform_key not in ('쿠팡이츠','배민') then raise exception 'Invalid platform'; end if;
    target := (p_values ->> platform_key)::numeric;
    if target <> trunc(target) or target not between 0 and 100000000 then raise exception 'Invalid amount'; end if;
    remaining := target;
    for entry in select id,gross_won from public.rider_earnings
        where user_id=owner_id and work_date=p_date and platform=platform_key
        order by created_at,id for update loop
      update public.rider_earnings set gross_won=least(coalesce(remaining,0),entry.gross_won),
        gross_entered=(target is not null) where id=entry.id;
      remaining := remaining - least(remaining,entry.gross_won);
    end loop;
    if not found then
      if target is not null then
        insert into public.rider_earnings(user_id,work_date,platform,gross_won,expense_scope)
        values(owner_id,p_date,platform_key,target,'other_only');
      end if;
    elsif remaining > 0 then
      update public.rider_earnings set gross_won=gross_won+remaining where id=entry.id;
    end if;
  end loop;
end $$;
revoke all on function public.set_rider_daily_income(date,jsonb) from public,anon;
grant execute on function public.set_rider_daily_income(date,jsonb) to authenticated;
