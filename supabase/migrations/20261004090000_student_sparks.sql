-- Student voice: what a student says lights them up ("sparks"), in their own
-- words and picks, so pathways grow from their real passions and not only
-- from the formal application.
--
-- New consent scope `student_voice`: the family agrees that the student's own
-- sparks may be recorded. Saving sparks needs it (trigger below); using them in
-- an AI draft additionally needs `ai_drafting` (checked by the app, as for all
-- drafting).
--
-- v1 is in person only: a staff member opens the Spark experience on their
-- own signed-in device with the student. Rows are written as that adult
-- (created_by = auth.uid()). There is no anonymous write path in this file.
-- A YouTube watch-history file, if a student uses one, is read entirely in
-- their browser; only the channel names they choose are stored, never history.

alter type public.consent_scope add value if not exists 'student_voice';

create table public.student_sparks (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  sparks jsonb not null check (octet_length(sparks::text) <= 20000),
  created_by uuid not null default auth.uid() references public.staff (user_id) on delete cascade,
  created_at timestamptz not null default now()
);
create index student_sparks_person on public.student_sparks (person_id, created_at desc);

alter table public.student_sparks enable row level security;

-- Any active staff member can sit with a student and save their sparks, as
-- themselves. Reading them is for staff who draft or teach.
create policy student_sparks_insert on public.student_sparks for insert to authenticated
  with check ((select private.is_staff()) and created_by = (select auth.uid()));
create policy student_sparks_read on public.student_sparks for select to authenticated
  using ((select private.has_role('admin', 'admissions', 'teacher')));
create policy student_sparks_delete on public.student_sparks for delete to authenticated
  using ((select private.has_role('admin')));

create trigger student_sparks_consent before insert or update on public.student_sparks
  for each row execute function private.enforce_consent('student_voice');
