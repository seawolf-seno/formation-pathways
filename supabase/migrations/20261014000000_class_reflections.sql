-- Class reflections: which of their classes a student enjoys, and what makes
-- each one good for them, in their own words and picks. Courses alone say
-- little about a student (nearly every classmate takes the same ones); what
-- they enjoy in a class is theirs alone, so pathways can grow from it.
--
-- Enjoyment only: a class the student doesn't choose is simply not recorded.
-- There is no rating, no number and no "didn't like it" (product principles
-- 2 and 6), and nothing about how the student is doing in the class.
--
-- Same protections as student_sparks. It is the student's own voice, so
-- saving needs the `student_voice` consent (trigger below); using it in an AI
-- draft additionally needs `ai_drafting` (checked by the app, as for all
-- drafting). In person only: a staff member opens the page on their own
-- signed-in device with the student, and rows are written as that adult
-- (created_by = auth.uid()). There is no anonymous or student write path.

create table public.class_reflections (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  -- { "classes": [{ key, title, schoolYear, loved, liked[], note, via }] }
  reflections jsonb not null check (
    octet_length(reflections::text) <= 20000
    and jsonb_typeof(reflections) = 'object'
    and jsonb_typeof(reflections -> 'classes') = 'array'
  ),
  -- restrict, not cascade: a student's words outlive the staff account that
  -- saved them (deactivate staff instead of deleting them).
  created_by uuid not null default auth.uid() references public.staff (user_id) on delete restrict,
  created_at timestamptz not null default now()
);
create index class_reflections_person on public.class_reflections (person_id, created_at desc);

alter table public.class_reflections enable row level security;

-- Any active staff member can sit with a student and save their reflections,
-- as themselves. Reading them is for staff who draft or teach.
create policy class_reflections_insert on public.class_reflections for insert to authenticated
  with check ((select private.is_staff()) and created_by = (select auth.uid()));
create policy class_reflections_read on public.class_reflections for select to authenticated
  using ((select private.has_role('admin', 'admissions', 'teacher')));
create policy class_reflections_delete on public.class_reflections for delete to authenticated
  using ((select private.has_role('admin')));

create trigger class_reflections_consent before insert or update on public.class_reflections
  for each row execute function private.enforce_consent('student_voice');

-- New tables are no longer granted to the Data API automatically. No update
-- grant: a saved reflection is never edited, a new sitting adds a row.
grant select, insert, delete on public.class_reflections to authenticated;
