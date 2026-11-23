-- RiderSpot v49. Device-only GPS: stop new cloud GPS persistence.
-- Existing remote completed routes and checkpoint rows are kept for migration.
-- Avoid deleting historical route points when a pre-v49 client writes again.
revoke insert, update on public.rider_trip_checkpoints from authenticated;
revoke insert, update on public.rider_trip_checkpoints from anon;

create or replace function public.rs_device_only_trip_points_v49()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.points := '[]'::jsonb;
  else
    -- Do not discard legacy route data during note/summary updates.
    new.points := old.points;
  end if;
  return new;
end;
$$;

drop trigger if exists rs_device_only_trip_points_v49 on public.trips;
create trigger rs_device_only_trip_points_v49
before insert or update of points on public.trips
for each row execute function public.rs_device_only_trip_points_v49();

create or replace function public.rs_remove_completed_trip_checkpoints()
returns trigger language plpgsql set search_path = ''
as $$
begin
  -- Never discard the only cloud copy while the device is being migrated.
  if new.ended_at is not null
     and jsonb_typeof(new.points) = 'array'
     and jsonb_array_length(new.points) > 0 then
    delete from public.rider_trip_checkpoints
    where user_id = new.user_id and trip_id = new.id;
  end if;
  return new;
end;
$$;
