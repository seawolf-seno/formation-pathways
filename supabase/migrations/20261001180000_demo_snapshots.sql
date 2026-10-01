-- Fictional demo persistence (docs/oct-5-demo.md, "Where it runs").
--
-- The fictional exec demo runs on SQLite. On Vercel that file lives in
-- per-instance /tmp, so share links, approvals and captures made in the demo
-- could vanish or 404. The app now keeps ONE serialized copy of that SQLite
-- database here (base64 text) and reloads it on any instance that's behind.
--
-- FICTIONAL DATA ONLY. This table holds the demo's invented students and
-- applicants, never the system of record's. It is not a path for real
-- students (product principle #5): the demo screens say "fictional", and
-- real people belong only in the consented pilot tables.
--
-- Access: any ACTIVE staff member (private.is_staff(); pending accounts and
-- non-staff see nothing) may read and write, as themselves. No one deletes
-- through the API; reset it from the SQL editor (delete from demo_snapshots).

create table public.demo_snapshots (
  id smallint primary key default 1 check (id = 1),
  version bigint not null check (version > 0),
  db text not null check (length(db) <= 8000000),
  updated_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid() references auth.users (id) on delete cascade
);

alter table public.demo_snapshots enable row level security;

create policy demo_snapshots_read on public.demo_snapshots for select to authenticated
  using ((select private.is_staff()));
create policy demo_snapshots_insert on public.demo_snapshots for insert to authenticated
  with check ((select private.is_staff()) and updated_by = (select auth.uid()));
create policy demo_snapshots_update on public.demo_snapshots for update to authenticated
  using ((select private.is_staff()))
  with check ((select private.is_staff()) and updated_by = (select auth.uid()));
