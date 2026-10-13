-- Mastery Hub, two more pieces (Fizzy #37):
--
-- 1. Standard sets edited in the hub. A subject's standards, levels, rules,
--    links and videos were a JSON file in the repo (fixtures/mastery/*.json).
--    Now a teacher edits them on /mastery/standards and they're saved here;
--    the files stay as built-in starting points. Every save is kept in
--    mastery_standard_set_versions, so nothing is lost. No student data.
--
-- 2. Next steps drafted by AI, shared by the teacher. Rule-based next steps
--    stay on every student page. A teacher can also have Claude draft a few
--    next steps in plain words for one student (anonymized, levels in words,
--    no scores, links only from the course's own list). It is a DRAFT
--    (product principle 1) until the teacher edits and shares it; only then
--    does the student see it, with the teacher's name. Needs ai_drafting
--    consent when AI wrote it.

-- ------------------------------------------------------------------ standard sets

-- /mastery/standards is the editor, so no course can be called that.
alter table public.mastery_courses add constraint mastery_courses_slug_reserved
  check (lower(slug) <> 'standards');

create table public.mastery_standard_sets (
  key text primary key check (key ~ '^[a-z0-9-]{1,60}$'),
  config jsonb not null check (jsonb_typeof(config) = 'object' and octet_length(config::text) <= 400000),
  created_by uuid not null default auth.uid() references public.staff (user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_by uuid references public.staff (user_id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.mastery_standard_set_versions (
  id bigint generated always as identity primary key,
  key text not null,
  config jsonb not null,
  saved_by uuid,
  saved_at timestamptz not null default now()
);
create index mastery_standard_set_versions_key on public.mastery_standard_set_versions (key, saved_at desc);

create function private.mastery_standard_sets_guard() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
    new.created_at := now();
  elsif new.key is distinct from old.key or new.created_by is distinct from old.created_by
        or new.created_at is distinct from old.created_at then
    raise exception 'A standard set keeps its key and owner' using errcode = 'P0001';
  end if;
  new.updated_by := (select auth.uid());
  new.updated_at := now();
  return new;
end $$;

create function private.mastery_standard_sets_keep() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  insert into public.mastery_standard_set_versions (key, config, saved_by)
  values (new.key, new.config, new.updated_by);
  return new;
end $$;

-- ------------------------------------------------------------------ next steps

create table public.mastery_next_steps (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.mastery_courses (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  -- [{ "standard": "2.5", "text": "…", "links": ["https://…"] }]
  steps jsonb not null check (jsonb_typeof(steps) = 'array' and octet_length(steps::text) <= 20000),
  used_ai boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'shared')),
  drafted_by uuid not null default auth.uid() references public.staff (user_id) on delete restrict,
  created_at timestamptz not null default now(),
  shared_by_name text,
  shared_at timestamptz
);
create index mastery_next_steps_student on public.mastery_next_steps (course_id, person_id, created_at desc);

create function private.mastery_next_steps_guard() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if not private.on_roster(new.course_id, new.person_id) then
      raise exception 'That student is not on this course''s roster' using errcode = 'P0001';
    end if;
    if new.used_ai and not private.has_consent(new.person_id, 'ai_drafting') then
      raise exception 'No active ai_drafting consent on file for this person' using errcode = 'P0001';
    end if;
    new.status := 'draft';
    new.shared_by_name := null;
    new.shared_at := null;
    new.drafted_by := (select auth.uid());
    new.created_at := now();
    return new;
  end if;
  if old.status = 'shared' then
    raise exception 'Shared next steps are read-only. Draft new ones instead.' using errcode = 'P0001';
  end if;
  if new.course_id is distinct from old.course_id or new.person_id is distinct from old.person_id
     or new.used_ai is distinct from old.used_ai or new.drafted_by is distinct from old.drafted_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Only the steps and the decision to share can change' using errcode = 'P0001';
  end if;
  if new.status = 'shared' then
    -- Signed by whoever shares it, from their own staff record.
    new.shared_by_name := (select s.display_name from public.staff s where s.user_id = (select auth.uid()) and s.active);
    new.shared_at := now();
    if new.shared_by_name is null then
      raise exception 'Only a staff member can share next steps' using errcode = 'P0001';
    end if;
  else
    new.shared_by_name := null;
    new.shared_at := null;
  end if;
  return new;
end $$;

do $$
declare f text;
begin
  foreach f in array array['mastery_standard_sets_guard()', 'mastery_standard_sets_keep()', 'mastery_next_steps_guard()'] loop
    execute format('revoke all on function private.%s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function private.%s from anon', f);
    end if;
    execute format('revoke all on function private.%s from authenticated', f);
  end loop;
end $$;

create trigger mastery_standard_sets_guard before insert or update on public.mastery_standard_sets
  for each row execute function private.mastery_standard_sets_guard();
create trigger mastery_standard_sets_keep after insert or update on public.mastery_standard_sets
  for each row execute function private.mastery_standard_sets_keep();

create trigger mastery_next_steps_consent before insert on public.mastery_next_steps
  for each row execute function private.enforce_consent('mastery_records');
create trigger mastery_next_steps_guard before insert or update on public.mastery_next_steps
  for each row execute function private.mastery_next_steps_guard();
create trigger mastery_next_steps_log after insert or update on public.mastery_next_steps
  for each row execute function private.mastery_log_change();

-- ------------------------------------------------------------------ RLS

alter table public.mastery_standard_sets enable row level security;
alter table public.mastery_standard_set_versions enable row level security;
alter table public.mastery_next_steps enable row level security;

-- Standard sets hold no student data: any staff member or signed-in student
-- can read them (a student's page shows its course's standards). Teachers and
-- admins create sets; a teacher edits the sets they created, an admin any.
create policy mastery_standard_sets_read on public.mastery_standard_sets for select to authenticated
  using ((select private.is_staff()) or (select private.current_student()) is not null);
create policy mastery_standard_sets_insert on public.mastery_standard_sets for insert to authenticated
  with check ((select private.has_role('admin', 'teacher')));
create policy mastery_standard_sets_update on public.mastery_standard_sets for update to authenticated
  using ((select private.has_role('admin')) or ((select private.has_role('teacher')) and created_by = (select auth.uid())))
  with check ((select private.has_role('admin')) or ((select private.has_role('teacher')) and created_by = (select auth.uid())));
create policy mastery_standard_sets_delete on public.mastery_standard_sets for delete to authenticated
  using ((select private.has_role('admin')));

create policy mastery_standard_set_versions_read on public.mastery_standard_set_versions for select to authenticated
  using ((select private.has_role('admin', 'teacher')));

-- Next steps: the course's teacher (or an admin) drafts, edits and shares;
-- the student reads only shared ones, only their own.
create policy mastery_next_steps_read on public.mastery_next_steps for select to authenticated
  using ((select private.teaches_course(course_id))
         or (status = 'shared' and person_id = (select private.current_student())));
create policy mastery_next_steps_insert on public.mastery_next_steps for insert to authenticated
  with check ((select private.teaches_course(course_id)));
create policy mastery_next_steps_update on public.mastery_next_steps for update to authenticated
  using ((select private.teaches_course(course_id))) with check ((select private.teaches_course(course_id)));
create policy mastery_next_steps_delete on public.mastery_next_steps for delete to authenticated
  using ((select private.teaches_course(course_id)) and status = 'draft');

-- The scheduled importer maps Canvas titles with the course's standards.
grant select (key, config) on public.mastery_standard_sets to mastery_importer;
create policy mastery_standard_sets_importer on public.mastery_standard_sets for select to mastery_importer
  using (true);

grant select, insert, update, delete on public.mastery_standard_sets to authenticated;
grant select on public.mastery_standard_set_versions to authenticated;
grant select, insert, update, delete on public.mastery_next_steps to authenticated;
