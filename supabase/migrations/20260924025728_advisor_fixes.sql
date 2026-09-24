-- Fixes from Supabase's security + performance advisors on the first apply of
-- 20260924025527_system_of_record.sql. No behavior change: every guardrail
-- test in supabase/tests/rls.test.mjs holds before and after.

-- ------------------------------------------------ security: helper functions
--
-- The SECURITY DEFINER helpers lived in `public`, so PostgREST exposed them as
-- /rest/v1/rpc/* (even to anon). Move them to a schema the API doesn't serve.
-- Policies and triggers reference functions by oid, so they follow the move.
-- Bodies are rewritten with an empty search_path and qualified names.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

alter function public.current_staff_role() set schema private;
alter function public.is_staff() set schema private;
alter function public.has_role(variadic staff_role[]) set schema private;
alter function public.has_consent(uuid, consent_scope) set schema private;
alter function public.enforce_real_data_gate() set schema private;
alter function public.enforce_consent() set schema private;

create or replace function private.current_staff_role() returns public.staff_role
  language sql stable security definer set search_path = '' as $$
  select role from public.staff where user_id = (select auth.uid()) and active
$$;

create or replace function private.is_staff() returns boolean
  language sql stable security definer set search_path = '' as $$
  select private.current_staff_role() is not null
$$;

create or replace function private.has_role(variadic roles public.staff_role[]) returns boolean
  language sql stable security definer set search_path = '' as $$
  select coalesce(private.current_staff_role() = any (roles), false)
$$;

-- Sample (fictional) people are treated as consented to everything.
create or replace function private.has_consent(p uuid, s public.consent_scope) returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.people where id = p and is_sample)
      or exists (select 1 from public.consents
                 where person_id = p and scope = s and revoked_at is null)
$$;

create or replace function private.enforce_real_data_gate() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if not new.is_sample
     and not (select real_data_enabled from public.pilot_settings) then
    raise exception 'Real students are locked until leadership sign-off is saved on the Pilot page'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace function private.enforce_consent() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare
  needed public.consent_scope := tg_argv[0]::public.consent_scope;
begin
  if not private.has_consent(new.person_id, needed) then
    raise exception 'No active % consent on file for this person', needed
      using errcode = 'P0001';
  end if;
  return new;
end $$;

-- RLS policies run the helpers as the signed-in user, so `authenticated`
-- keeps EXECUTE on those four. Nobody needs to call the trigger functions.
revoke all on function private.current_staff_role() from public;
revoke all on function private.is_staff() from public;
revoke all on function private.has_role(variadic public.staff_role[]) from public;
revoke all on function private.has_consent(uuid, public.consent_scope) from public;
revoke all on function private.enforce_real_data_gate() from public;
revoke all on function private.enforce_consent() from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on all functions in schema private from anon;
  end if;
end $$;
revoke all on function private.enforce_real_data_gate() from authenticated;
revoke all on function private.enforce_consent() from authenticated;
grant execute on function private.current_staff_role() to authenticated;
grant execute on function private.is_staff() to authenticated;
grant execute on function private.has_role(variadic public.staff_role[]) to authenticated;
grant execute on function private.has_consent(uuid, public.consent_scope) to authenticated;

alter function public.touch_updated_at() set search_path = '';

-- ------------------------------------------------ performance: FK indexes

create index consents_recorded_by on consents (recorded_by);
create index import_runs_started_by on import_runs (started_by);
create index observations_author on observations (author_id);
create index pathway_drafts_generated_by on pathway_drafts (generated_by);

-- ------------------------------------------------ performance: policies
--
-- (1) Wrap auth.uid() and the helpers in (select …) so Postgres evaluates them
--     once per statement, not once per row.
-- (2) The admin `for all` policies overlapped each read policy on SELECT. Every
--     read policy already admits admins, so admin writes become separate
--     insert/update/delete policies and each table has one SELECT policy.

drop policy pilot_settings_read on pilot_settings;
drop policy pilot_settings_admin on pilot_settings;
create policy pilot_settings_read on pilot_settings for select to authenticated
  using ((select private.is_staff()));
create policy pilot_settings_admin on pilot_settings for update to authenticated
  using ((select private.has_role('admin'))) with check ((select private.has_role('admin')));

drop policy staff_read on staff;
drop policy staff_admin on staff;
create policy staff_read on staff for select to authenticated
  using (user_id = (select auth.uid()) or (select private.has_role('admin')));

drop policy people_read on people;
drop policy people_admin on people;
create policy people_read on people for select to authenticated
  using ((select private.is_staff()));

drop policy external_ids_read on external_ids;
drop policy external_ids_admin on external_ids;
create policy external_ids_read on external_ids for select to authenticated
  using ((select private.has_role('admin', 'admissions')));

drop policy consents_read on consents;
drop policy consents_admin on consents;
create policy consents_read on consents for select to authenticated
  using ((select private.is_staff()));

-- Applicant essays are admissions-office material.
drop policy admissions_records_read on admissions_records;
drop policy admissions_records_admin on admissions_records;
create policy admissions_records_read on admissions_records for select to authenticated
  using ((select private.has_role('admin', 'admissions')));

drop policy enrollments_read on enrollments;
drop policy enrollments_admin on enrollments;
create policy enrollments_read on enrollments for select to authenticated
  using ((select private.is_staff()));

drop policy course_enrollments_read on course_enrollments;
drop policy course_enrollments_admin on course_enrollments;
create policy course_enrollments_read on course_enrollments for select to authenticated
  using ((select private.is_staff()));

drop policy academic_evidence_read on academic_evidence;
drop policy academic_evidence_admin on academic_evidence;
create policy academic_evidence_read on academic_evidence for select to authenticated
  using ((select private.has_role('admin', 'admissions', 'teacher')));

-- Admin-only writes on the tables above.
do $$
declare t text;
begin
  foreach t in array array['staff', 'people', 'external_ids', 'consents',
    'admissions_records', 'enrollments', 'course_enrollments', 'academic_evidence']
  loop
    execute format('create policy %I on %I for insert to authenticated
      with check ((select private.has_role(''admin'')))', t || '_admin_insert', t);
    execute format('create policy %I on %I for update to authenticated
      using ((select private.has_role(''admin''))) with check ((select private.has_role(''admin'')))',
      t || '_admin_update', t);
    execute format('create policy %I on %I for delete to authenticated
      using ((select private.has_role(''admin'')))', t || '_admin_delete', t);
  end loop;
end $$;

-- Any staff member can add an observation, only as themselves.
drop policy observations_read on observations;
drop policy observations_insert on observations;
drop policy observations_delete on observations;
create policy observations_read on observations for select to authenticated
  using ((select private.is_staff()));
create policy observations_insert on observations for insert to authenticated
  with check ((select private.is_staff()) and author_id = (select auth.uid()));
create policy observations_delete on observations for delete to authenticated
  using (author_id = (select auth.uid()) or (select private.has_role('admin')));

drop policy pathway_drafts_read on pathway_drafts;
drop policy pathway_drafts_insert on pathway_drafts;
drop policy pathway_drafts_approve on pathway_drafts;
create policy pathway_drafts_read on pathway_drafts for select to authenticated
  using ((select private.has_role('admin', 'admissions')));
create policy pathway_drafts_insert on pathway_drafts for insert to authenticated
  with check ((select private.has_role('admin', 'admissions')) and generated_by = (select auth.uid()));
create policy pathway_drafts_approve on pathway_drafts for update to authenticated
  using ((select private.has_role('admin', 'admissions')))
  with check ((select private.has_role('admin', 'admissions')));

drop policy import_runs_admin on import_runs;
create policy import_runs_admin on import_runs for all to authenticated
  using ((select private.has_role('admin'))) with check ((select private.has_role('admin')));

drop policy access_log_insert on access_log;
drop policy access_log_read on access_log;
create policy access_log_insert on access_log for insert to authenticated
  with check ((select private.is_staff()) and staff_id = (select auth.uid()));
create policy access_log_read on access_log for select to authenticated
  using ((select private.has_role('admin')));
-- Still no update/delete policies: the log is append-only for every app user.
