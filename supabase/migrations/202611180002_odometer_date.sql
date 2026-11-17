alter table public.rider_vehicle_profiles add column if not exists odometer_recorded_on date;
create or replace function public.stamp_rider_odometer()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.odometer_km is null then
    new.odometer_recorded_on := null;
  elsif tg_op='INSERT' or new.odometer_km is distinct from old.odometer_km then
    new.odometer_recorded_on := (statement_timestamp() at time zone 'Asia/Seoul')::date;
  end if;
  return new;
end $$;
create trigger rider_odometer_date before insert or update of odometer_km on public.rider_vehicle_profiles
for each row execute function public.stamp_rider_odometer();
