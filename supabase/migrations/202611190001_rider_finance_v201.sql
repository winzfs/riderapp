-- Rider Spot finance v201: additive schema only; scheduled amounts are not posted automatically.
create table if not exists public.rider_recurring_expenses(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check(char_length(category) between 1 and 40),
  amount_won integer not null check(amount_won between 1 and 100000000),
  day_of_month smallint not null check(day_of_month between 1 and 31),
  memo text not null default '' check(char_length(memo)<=300),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rider_recurring_expenses_owned_key unique(id,user_id)
);
alter table public.rider_recurring_expenses enable row level security;
do $$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='rider_recurring_expenses' and policyname='recurring_expenses_select_own') then
    create policy recurring_expenses_select_own on public.rider_recurring_expenses for select to authenticated using(user_id=(select auth.uid()));
    create policy recurring_expenses_insert_own on public.rider_recurring_expenses for insert to authenticated with check(user_id=(select auth.uid()));
    create policy recurring_expenses_update_own on public.rider_recurring_expenses for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
    create policy recurring_expenses_delete_own on public.rider_recurring_expenses for delete to authenticated using(user_id=(select auth.uid()));
  end if;
end $$;
grant select,insert,update,delete on public.rider_recurring_expenses to authenticated;

alter table public.rider_extra_expenses add column if not exists recurrence_id uuid;
alter table public.rider_extra_expenses add column if not exists recurrence_month date;
do $$ begin
  if not exists(select 1 from pg_constraint where conname='rider_extra_recurring_pair') then
    alter table public.rider_extra_expenses add constraint rider_extra_recurring_pair check(
      (recurrence_id is null and recurrence_month is null) or
      (recurrence_id is not null and recurrence_month is not null and recurrence_month=date_trunc('month',recurrence_month)::date)
    );
  end if;
  if not exists(select 1 from pg_constraint where conname='rider_extra_recurring_owner') then
    alter table public.rider_extra_expenses add constraint rider_extra_recurring_owner
      foreign key(recurrence_id,user_id) references public.rider_recurring_expenses(id,user_id)
      on delete set null(recurrence_id);
  end if;
end $$;
create unique index if not exists rider_extra_recurring_once_per_month
  on public.rider_extra_expenses(recurrence_id,recurrence_month) where recurrence_id is not null;

create table if not exists public.rider_finance_payout_rules(
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check(platform in ('쿠팡이츠','배민','기타')),
  cycle text not null default 'none' check(cycle in ('none','weekly','monthly')),
  weekday smallint check(weekday between 0 and 6),
  month_day smallint check(month_day between 1 and 31),
  updated_at timestamptz not null default now(),
  primary key(user_id,platform),
  constraint rider_payout_cycle_fields check(
    (cycle='none' and weekday is null and month_day is null) or
    (cycle='weekly' and weekday is not null and month_day is null) or
    (cycle='monthly' and weekday is null and month_day is not null))
);
alter table public.rider_finance_payout_rules enable row level security;
do $$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='rider_finance_payout_rules' and policyname='payout_rules_select_own') then
    create policy payout_rules_select_own on public.rider_finance_payout_rules for select to authenticated using(user_id=(select auth.uid()));
    create policy payout_rules_insert_own on public.rider_finance_payout_rules for insert to authenticated with check(user_id=(select auth.uid()));
    create policy payout_rules_update_own on public.rider_finance_payout_rules for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
    create policy payout_rules_delete_own on public.rider_finance_payout_rules for delete to authenticated using(user_id=(select auth.uid()));
  end if;
end $$;
grant select,insert,update,delete on public.rider_finance_payout_rules to authenticated;
alter table public.rider_finance_goals add column if not exists goal_basis text not null default 'gross'
  check(goal_basis in ('gross','net'));
