-- Mastery Hub (Fizzy #37): standards-based grading for one teacher's course,
-- with evidence from Canvas, AP Classroom / Khan Academy exports, oral exams
-- and what students send in, and a sign-in for students to see their own.
--
-- This is the ONE place in Formation Pathways that holds scores. seno decided
-- (2026-10-12) that a mastery course keeps raw scores beside the level words,
-- because a grade a student can't trace to its evidence isn't fair. They stay
-- here: nothing in these tables reaches a Pathway page, a family page, or an
-- AI call. Pathways still show no numbers (product principle 2).
--
-- Guardrails in the database:
--   * a new consent scope, `mastery_records`, is needed for a real student to
--     be on a mastery roster, to have evidence, to get a student sign-in, or
--     to send a request (sample people are consented to everything);
--   * evidence is only for students on that course's roster, and a sample
--     course holds only sample students;
--   * only the course's own teacher (or an admin) reads or changes a course;
--   * a student signs in with their school address and sees only their own
--     courses, evidence and requests: no staff table, no other student;
--   * evidence is never edited (add a new piece, or delete with a log entry);
--   * every change is written to mastery_log by triggers; nobody can edit or
--     delete the log.

alter type public.consent_scope add value if not exists 'mastery_records';

-- ------------------------------------------------------------------ tables

create table public.mastery_courses (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 120),
  -- The course's address: /mastery/APPhysics1, /me/APPhysics1. Unique in any
  -- capitalization, so a new class is just a new name.
  slug text not null check (slug ~ '^[A-Za-z][A-Za-z0-9-]{1,39}$'),
  -- Which standards file in fixtures/mastery/ this course uses.
  config_key text not null check (config_key ~ '^[a-z0-9-]{1,60}$'),
  teacher_id uuid not null default auth.uid() references public.staff (user_id) on delete restrict,
  canvas_course_id text check (canvas_course_id ~ '^[0-9]{1,20}$'),
  is_sample boolean not null default false,
  -- The last unit the class has finished (null: not set). Finished units are
  -- what every student should have by now, so they lead next steps and the
  -- video shelf.
  finished_through int check (finished_through between 0 and 99),
  created_at timestamptz not null default now()
);
create unique index mastery_courses_slug on public.mastery_courses (lower(slug));

create table public.mastery_roster (
  course_id uuid not null references public.mastery_courses (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (course_id, person_id)
);
create index mastery_roster_person on public.mastery_roster (person_id);

-- A student's sign-in: their school address, tied to their one people row.
-- Matched against the confirmed address of the signed-in account, so the
-- student proves they own it (email code or Google), never a password here.
create table public.student_accounts (
  person_id uuid primary key references public.people (id) on delete cascade,
  email text not null unique check (
    email = lower(trim(email)) and email like '%_@pacificachristian.org'
  ),
  active boolean not null default true,
  created_by uuid not null default auth.uid() references public.staff (user_id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.mastery_evidence (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.mastery_courses (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  standard_code text not null check (standard_code ~ '^[A-Za-z0-9.-]{1,20}$'),
  source text not null check (source in
    ('canvas', 'ap_classroom', 'khan', 'phet', 'openstax', 'oral', 'observation', 'student', 'other')),
  title text not null check (length(trim(title)) between 1 and 200),
  score numeric check (score >= 0),
  max_score numeric check (max_score > 0),
  level text check (level in ('beginning', 'developing', 'proficient', 'extending')),
  note text check (length(note) <= 2000),
  link text check (link ~ '^https://[^\s@]+$' and length(link) <= 500),
  occurred_at timestamptz not null default now(),
  -- An import's own id for the row (e.g. canvas:assignment:123), so running
  -- the same import twice adds nothing.
  external_key text check (length(external_key) <= 200),
  recorded_by uuid not null default auth.uid() references public.staff (user_id) on delete restrict,
  created_at timestamptz not null default now(),
  check (level is not null or (score is not null and max_score is not null)),
  check (score is null or max_score is null or score <= max_score * 2)
);
create index mastery_evidence_course on public.mastery_evidence (course_id, person_id, standard_code, occurred_at desc);
create unique index mastery_evidence_once
  on public.mastery_evidence (course_id, person_id, standard_code, external_key)
  where external_key is not null;

-- A student asks for an oral exam on a standard, or sends something they did
-- (a PhET lab, an OpenStax section, an AP Classroom report) for the teacher
-- to look at. Only an accepted piece becomes evidence, written by the teacher.
create table public.mastery_requests (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.mastery_courses (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  standard_code text not null check (standard_code ~ '^[A-Za-z0-9.-]{1,20}$'),
  kind text not null check (kind in ('oral_exam', 'evidence')),
  message text not null default '' check (length(message) <= 1000),
  link text check (link ~ '^https://[^\s@]+$' and length(link) <= 500),
  status text not null default 'open' check (status in ('open', 'scheduled', 'accepted', 'declined', 'done')),
  response text check (length(response) <= 1000),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  resolved_by uuid references public.staff (user_id) on delete set null,
  resolved_at timestamptz
);
create index mastery_requests_course on public.mastery_requests (course_id, status, created_at desc);

-- On/off switch and last run for each automatic source of a course.
create table public.mastery_sources (
  course_id uuid not null references public.mastery_courses (id) on delete cascade,
  source text not null check (source in ('canvas', 'ap_classroom', 'khan')),
  paused boolean not null default false,
  last_run_at timestamptz,
  last_summary text check (length(last_summary) <= 500),
  primary key (course_id, source)
);

-- Who did what, when. person_id is deliberately not a foreign key, so a
-- student's removal stays auditable (same as access_log).
create table public.mastery_log (
  id bigint generated always as identity primary key,
  course_id uuid not null,
  person_id uuid,
  actor uuid default auth.uid(),
  action text not null check (length(action) <= 60),
  detail jsonb not null default '{}' check (octet_length(detail::text) <= 4000),
  at timestamptz not null default now()
);
create index mastery_log_course on public.mastery_log (course_id, at desc);

-- ------------------------------------------------------------------ helpers

-- The people row of the signed-in student, or null. Matches the account's
-- confirmed address, so an unconfirmed sign-up never counts.
create function private.current_student() returns uuid
  language sql stable security definer set search_path = '' as $$
  select sa.person_id
  from public.student_accounts sa
  join auth.users u on lower(u.email) = sa.email
  where u.id = (select auth.uid()) and u.email_confirmed_at is not null and sa.active
$$;

create function private.teaches_course(c uuid) returns boolean
  language sql stable security definer set search_path = '' as $$
  select private.has_role('admin')
      or (private.is_staff() and exists (
            select 1 from public.mastery_courses where id = c and teacher_id = (select auth.uid())))
$$;

-- A student on the roster of one of the signed-in user's courses (Canvas id
-- lookups for the course's own import).
create function private.teaches_person(p uuid) returns boolean
  language sql stable security definer set search_path = '' as $$
  select private.is_staff() and exists (
    select 1 from public.mastery_roster r
    join public.mastery_courses c on c.id = r.course_id
    where r.person_id = p and c.teacher_id = (select auth.uid()))
$$;

create function private.on_roster(c uuid, p uuid) returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.mastery_roster where course_id = c and person_id = p)
$$;

revoke all on function private.current_student() from public;
revoke all on function private.teaches_course(uuid) from public;
revoke all on function private.teaches_person(uuid) from public;
revoke all on function private.on_roster(uuid, uuid) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function private.current_student() from anon;
    revoke all on function private.teaches_course(uuid) from anon;
    revoke all on function private.teaches_person(uuid) from anon;
    revoke all on function private.on_roster(uuid, uuid) from anon;
  end if;
end $$;
grant execute on function private.current_student() to authenticated;
grant execute on function private.teaches_course(uuid) to authenticated;
grant execute on function private.teaches_person(uuid) to authenticated;
grant execute on function private.on_roster(uuid, uuid) to authenticated;

-- ------------------------------------------------------------------ guards

create function private.mastery_roster_guard() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if (select is_sample from public.mastery_courses where id = new.course_id)
     and not (select is_sample from public.people where id = new.person_id) then
    raise exception 'A sample course holds only fictional sample students' using errcode = 'P0001';
  end if;
  return new;
end $$;

create function private.mastery_evidence_guard() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if not private.on_roster(new.course_id, new.person_id) then
    raise exception 'That student is not on this course''s roster' using errcode = 'P0001';
  end if;
  new.recorded_by := (select auth.uid());
  new.created_at := now();
  return new;
end $$;

-- A request is the student's own words: the teacher changes only its status
-- and reply, and the reply is stamped with who answered.
create function private.mastery_requests_guard() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if not private.on_roster(new.course_id, new.person_id) then
      raise exception 'That student is not on this course''s roster' using errcode = 'P0001';
    end if;
    if (select count(*) from public.mastery_requests
        where person_id = new.person_id and course_id = new.course_id and status = 'open') >= 10 then
      raise exception 'Ten requests are already waiting. Your teacher will get to them.' using errcode = 'P0001';
    end if;
    new.status := 'open';
    new.response := null;
    new.resolved_by := null;
    new.resolved_at := null;
    new.created_by := (select auth.uid());
    new.created_at := now();
    return new;
  end if;
  if new.course_id is distinct from old.course_id or new.person_id is distinct from old.person_id
     or new.standard_code is distinct from old.standard_code or new.kind is distinct from old.kind
     or new.message is distinct from old.message or new.link is distinct from old.link
     or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'Only a request''s status and reply can change' using errcode = 'P0001';
  end if;
  new.resolved_by := (select auth.uid());
  new.resolved_at := now();
  return new;
end $$;

create function private.mastery_courses_guard() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.is_sample is distinct from old.is_sample then
    raise exception 'A course can''t switch between sample and real' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Every change to a course's evidence, roster, sources, requests and student
-- sign-ins goes to the log, whoever makes it.
create function private.mastery_log_change() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare
  r record;
  detail jsonb := '{}';
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  if tg_table_name = 'student_accounts' then
    -- Not tied to one course: log it against every course they're on.
    insert into public.mastery_log (course_id, person_id, action, detail)
    select course_id, r.person_id, 'student_accounts_' || lower(tg_op),
           jsonb_build_object('active', r.active)
    from public.mastery_roster where person_id = r.person_id;
    return r;
  end if;
  if tg_table_name = 'mastery_sources' then
    insert into public.mastery_log (course_id, action, detail)
    values (r.course_id, 'mastery_sources_' || lower(tg_op),
            jsonb_build_object('source', r.source, 'paused', r.paused));
    return r;
  end if;
  if tg_table_name = 'mastery_evidence' then
    detail := jsonb_build_object('standard', r.standard_code, 'source', r.source, 'title', r.title,
                                 'level', r.level, 'score', r.score, 'max', r.max_score);
  elsif tg_table_name = 'mastery_requests' then
    detail := jsonb_build_object('standard', r.standard_code, 'kind', r.kind, 'status', r.status);
  end if;
  insert into public.mastery_log (course_id, person_id, action, detail)
  values (r.course_id, r.person_id, tg_table_name || '_' || lower(tg_op), detail);
  return r;
end $$;

-- A student account counts as a student, never as staff: if the address is
-- registered here, the sign-in doesn't create a (pending) staff row. Same as
-- 20261016000000_student_addresses_wait.sql otherwise.
create or replace function private.provision_staff() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if new.email_confirmed_at is null
     or lower(new.email) not like '%@pacificachristian.org'
     or exists (select 1 from public.student_accounts where email = lower(new.email)) then
    return new;
  end if;
  insert into public.staff (user_id, email, display_name, role, active)
  values (
    new.id,
    lower(new.email),
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(lower(new.email), '@', 1)
    ),
    'staff',
    not private.is_student_address(new.email)
      and coalesce((select auto_approve_staff from public.pilot_settings), false)
  )
  on conflict do nothing;  -- never touch an existing row (role, deactivation)
  return new;
end $$;

-- A staff member can't also be given a student sign-in.
create function private.student_accounts_guard() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.staff where email = new.email and active) then
    raise exception 'That address belongs to an active staff account' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
    new.created_at := now();
  elsif new.person_id is distinct from old.person_id or new.created_by is distinct from old.created_by then
    raise exception 'A student sign-in can''t move to another student' using errcode = 'P0001';
  end if;
  return new;
end $$;

do $$
declare f text;
begin
  foreach f in array array['mastery_roster_guard()', 'mastery_evidence_guard()', 'mastery_requests_guard()',
                           'mastery_courses_guard()', 'mastery_log_change()', 'student_accounts_guard()'] loop
    execute format('revoke all on function private.%s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function private.%s from anon', f);
    end if;
    execute format('revoke all on function private.%s from authenticated', f);
  end loop;
end $$;

create trigger mastery_courses_guard before update on public.mastery_courses
  for each row execute function private.mastery_courses_guard();

create trigger mastery_roster_consent before insert on public.mastery_roster
  for each row execute function private.enforce_consent('mastery_records');
create trigger mastery_roster_guard before insert on public.mastery_roster
  for each row execute function private.mastery_roster_guard();

create trigger student_accounts_consent before insert or update on public.student_accounts
  for each row execute function private.enforce_consent('mastery_records');
create trigger student_accounts_guard before insert or update on public.student_accounts
  for each row execute function private.student_accounts_guard();

create trigger mastery_evidence_consent before insert on public.mastery_evidence
  for each row execute function private.enforce_consent('mastery_records');
create trigger mastery_evidence_guard before insert on public.mastery_evidence
  for each row execute function private.mastery_evidence_guard();

create trigger mastery_requests_consent before insert on public.mastery_requests
  for each row execute function private.enforce_consent('mastery_records');
create trigger mastery_requests_guard before insert or update on public.mastery_requests
  for each row execute function private.mastery_requests_guard();

create trigger mastery_evidence_log after insert or delete on public.mastery_evidence
  for each row execute function private.mastery_log_change();
create trigger mastery_roster_log after insert or delete on public.mastery_roster
  for each row execute function private.mastery_log_change();
create trigger mastery_requests_log after insert or update on public.mastery_requests
  for each row execute function private.mastery_log_change();
create trigger mastery_sources_log after insert or update of paused on public.mastery_sources
  for each row execute function private.mastery_log_change();
create trigger student_accounts_log after insert or update or delete on public.student_accounts
  for each row execute function private.mastery_log_change();

-- ------------------------------------------------------------------ RLS

alter table public.mastery_courses enable row level security;
alter table public.mastery_roster enable row level security;
alter table public.student_accounts enable row level security;
alter table public.mastery_evidence enable row level security;
alter table public.mastery_requests enable row level security;
alter table public.mastery_sources enable row level security;
alter table public.mastery_log enable row level security;

-- Courses: teachers and admins create their own; the teacher (or an admin)
-- manages it; a student sees the courses they're on.
-- (teacher_id is checked on the row itself, not through teaches_course(),
-- so a new course is readable in the statement that creates it.)
create policy mastery_courses_read on public.mastery_courses for select to authenticated
  using ((teacher_id = (select auth.uid()) and (select private.is_staff()))
         or (select private.has_role('admin'))
         or (select private.on_roster(id, (select private.current_student()))));
create policy mastery_courses_insert on public.mastery_courses for insert to authenticated
  with check ((select private.has_role('admin', 'teacher')) and teacher_id = (select auth.uid()));
create policy mastery_courses_update on public.mastery_courses for update to authenticated
  using ((teacher_id = (select auth.uid()) and (select private.is_staff())) or (select private.has_role('admin')))
  with check ((teacher_id = (select auth.uid()) and (select private.is_staff())) or (select private.has_role('admin')));
create policy mastery_courses_delete on public.mastery_courses for delete to authenticated
  using ((select private.has_role('admin')) or (is_sample and (select private.teaches_course(id))));

create policy mastery_roster_read on public.mastery_roster for select to authenticated
  using ((select private.teaches_course(course_id)) or person_id = (select private.current_student()));
create policy mastery_roster_write on public.mastery_roster for insert to authenticated
  with check ((select private.teaches_course(course_id)));
create policy mastery_roster_delete on public.mastery_roster for delete to authenticated
  using ((select private.teaches_course(course_id)));

-- Student sign-ins: an admin, or the teacher of a course the student is on.
create policy student_accounts_read on public.student_accounts for select to authenticated
  using ((select private.has_role('admin')) or (select private.teaches_person(person_id))
         or person_id = (select private.current_student()));
create policy student_accounts_insert on public.student_accounts for insert to authenticated
  with check ((select private.has_role('admin')) or (select private.teaches_person(person_id)));
create policy student_accounts_update on public.student_accounts for update to authenticated
  using ((select private.has_role('admin')) or (select private.teaches_person(person_id)))
  with check ((select private.has_role('admin')) or (select private.teaches_person(person_id)));
create policy student_accounts_delete on public.student_accounts for delete to authenticated
  using ((select private.has_role('admin')) or (select private.teaches_person(person_id)));

create policy mastery_evidence_read on public.mastery_evidence for select to authenticated
  using ((select private.teaches_course(course_id)) or person_id = (select private.current_student()));
create policy mastery_evidence_insert on public.mastery_evidence for insert to authenticated
  with check ((select private.teaches_course(course_id)));
create policy mastery_evidence_delete on public.mastery_evidence for delete to authenticated
  using ((select private.teaches_course(course_id)));

create policy mastery_requests_read on public.mastery_requests for select to authenticated
  using ((select private.teaches_course(course_id)) or person_id = (select private.current_student()));
create policy mastery_requests_insert on public.mastery_requests for insert to authenticated
  with check (person_id = (select private.current_student()));
create policy mastery_requests_update on public.mastery_requests for update to authenticated
  using ((select private.teaches_course(course_id))) with check ((select private.teaches_course(course_id)));

create policy mastery_sources_read on public.mastery_sources for select to authenticated
  using ((select private.teaches_course(course_id)));
create policy mastery_sources_write on public.mastery_sources for insert to authenticated
  with check ((select private.teaches_course(course_id)));
create policy mastery_sources_update on public.mastery_sources for update to authenticated
  using ((select private.teaches_course(course_id))) with check ((select private.teaches_course(course_id)));

-- The log: the course's teacher reads it and adds import summaries as
-- themselves; nobody updates or deletes it.
create policy mastery_log_read on public.mastery_log for select to authenticated
  using ((select private.teaches_course(course_id)));
create policy mastery_log_insert on public.mastery_log for insert to authenticated
  with check ((select private.teaches_course(course_id)) and actor = (select auth.uid()));

-- A signed-in student can read their own name, and nothing else in people.
create policy people_read_self on public.people for select to authenticated
  using (id = (select private.current_student()));

-- The course's teacher can read the Canvas ids of their own roster, to run
-- the course's Canvas import.
create policy external_ids_mastery_read on public.external_ids for select to authenticated
  using (system = 'canvas' and (select private.teaches_person(person_id)));

-- New tables are no longer granted to the Data API automatically.
grant select, insert, update, delete on public.mastery_courses to authenticated;
grant select, insert, delete on public.mastery_roster to authenticated;
grant select, insert, update, delete on public.student_accounts to authenticated;
grant select, insert, delete on public.mastery_evidence to authenticated;
grant select, insert, update on public.mastery_requests to authenticated;
grant select, insert, update on public.mastery_sources to authenticated;
grant select, insert on public.mastery_log to authenticated;
