-- Active-trip backup segments. Completions continue to live ONLY in public.trips.
-- Each segment holds up to 180 accepted GPS fixes (small, incremental, retry-safe).
create table if not exists public.rider_trip_checkpoints (
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid not null,
  first_seq bigint not null check (first_seq >= 1),
  last_seq bigint not null check (last_seq >= first_seq),
  started_at timestamptz not null,
  last_point_at timestamptz not null,
  points jsonb not null
    check (jsonb_typeof(points) = 'array' and jsonb_array_length(points) between 1 and 180),
  events jsonb not null default '[]'::jsonb
    check (jsonb_typeof(events) = 'array' and jsonb_array_length(events) <= 100),
  distance_km numeric(10,2) not null default 0
    check(distance_km between 0 and 100000),
  saved_at timestamptz not null default now(),
  primary key(user_id,trip_id,first_seq),
  constraint rider_trip_checkpoint_after_start check(last_point_at >= started_at)
);
create index if not exists rider_trip_checkpoint_last_idx
  on public.rider_trip_checkpoints(user_id, trip_id, last_seq desc);

alter table public.rider_trip_checkpoints enable row level security;
revoke all on public.rider_trip_checkpoints from public, anon, authenticated;
grant select, insert, update, delete on public.rider_trip_checkpoints to authenticated;

drop policy if exists rider_trip_checkpoint_select on public.rider_trip_checkpoints;
create policy rider_trip_checkpoint_select on public.rider_trip_checkpoints
  for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists rider_trip_checkpoint_insert on public.rider_trip_checkpoints;
create policy rider_trip_checkpoint_insert on public.rider_trip_checkpoints
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and not exists (
      select 1 from public.trips t
      where t.id = trip_id and t.user_id = user_id and t.ended_at is not null
    )
  );
drop policy if exists rider_trip_checkpoint_update on public.rider_trip_checkpoints;
create policy rider_trip_checkpoint_update on public.rider_trip_checkpoints
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and not exists (
      select 1 from public.trips t
      where t.id = trip_id and t.user_id = user_id and t.ended_at is not null
    )
  );
drop policy if exists rider_trip_checkpoint_delete on public.rider_trip_checkpoints;
create policy rider_trip_checkpoint_delete on public.rider_trip_checkpoints
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Final trip upsert means checkpoint data is redundant. Remove it in the
-- same transaction, only AFTER the final trip has been persisted successfully.
create or replace function public.rs_remove_completed_trip_checkpoints()
returns trigger
language plpgsql security invoker
set search_path = ''
as $$
begin
  if new.ended_at is not null then
    delete from public.rider_trip_checkpoints
      where user_id = new.user_id and trip_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.rs_remove_completed_trip_checkpoints() from public,anon;
drop trigger if exists rs_completed_trip_cleanup_checkpoints on public.trips;
create trigger rs_completed_trip_cleanup_checkpoints
  after insert or update of ended_at on public.trips
  for each row execute function public.rs_remove_completed_trip_checkpoints();
