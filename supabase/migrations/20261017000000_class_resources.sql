-- Class resources: a study link a student suggests for one of their own
-- classes (a video, a practice set, a reading), shown to others taking that
-- class only after a teacher or admin has looked at it and approved it.
-- Second step of folding Study Hub into Formation Pathways (Fizzy #32).
--
-- Links only: no files are uploaded or stored, and nothing is mirrored.
-- Nothing here says how a student is doing in a class.
--
-- It is the student's own contribution, so saving one needs the
-- `student_voice` consent (trigger below), and withdrawing a student removes
-- what they suggested. In person only, like sparks and class reflections: a
-- staff member opens the Study Hub on their own signed-in device with the
-- student, and the row is written as that adult (created_by = auth.uid()).
-- There is no anonymous or student write path.
--
-- Humans decide: every suggestion starts `pending`. Only a teacher or admin
-- can approve or decline it, and the reviewer recorded is always the person
-- who did it, never a value the client sends.

create table public.class_resources (
  id uuid primary key default gen_random_uuid(),
  -- Who suggested it. Staff see this; other students never do.
  person_id uuid not null references public.people (id) on delete cascade,
  -- The class it is for, as titled on the student's schedule. Others see an
  -- approved resource when they take a class with the same title.
  class_title text not null check (char_length(btrim(class_title)) between 1 and 120),
  class_key text generated always as (lower(btrim(class_title))) stored,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  url text not null check (url ~ '^https://[^[:space:]/?#@]+([/?#][^[:space:]]*)?$' and char_length(url) <= 500),
  kind text not null check (kind in ('Past exam', 'Practice', 'Video', 'Open reading', 'Reference')),
  -- Why it helped, in the student's words. Shown without their name.
  note text not null default '' check (char_length(note) <= 300),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  -- restrict, not cascade: a student's contribution outlives the staff
  -- account that saved it (deactivate staff instead of deleting them).
  created_by uuid not null default auth.uid() references public.staff (user_id) on delete restrict,
  created_at timestamptz not null default now(),
  reviewed_by uuid references public.staff (user_id) on delete set null,
  reviewed_by_name text,
  reviewed_at timestamptz
);
create index class_resources_class on public.class_resources (class_key, status);
create index class_resources_person on public.class_resources (person_id, created_at desc);
create index class_resources_pending on public.class_resources (created_at) where status = 'pending';

alter table public.class_resources enable row level security;

-- Any active staff member can sit with a student and save a suggestion, as
-- themselves, and only as an unreviewed one.
create policy class_resources_insert on public.class_resources for insert to authenticated
  with check (
    (select private.is_staff())
    and created_by = (select auth.uid())
    and status = 'pending'
    and reviewed_by is null and reviewed_by_name is null and reviewed_at is null
  );
-- Approved resources are for every staff member who opens a Study Hub.
-- Unreviewed and declined ones are for the people who review or draft, and
-- for the adult who saved them (so the student sees theirs is waiting).
create policy class_resources_read on public.class_resources for select to authenticated
  using (
    (select private.is_staff())
    and (
      status = 'approved'
      or created_by = (select auth.uid())
      or (select private.has_role('admin', 'admissions', 'teacher'))
    )
  );
create policy class_resources_review on public.class_resources for update to authenticated
  using ((select private.has_role('admin', 'teacher')))
  with check ((select private.has_role('admin', 'teacher')));
create policy class_resources_delete on public.class_resources for delete to authenticated
  using ((select private.has_role('admin')));

create trigger class_resources_consent before insert or update on public.class_resources
  for each row execute function private.enforce_consent('student_voice');

-- A review can tidy the title, kind or note and set the decision. It can't
-- change whose suggestion it is, which class it is for or where the link
-- goes, and it can't send a reviewed suggestion back to unreviewed.
create function private.class_resources_guard() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if new.person_id <> old.person_id
    or new.class_title <> old.class_title
    or new.url <> old.url
    or new.created_by <> old.created_by
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
revoke all on function private.class_resources_guard() from public, anon, authenticated;

create trigger class_resources_guard before update on public.class_resources
  for each row execute function private.class_resources_guard();

-- New tables are no longer granted to the Data API automatically.
grant select, insert, update, delete on public.class_resources to authenticated;
