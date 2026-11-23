-- RiderSpot v52: restore owner-scoped non-GPS account records from a device file.
-- Strict allowlist, matching authenticated account, no overwrites, no deletes,
-- all changes in one SQL transaction, and no GPS data ever written to server.
create or replace function public.rs_restore_account_backup_v52(
  p_account_id uuid,
  p_tables jsonb
) returns jsonb
language plpgsql security definer set search_path=''
as $rs$
declare
  owner uuid := auth.uid();
  table_name text;
  row_data jsonb;
  table_rows jsonb;
  total integer := 0;
  restored integer := 0;
  ignored integer := 0;
  affected integer;
  ordered_tables constant text[] := array[
    'rider_profiles',
    'rider_settings',
    'rider_vehicle_profiles',
    'rider_finance_goals',
    'rider_finance_payout_rules',
    'rider_recurring_expenses',
    'rider_earnings',
    'rider_auto_deliveries',
    'rider_fuel_logs',
    'rider_extra_expenses',
    'maintenance_logs',
    'rider_maintenance_cycles',
    'rider_model_maintenance_settings',
    'rider_trip_odometer_entries',
    'rider_places',
    'rider_bookmarks'
  ];
begin
  if owner is null or p_account_id is distinct from owner
     or pg_catalog.jsonb_typeof(p_tables) is distinct from 'object'
     or pg_catalog.pg_column_size(p_tables)>6500000
  then raise exception 'RS_BACKUP_ACCOUNT_OR_FORMAT_INVALID'; end if;
  if exists (
    select 1 from pg_catalog.jsonb_object_keys(p_tables) k
    where not k = any(ordered_tables)
  ) then raise exception 'RS_BACKUP_UNSUPPORTED_TABLE'; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('riderspot-backup-v52:'||owner::text,0));
  foreach table_name in array ordered_tables loop
    table_rows:=p_tables->table_name;
    if table_rows is null then continue; end if;
    if pg_catalog.jsonb_typeof(table_rows) <> 'array'
       or pg_catalog.jsonb_array_length(table_rows)>5000
    then raise exception 'RS_BACKUP_TABLE_INVALID: %',table_name;end if;
    for row_data in
      select value from pg_catalog.jsonb_array_elements(table_rows)
    loop
      total:=total+1;
      if total>12000 or pg_catalog.jsonb_typeof(row_data)<>'object'
         or row_data->>'user_id' is distinct from owner::text
      then raise exception 'RS_BACKUP_ROW_OR_OWNER_INVALID';end if;
      if table_name='rider_auto_deliveries'
         and row_data->>'earning_id' is not null
         and not exists (
           select 1 from public.rider_earnings
           where id=(row_data->>'earning_id')::uuid
             and user_id=owner
         )
      then raise exception 'RS_BACKUP_INCOME_LINK_INVALID';end if;
      -- Known table names only. jsonb_populate_record ignores unknown fields.
      -- ON CONFLICT DO NOTHING prevents duplicate earnings/auto delivery IDs
      -- and never changes a newer record already in the account.
      execute pg_catalog.format(
        'insert into public.%I select * from pg_catalog.jsonb_populate_record(null::public.%I,$1) on conflict do nothing',
        table_name,table_name
      ) using row_data;
      get diagnostics affected=row_count;
      restored:=restored+affected;
      ignored:=ignored+1-affected;
    end loop;
  end loop;
  return pg_catalog.jsonb_build_object(
    'restored',restored,'already_present',ignored,'source_rows',total,
    'gps_on_device_only',true);
end;
$rs$;

revoke all on function public.rs_restore_account_backup_v52(uuid,jsonb)
  from public,anon;
grant execute on function public.rs_restore_account_backup_v52(uuid,jsonb)
  to authenticated;
