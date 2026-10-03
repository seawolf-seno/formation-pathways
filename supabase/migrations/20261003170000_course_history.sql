-- A student's class history from Blackbaud (course sections by school year),
-- so "where they are now" shows more than one Canvas course. Course titles,
-- codes and offering type (Academics, Arts, Athletics…) only: never grades,
-- scores, attendance or teachers' notes.
--
-- Same protections as course_enrollments: any active staff member reads,
-- only admins write (importers run as the signed-in admin), and a trigger
-- refuses rows for anyone without import_records consent.

create table public.course_history (
  person_id uuid not null references public.people (id) on delete cascade,
  source public.source_system not null default 'blackbaud',
  section_id text not null,
  school_year text not null,
  course_title text not null,
  course_code text,
  offering_type text,
  imported_at timestamptz not null default now(),
  primary key (person_id, source, section_id)
);
create index course_history_person on public.course_history (person_id, school_year);

alter table public.course_history enable row level security;

create policy course_history_read on public.course_history for select to authenticated
  using ((select private.is_staff()));
create policy course_history_admin_insert on public.course_history for insert to authenticated
  with check ((select private.has_role('admin')));
create policy course_history_admin_update on public.course_history for update to authenticated
  using ((select private.has_role('admin'))) with check ((select private.has_role('admin')));
create policy course_history_admin_delete on public.course_history for delete to authenticated
  using ((select private.has_role('admin')));

create trigger course_history_consent before insert or update on public.course_history
  for each row execute function private.enforce_consent('import_records');
