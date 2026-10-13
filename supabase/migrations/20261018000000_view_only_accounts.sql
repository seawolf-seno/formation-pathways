-- View-only accounts: a `viewer` staff role for someone who needs to check
-- that the pages still work (a student contributor) without being able to
-- save, send or create anything, and without seeing a real student.
--
-- Default deny. A viewer is no longer "staff" as far as the database is
-- concerned: private.is_staff() is false for them and no has_role() list names
-- them, so every existing policy, and any written later the usual way, leaves
-- them out. What a viewer can do is only what this file grants:
--   - read fictional sample people, and the per-student rows a teacher can
--     read, for those sample people only;
--   - add their own rows to the access log, so their views are logged like
--     everyone else's.
-- Nothing here lets a viewer insert, update or delete anything else, and the
-- two delete rules that didn't check for staff access are tightened below.
--
-- An admin gives the role on /pilot. Nobody gets it by signing in.

alter type public.staff_role add value if not exists 'viewer';

-- The role is compared as text: Postgres refuses to use an enum value in the
-- same transaction that added it, and a migration runs as one.
create function private.is_viewer() returns boolean
  language sql stable security definer set search_path = '' as $$
  select coalesce(private.current_staff_role()::text = 'viewer', false)
$$;

create or replace function private.is_staff() returns boolean
  language sql stable security definer set search_path = '' as $$
  select coalesce(private.current_staff_role()::text <> 'viewer', false)
$$;

-- True only for a viewer looking at a fictional sample person.
create function private.viewer_sees(p uuid) returns boolean
  language sql stable security definer set search_path = '' as $$
  select private.is_viewer()
    and exists (select 1 from public.people where id = p and is_sample)
$$;

revoke all on function private.is_viewer() from public;
revoke all on function private.viewer_sees(uuid) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function private.is_viewer() from anon;
    revoke all on function private.viewer_sees(uuid) from anon;
  end if;
end $$;
grant execute on function private.is_viewer() to authenticated;
grant execute on function private.viewer_sees(uuid) to authenticated;

create policy people_viewer_read on public.people for select to authenticated
  using ((select private.is_viewer()) and is_sample);

-- The per-student tables a teacher can read. Not pathway drafts, admissions
-- records, external ids or Spark links, which teachers can't read either.
create policy consents_viewer_read on public.consents for select to authenticated
  using (private.viewer_sees(person_id));
create policy enrollments_viewer_read on public.enrollments for select to authenticated
  using (private.viewer_sees(person_id));
create policy course_enrollments_viewer_read on public.course_enrollments for select to authenticated
  using (private.viewer_sees(person_id));
create policy course_history_viewer_read on public.course_history for select to authenticated
  using (private.viewer_sees(person_id));
create policy observations_viewer_read on public.observations for select to authenticated
  using (private.viewer_sees(person_id));
create policy academic_evidence_viewer_read on public.academic_evidence for select to authenticated
  using (private.viewer_sees(person_id));
create policy student_sparks_viewer_read on public.student_sparks for select to authenticated
  using (private.viewer_sees(person_id));
create policy class_reflections_viewer_read on public.class_reflections for select to authenticated
  using (private.viewer_sees(person_id));
create policy class_resources_viewer_read on public.class_resources for select to authenticated
  using (private.viewer_sees(person_id));

create policy access_log_viewer_insert on public.access_log for insert to authenticated
  with check ((select private.is_viewer()) and staff_id = (select auth.uid()));

-- Two older rules let any signed-in account delete the rows it had made
-- itself, without checking that the account still has access. A teacher later
-- made view-only (or switched off) could still delete their own notes and
-- at-home links. Deleting your own now needs staff access too.
drop policy observations_delete on public.observations;
create policy observations_delete on public.observations for delete to authenticated
  using (((select private.is_staff()) and author_id = (select auth.uid())) or (select private.has_role('admin')));
drop policy spark_links_delete on public.spark_links;
create policy spark_links_delete on public.spark_links for delete to authenticated
  using ((select private.has_role('admin')) or ((select private.is_staff()) and created_by = (select auth.uid())));
