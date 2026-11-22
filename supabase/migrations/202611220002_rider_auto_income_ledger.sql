-- Rider Spot per-delivery accessibility income; additive, idempotent, no manual income overwrite.
alter table public.rider_earnings
  add column if not exists source_type text not null default 'manual';
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname='rider_earnings_source_type_check'
  ) then
    alter table public.rider_earnings add constraint rider_earnings_source_type_check
      check (source_type in ('manual','auto'));
  end if;
end $$;

create table if not exists public.rider_auto_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capture_id text not null,
  captured_at timestamptz not null,
  work_date date not null,
  platform text not null check(platform in ('쿠팡이츠','배민')),
  gross_won integer not null check (gross_won between 500 and 150000),
  base_won integer not null default 0 check(base_won between 0 and 150000),
  extra_won integer not null default 0 check(extra_won between 0 and 150000),
  reward_won integer not null default 0 check(reward_won between 0 and 150000),
  status text not null check(status in ('applied','needs_review','covered','rejected')),
  earning_id uuid references public.rider_earnings(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(user_id,capture_id),
  constraint rs_auto_components_sum check(base_won+extra_won+reward_won=gross_won)
);
create index if not exists rider_auto_deliveries_user_day_idx
  on public.rider_auto_deliveries(user_id,work_date desc,created_at desc);
alter table public.rider_auto_deliveries enable row level security;
drop policy if exists rs_auto_delivery_read_own on public.rider_auto_deliveries;
create policy rs_auto_delivery_read_own
on public.rider_auto_deliveries for select to authenticated
using ((select auth.uid())=user_id);
revoke all on public.rider_auto_deliveries from public,anon,authenticated;
grant select on public.rider_auto_deliveries to authenticated;

create or replace function public.rs_append_auto_income(
  p_capture_id text, p_captured_at timestamptz, p_platform text,
  p_amount integer, p_base integer, p_extra integer, p_reward integer
) returns jsonb language plpgsql security definer set search_path=''
as $rs$
declare
  owner uuid := auth.uid();
  day date;
  prior public.rider_auto_deliveries%rowtype;
  earning uuid;
  record_id uuid;
  conflicting boolean;
begin
  if owner is null then raise exception 'RS_LOGIN_REQUIRED'; end if;
  if p_capture_id is null or p_capture_id !~ '^[0-9]{10,17}-[0-9]{1,6}$'
    or length(p_capture_id)>48
    or p_platform not in ('쿠팡이츠','배민')
    or p_amount is null or p_amount not between 500 and 150000
    or p_base is null or p_extra is null or p_reward is null
    or p_base<0 or p_extra<0 or p_reward<0
    or p_base+p_extra+p_reward<>p_amount
    or p_captured_at is null
    or p_captured_at < now()-interval '7 days'
    or p_captured_at > now()+interval '10 minutes'
  then raise exception 'RS_AUTO_INVALID_CAPTURE'; end if;
  day := ((p_captured_at at time zone 'Asia/Seoul') - interval '3 hours')::date;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(owner::text || ':' || p_platform || ':' || day::text,0));
  select * into prior from public.rider_auto_deliveries
  where user_id=owner and capture_id=p_capture_id for update;
  if found then
    if prior.platform<>p_platform or prior.gross_won<>p_amount or
      prior.base_won<>p_base or prior.extra_won<>p_extra or
      prior.reward_won<>p_reward
    then raise exception 'RS_AUTO_CAPTURE_COLLISION'; end if;
    return jsonb_build_object('created',false,'status',prior.status,
        'applied',prior.status='applied','capture_id',p_capture_id,'work_date',prior.work_date);
  end if;
  select exists(
    select 1 from public.rider_earnings
    where user_id=owner and work_date=day and platform=p_platform
      and source_type='manual' and gross_entered=true
  ) or exists(
    select 1 from public.rider_earnings
    where user_id=owner and work_date=day and platform=p_platform
      and source_type='auto' and paid_at is not null
  ) into conflicting;
  insert into public.rider_auto_deliveries
   (user_id,capture_id,captured_at,work_date,platform,gross_won,base_won,extra_won,reward_won,status)
  values(owner,p_capture_id,p_captured_at,day,p_platform,p_amount,p_base,p_extra,p_reward,
      case when conflicting then 'needs_review' else 'applied' end)
  returning id into record_id;
  if conflicting then
    return jsonb_build_object('created',true,'status','needs_review','applied',false,
      'capture_id',p_capture_id,'work_date',day);
  end if;
  select id into earning from public.rider_earnings
    where user_id=owner and work_date=day and platform=p_platform and source_type='auto'
    order by created_at limit 1 for update;
  if earning is null then
    insert into public.rider_earnings
      (user_id,work_date,platform,gross_won,deliveries,gross_entered,expense_scope,
       note,source_type,promo_won)
    values(owner,day,p_platform,p_amount,1,true,'other_only',
      '자동 수집 배달료 · 건별 원장 연동','auto',p_reward)
    returning id into earning;
  else
    update public.rider_earnings
    set gross_won=gross_won+p_amount,deliveries=deliveries+1,
      promo_won=promo_won+p_reward,updated_at=now()
    where id=earning and user_id=owner;
  end if;
  update public.rider_auto_deliveries set earning_id=earning where id=record_id;
  return jsonb_build_object('created',true,'status','applied','applied',true,
    'capture_id',p_capture_id,'work_date',day);
end;
$rs$;
revoke all on function public.rs_append_auto_income(text,timestamptz,text,integer,integer,integer,integer)
 from public,anon;
grant execute on function public.rs_append_auto_income(text,timestamptz,text,integer,integer,integer,integer)
 to authenticated;

create or replace function public.rs_resolve_auto_income(p_capture_id text,p_choice text)
returns jsonb language plpgsql security definer set search_path=''
as $rs$
declare
 owner uuid:=auth.uid();
 entry public.rider_auto_deliveries%rowtype;
 earning uuid;
begin
 if owner is null then raise exception 'RS_LOGIN_REQUIRED';end if;
 if p_choice not in ('include','covered','reject') then raise exception 'RS_AUTO_INVALID_CHOICE';end if;
 select * into entry from public.rider_auto_deliveries
   where user_id=owner and capture_id=p_capture_id for update;
 if not found then raise exception 'RS_AUTO_NOT_FOUND';end if;
 perform pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended(owner::text || ':' || entry.platform || ':' || entry.work_date::text,0));
 select * into entry from public.rider_auto_deliveries
   where user_id=owner and capture_id=p_capture_id for update;
 if entry.status<>'needs_review' then
   return jsonb_build_object('status',entry.status,'applied',entry.status='applied');
 end if;
 if p_choice='covered' or p_choice='reject' then
   update public.rider_auto_deliveries
    set status=case when p_choice='covered' then 'covered' else 'rejected' end
    where id=entry.id;
   return jsonb_build_object('status',case when p_choice='covered' then 'covered' else 'rejected' end,'applied',false);
 end if;
 if exists(select 1 from public.rider_earnings
    where user_id=owner and platform=entry.platform and work_date=entry.work_date and paid_at is not null)
 then raise exception 'RS_SETTLED_INCOME'; end if;
 select id into earning from public.rider_earnings
    where user_id=owner and work_date=entry.work_date and platform=entry.platform
       and source_type='auto'
    order by created_at limit 1 for update;
 if earning is null then
   insert into public.rider_earnings
     (user_id,work_date,platform,gross_won,deliveries,gross_entered,expense_scope,
      note,source_type,promo_won)
   values(owner,entry.work_date,entry.platform,entry.gross_won,1,true,'other_only',
      '자동 수집 배달료 · 건별 원장 연동','auto',entry.reward_won)
   returning id into earning;
 else
   update public.rider_earnings set gross_won=gross_won+entry.gross_won,
     deliveries=deliveries+1,promo_won=promo_won+entry.reward_won,updated_at=now()
   where id=earning and user_id=owner;
 end if;
 update public.rider_auto_deliveries set status='applied',earning_id=earning
   where id=entry.id;
 return jsonb_build_object('status','applied','applied',true);
end;
$rs$;
revoke all on function public.rs_resolve_auto_income(text,text) from public,anon;
grant execute on function public.rs_resolve_auto_income(text,text) to authenticated;
