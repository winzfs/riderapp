-- Applied to Supabase rider-spot (migration 20261118165726).
-- Each completed ride is accounted once and retains fractional distance.
alter table public.rider_vehicle_profiles
  add column if not exists odometer_trip_carry_km numeric(7,3) not null default 0,
  add column if not exists odometer_manual_updated_at timestamptz;

create table if not exists public.rider_trip_odometer_entries (
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid not null,
  distance_km numeric(9,3) not null check (distance_km >= 0 and distance_km <= 2000),
  skipped_after_manual boolean not null default false,
  applied_at timestamptz not null default now(),
  primary key (user_id,trip_id)
);
alter table public.rider_trip_odometer_entries enable row level security;
create policy rider_trip_odo_owner_select on public.rider_trip_odometer_entries
  for select to authenticated using (user_id = (select auth.uid()));
create policy rider_trip_odo_owner_insert on public.rider_trip_odometer_entries
  for insert to authenticated with check (user_id = (select auth.uid()));
grant select,insert on public.rider_trip_odometer_entries to authenticated;

create or replace function public.set_rider_manual_odometer(p_km integer)
returns integer language plpgsql security invoker set search_path = '' as $$
declare owner_id uuid := (select auth.uid());
begin
  if owner_id is null or p_km is null or p_km not between 0 and 9999999 then
    raise exception 'Invalid odometer value';
  end if;
  insert into public.rider_vehicle_profiles(user_id, vehicle_name, odometer_km,
       odometer_trip_carry_km, odometer_manual_updated_at)
  values(owner_id, '내 오토바이', p_km, 0, clock_timestamp())
  on conflict (user_id) do update
  set odometer_km=excluded.odometer_km,
      odometer_trip_carry_km=0,
      odometer_manual_updated_at=clock_timestamp();
  return p_km;
end $$;
revoke all on function public.set_rider_manual_odometer(integer) from public, anon;
grant execute on function public.set_rider_manual_odometer(integer) to authenticated;

create or replace function public.apply_rider_trip_odometer(
  p_trip_id uuid, p_distance_km numeric, p_ended_at timestamptz
) returns integer language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := (select auth.uid());
  bike record;
  finished_km numeric(9,3);
  total numeric(10,3);
  step integer;
  skip_trip boolean;
begin
  if owner_id is null or p_trip_id is null or p_ended_at is null
    or p_ended_at > clock_timestamp() + interval '1 day'
    or p_distance_km is null or p_distance_km < 0 or p_distance_km > 2000 then
    raise exception 'Invalid completed trip mileage';
  end if;
  finished_km := round(p_distance_km,3);
  select odometer_km,odometer_trip_carry_km,odometer_manual_updated_at into bike
    from public.rider_vehicle_profiles where user_id=owner_id for update;
  if not found or bike.odometer_km is null then return null; end if;
  skip_trip := bike.odometer_manual_updated_at is not null
               and p_ended_at <= bike.odometer_manual_updated_at;
  insert into public.rider_trip_odometer_entries(user_id,trip_id,distance_km,skipped_after_manual)
    values(owner_id,p_trip_id,finished_km,skip_trip)
    on conflict (user_id,trip_id) do nothing;
  if not found or skip_trip then return bike.odometer_km; end if;
  total := coalesce(bike.odometer_trip_carry_km,0) + finished_km;
  step := floor(total)::integer;
  if bike.odometer_km + step > 9999999 then
    raise exception 'Odometer exceeds the supported range';
  end if;
  update public.rider_vehicle_profiles
     set odometer_km=bike.odometer_km+step,
         odometer_trip_carry_km=total-step
   where user_id=owner_id;
  return bike.odometer_km+step;
end $$;
revoke all on function public.apply_rider_trip_odometer(uuid,numeric,timestamptz) from public, anon;
grant execute on function public.apply_rider_trip_odometer(uuid,numeric,timestamptz) to authenticated;
