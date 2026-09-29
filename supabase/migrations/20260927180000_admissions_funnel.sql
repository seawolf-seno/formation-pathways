-- Admissions season dashboard: whole-school admissions COUNTS from Finalsite.
--
-- This table holds aggregate numbers only — how many inquiries, applications,
-- admits and enrollments there were for an entering class as of a date. It
-- has no person, name, id or free text column, so it can never hold anything
-- about an individual family. It is deliberately separate from the pilot's
-- per-student tables and their consent rules, which it doesn't need.
--
-- Guardrails (enforced here, not just in the app):
--   * small-cell suppression: a count of 1–4 is refused; the importer stores
--     NULL ("fewer than 5") instead, so a small group can't identify anyone;
--   * live (non-sample) counts are refused until an admin records who
--     approved showing live Finalsite counts and where that approval lives —
--     a lighter sign-off than the pilot gate, but still a recorded one;
--   * admin and admissions can read; only admins write.

-- ---------------------------------------------------------------- approval

alter table pilot_settings
  add column funnel_live_enabled boolean not null default false,
  add column funnel_approved_by text,
  add column funnel_approval_reference text,
  add column funnel_approved_at timestamptz,
  add constraint funnel_approval_recorded check (
    not funnel_live_enabled
    or (funnel_approved_by is not null and funnel_approval_reference is not null
        and funnel_approved_at is not null)
  );

-- ---------------------------------------------------------------- counts

create type funnel_stage as enum ('inquiry', 'application', 'admitted', 'enrolled');

create table admissions_funnel_counts (
  -- The fall the class enters: 2027 = the 2026–27 admissions season.
  entry_year int not null check (entry_year between 2000 and 2100),
  stage funnel_stage not null,
  -- Everyone ('all') for now. 'pathway' / 'comparison' are reserved for
  -- measuring whether the family pathway experience changes yield, once
  -- that measurement is approved and designed (docs/admissions-season.md).
  cohort text not null default 'all' check (cohort in ('all', 'pathway', 'comparison')),
  -- Cumulative count for the season up to and including this date.
  as_of date not null,
  -- NULL = suppressed (1–4). Zero reveals nothing and is kept.
  count int check (count is null or count = 0 or count >= 5),
  is_sample boolean not null default false,
  imported_at timestamptz not null default now(),
  primary key (is_sample, entry_year, stage, cohort, as_of)
);

-- import_runs now logs both kinds of Finalsite run.
alter table import_runs
  add column kind text not null default 'people' check (kind in ('people', 'funnel'));

-- ---------------------------------------------------------------- gate

create function private.enforce_funnel_live_gate() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if not new.is_sample
     and not (select funnel_live_enabled from public.pilot_settings) then
    raise exception 'Live Finalsite counts are locked until approval is saved on the Admissions page'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

revoke all on function private.enforce_funnel_live_gate() from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function private.enforce_funnel_live_gate() from anon;
  end if;
end $$;
revoke all on function private.enforce_funnel_live_gate() from authenticated;

create trigger admissions_funnel_live_gate
  before insert or update on admissions_funnel_counts
  for each row execute function private.enforce_funnel_live_gate();

-- ---------------------------------------------------------------- RLS

alter table admissions_funnel_counts enable row level security;

create policy admissions_funnel_read on admissions_funnel_counts for select to authenticated
  using ((select private.has_role('admin', 'admissions')));
create policy admissions_funnel_admin_insert on admissions_funnel_counts for insert to authenticated
  with check ((select private.has_role('admin')));
create policy admissions_funnel_admin_update on admissions_funnel_counts for update to authenticated
  using ((select private.has_role('admin'))) with check ((select private.has_role('admin')));
create policy admissions_funnel_admin_delete on admissions_funnel_counts for delete to authenticated
  using ((select private.has_role('admin')));
