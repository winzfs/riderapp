-- Hosted project qkcqzhkvfbymzjdktshp: already applied through Supabase migrations on 2026-11-18.
-- Migration reference for the studio branch; do not re-run policy creation as-is.
create table if not exists public.rider_spot_studio_records (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check (kind in ('rider','post','trip','earning','maintenance','qa','bug','release','bike')),
 payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload)='object'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists rider_spot_studio_records_owner_kind_updated_idx on public.rider_spot_studio_records(owner_id,kind,updated_at desc);
alter table public.rider_spot_studio_records enable row level security;
revoke all on public.rider_spot_studio_records from anon,authenticated;
grant select,insert,update,delete on public.rider_spot_studio_records to authenticated;
create policy studio_read_own on public.rider_spot_studio_records for select to authenticated using ((select auth.uid())=owner_id);
create policy studio_add_own on public.rider_spot_studio_records for insert to authenticated with check ((select auth.uid())=owner_id);
create policy studio_edit_own on public.rider_spot_studio_records for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy studio_delete_own on public.rider_spot_studio_records for delete to authenticated using ((select auth.uid())=owner_id) ;
