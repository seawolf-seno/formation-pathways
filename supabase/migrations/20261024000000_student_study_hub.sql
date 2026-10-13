-- The Study Hub for a signed-in student (Fizzy #32). Until now it was opened
-- by a staff member on their own device, with the student beside them. The
-- Mastery Hub gave students a sign-in (student_accounts, 20261019000000);
-- this lets a signed-in student open their own Study Hub at /study:
--
--   * read their own classes (titles from the imported schedule; there are no
--     grades or scores in these tables);
--   * read what they said they enjoy about them, and say it again;
--   * suggest a link for one of their own classes, and see their own
--     suggestions;
--   * read links a teacher has approved for classes they take, with nothing
--     that says who suggested them.
--
-- What does not change: saving anything still needs the `student_voice`
-- consent (the existing triggers), a suggestion still reaches other students
-- only after a teacher or admin approves it, and a student reads nothing
-- about anyone else. No table or column is added.

-- ------------------------------------------------------------ their classes

create policy course_history_student_read on public.course_history for select to authenticated
  using (person_id = (select private.current_student()));
create policy course_enrollments_student_read on public.course_enrollments for select to authenticated
  using (person_id = (select private.current_student()));

-- ------------------------------------------------- written by the student

-- `created_by` is the staff member who saved a row while sitting with the
-- student. A row the student saves themselves, signed in, has none: null
-- means "the student, on their own sign-in". Staff rows always have one (the
-- staff insert policies require created_by = auth.uid()), and on delete
-- restrict means it never becomes null later.
alter table public.class_reflections alter column created_by drop not null;
alter table public.class_resources alter column created_by drop not null;

-- One of this student's own classes, by title (any school year).
create function private.takes_class(p uuid, title text) returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.course_history
                 where person_id = p and lower(btrim(course_title)) = lower(btrim(title)))
      or exists (select 1 from public.course_enrollments
                 where person_id = p and lower(btrim(course_name)) = lower(btrim(title)))
$$;

-- A row with no staff member behind it must come from that student's own
-- sign-in, is stamped now, and is capped so one account can't fill the
-- review queue or the table. Rows saved by staff pass straight through.
create function private.student_study_guard() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.current_student();
begin
  if new.created_by is not null then
    return new;
  end if;
  if me is null or new.person_id is distinct from me then
    raise exception 'Only the student, signed in, can save this without a staff member' using errcode = 'P0001';
  end if;
  new.created_at := now();
  if tg_table_name = 'class_reflections' then
    if (select count(*) from public.class_reflections
        where person_id = me and created_by is null and created_at > now() - interval '1 day') >= 5 then
      raise exception 'You''ve saved this a few times today. Come back tomorrow to change it again.' using errcode = 'P0001';
    end if;
  else
    if not private.takes_class(me, new.class_title) then
      raise exception 'That class isn''t on your schedule' using errcode = 'P0001';
    end if;
    if (select count(*) from public.class_resources
        where person_id = me and created_by is null and status = 'pending') >= 10 then
      raise exception 'Ten of your links are already waiting for a teacher. They''ll get to them.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

create trigger class_reflections_student_guard before insert on public.class_reflections
  for each row execute function private.student_study_guard();
create trigger class_resources_student_guard before insert on public.class_resources
  for each row execute function private.student_study_guard();

-- Same guard as 20261017000000, with one change: `created_by` can now be
-- null, so it is compared with "is distinct from" (with <> a null would let
-- a change through).
create or replace function private.class_resources_guard() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if new.person_id <> old.person_id
    or new.class_title <> old.class_title
    or new.url <> old.url
    or new.created_by is distinct from old.created_by
    or new.created_at <> old.created_at then
    raise exception 'A suggestion keeps its student, class and link. Decline it and add a new one instead.' using errcode = 'P0001';
  end if;
  if new.status = 'pending' and old.status <> 'pending' then
    raise exception 'A reviewed suggestion can''t go back to unreviewed' using errcode = 'P0001';
  end if;
  if new.status is distinct from old.status then
    new.reviewed_by := auth.uid();
    new.reviewed_by_name := (select s.display_name from public.staff s where s.user_id = auth.uid() and s.active);
    new.reviewed_at := now();
    if new.reviewed_by_name is null then
      raise exception 'Only a staff member can review a suggestion' using errcode = 'P0001';
    end if;
  else
    new.reviewed_by := old.reviewed_by;
    new.reviewed_by_name := old.reviewed_by_name;
    new.reviewed_at := old.reviewed_at;
  end if;
  return new;
end $$;

-- What they enjoy about their classes: their own, read and added to.
create policy class_reflections_student_read on public.class_reflections for select to authenticated
  using (person_id = (select private.current_student()));
create policy class_reflections_student_insert on public.class_reflections for insert to authenticated
  with check (person_id = (select private.current_student()) and created_by is null);

-- Links they suggested: their own rows, and a new one only as unreviewed.
create policy class_resources_student_read on public.class_resources for select to authenticated
  using (person_id = (select private.current_student()));
create policy class_resources_student_insert on public.class_resources for insert to authenticated
  with check (
    person_id = (select private.current_student())
    and created_by is null
    and status = 'pending'
    and reviewed_by is null and reviewed_by_name is null and reviewed_at is null
  );

-- ------------------------------------------------ what a student may ask

-- Approved links for the classes this student takes. A row in class_resources
-- names who suggested it, and a policy can't hide a column, so other
-- students' approved links come only through this function: the link itself,
-- never the student, the reviewer or the dates.
create function private.class_links_for_student()
  returns table (id uuid, class_key text, title text, url text, kind text, note text)
  language sql stable security definer set search_path = '' as $$
  select r.id, r.class_key, r.title, r.url, r.kind, r.note
  from public.class_resources r
  where r.status = 'approved'
    and r.class_key in (
      select lower(btrim(h.course_title)) from public.course_history h
      where h.person_id = (select private.current_student())
      union
      select lower(btrim(e.course_name)) from public.course_enrollments e
      where e.person_id = (select private.current_student())
    )
  order by r.created_at
  limit 300
$$;
create function public.class_links_for_student()
  returns table (id uuid, class_key text, title text, url text, kind text, note text)
  language sql stable security invoker set search_path = '' as $$
  select * from private.class_links_for_student()
$$;

-- Whether this student's family has agreed to student voice, so the page can
-- offer (or leave out) the two things that save. A student can't read the
-- consents table itself.
create function private.student_voice_on() returns boolean
  language sql stable security definer set search_path = '' as $$
  select coalesce(private.has_consent((select private.current_student()), 'student_voice'), false)
$$;
create function public.student_voice_on() returns boolean
  language sql stable security invoker set search_path = '' as $$
  select private.student_voice_on()
$$;

do $$
declare f text;
begin
  foreach f in array array['private.takes_class(uuid, text)', 'private.student_study_guard()',
                           'private.class_links_for_student()', 'public.class_links_for_student()',
                           'private.student_voice_on()', 'public.student_voice_on()'] loop
    execute format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', f);
    end if;
  end loop;
end $$;
revoke all on function private.student_study_guard() from authenticated;
revoke all on function private.takes_class(uuid, text) from authenticated;
grant execute on function private.class_links_for_student() to authenticated;
grant execute on function public.class_links_for_student() to authenticated;
grant execute on function private.student_voice_on() to authenticated;
grant execute on function public.student_voice_on() to authenticated;
