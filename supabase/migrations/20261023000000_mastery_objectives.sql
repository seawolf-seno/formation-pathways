-- Mastery Hub: the teacher's Canvas learning objectives as the backbone
-- (Fizzy #37).
--
-- seno grades three broad learning objectives per unit in Canvas (Outcomes).
-- The hub now takes those objectives straight from Canvas as the course's
-- standard set, and everything else resolves into them:
--   * each student's Canvas objective score (Canvas's own rollup), kept here
--     so the dashboard can show it first (mastery_objective_grades);
--   * ALL Khan Academy data: every skill's latest level for every linked
--     student (mastery_khan_levels), not just the two that count. Each Khan
--     skill is sorted once into an objective; every sorted skill at
--     proficient or mastered becomes evidence for it. The three-per-unit
--     "key skills" cap is gone, since the objectives are now the focus;
--   * AP Classroom and Canvas work, as before.

-- ------------------------------------------------------------------ Canvas objective scores

create table public.mastery_objective_grades (
  course_id uuid not null references public.mastery_courses (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  standard_code text not null check (standard_code ~ '^[A-Za-z0-9.-]{1,20}$'),
  score numeric not null check (score >= 0),
  max_score numeric check (max_score > 0),
  label text check (length(label) <= 100),
  updated_at timestamptz not null default now(),
  primary key (course_id, person_id, standard_code)
);

create function private.mastery_roster_row_guard() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if not private.on_roster(new.course_id, new.person_id) then
    raise exception 'That student is not on this course''s roster' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger mastery_objective_grades_consent before insert or update on public.mastery_objective_grades
  for each row execute function private.enforce_consent('mastery_records');
create trigger mastery_objective_grades_guard before insert or update on public.mastery_objective_grades
  for each row execute function private.mastery_roster_row_guard();

alter table public.mastery_objective_grades enable row level security;
create policy mastery_objective_grades_read on public.mastery_objective_grades for select to authenticated
  using ((select private.teaches_course(course_id)) or person_id = (select private.current_student()));
create policy mastery_objective_grades_write on public.mastery_objective_grades for insert to authenticated
  with check ((select private.teaches_course(course_id)));
create policy mastery_objective_grades_update on public.mastery_objective_grades for update to authenticated
  using ((select private.teaches_course(course_id))) with check ((select private.teaches_course(course_id)));
create policy mastery_objective_grades_delete on public.mastery_objective_grades for delete to authenticated
  using ((select private.teaches_course(course_id)));
grant select, insert, update, delete on public.mastery_objective_grades to authenticated;

-- The scheduled importer keeps them current too (real Canvas courses only).
grant select (course_id, person_id, standard_code) on public.mastery_objective_grades to mastery_importer;
grant insert (course_id, person_id, standard_code, score, max_score, label, updated_at) on public.mastery_objective_grades to mastery_importer;
grant update (score, max_score, label, updated_at) on public.mastery_objective_grades to mastery_importer;
create policy mastery_objective_grades_importer_read on public.mastery_objective_grades for select to mastery_importer
  using (exists (select 1 from public.mastery_courses c where c.id = course_id and not c.is_sample and c.canvas_course_id is not null));
create policy mastery_objective_grades_importer_insert on public.mastery_objective_grades for insert to mastery_importer
  with check (exists (select 1 from public.mastery_courses c where c.id = course_id and not c.is_sample and c.canvas_course_id is not null));
create policy mastery_objective_grades_importer_update on public.mastery_objective_grades for update to mastery_importer
  using (exists (select 1 from public.mastery_courses c where c.id = course_id and not c.is_sample and c.canvas_course_id is not null))
  with check (exists (select 1 from public.mastery_courses c where c.id = course_id and not c.is_sample and c.canvas_course_id is not null));

-- ------------------------------------------------------------------ all Khan levels

create table public.mastery_khan_levels (
  course_id uuid not null references public.mastery_courses (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  skill_id text not null check (skill_id ~ '^[A-Za-z0-9_:.-]{1,80}$'),
  level text not null check (level ~ '^[a-z_ -]{1,30}$'),
  updated_at timestamptz not null default now(),
  primary key (course_id, person_id, skill_id)
);
create trigger mastery_khan_levels_consent before insert or update on public.mastery_khan_levels
  for each row execute function private.enforce_consent('mastery_records');
create trigger mastery_khan_levels_guard before insert or update on public.mastery_khan_levels
  for each row execute function private.mastery_roster_row_guard();
alter table public.mastery_khan_levels enable row level security;
-- Written only by the extension's sync function; read by the teacher, and by
-- the student for themselves (their own Khan progress, under their objectives).
create policy mastery_khan_levels_read on public.mastery_khan_levels for select to authenticated
  using ((select private.teaches_course(course_id)) or person_id = (select private.current_student()));
grant select on public.mastery_khan_levels to authenticated;

-- The student also sees the Khan skill titles of their own courses (for the
-- same view). Not which skills are counted beyond what their objectives show.
create policy mastery_khan_skills_student_read on public.mastery_khan_skills for select to authenticated
  using ((select private.on_roster(course_id, (select private.current_student()))));

-- Khan units in course order, so a Khan unit lines up with the same unit in Canvas.
alter table public.mastery_khan_skills add column unit_number int check (unit_number between 1 and 99);

-- No more three-key-skills cap: every skill sorted into an objective counts.
drop trigger mastery_khan_skills_guard on public.mastery_khan_skills;
drop function private.mastery_khan_skills_guard();

-- ------------------------------------------------------------------ the extension's sync, revised

-- p = { skills: [{id, title, unit, unitNumber}], links: [{kaid, person}],
--       levels: [{person, skill, level}] }   (levels: any Khan level word)
-- Keeps the catalog, the links, EVERY level, and adds evidence for skills
-- sorted into an objective at proficient (Proficient) or mastered (Extending).
create or replace function private.mastery_ext_khan_sync(p_token text, p_course uuid, p jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = '' as $$
declare
  v_staff uuid := private.ext_staff(p_token);
  v_skills int := 0;
  v_links int := 0;
  v_levels int := 0;
  v_added int := 0;
  v_summary text;
begin
  if v_staff is null then raise exception 'This extension isn''t connected (or the connection was revoked)' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.mastery_courses where id = p_course and teacher_id = v_staff) then
    raise exception 'That course isn''t yours' using errcode = 'P0001';
  end if;
  if coalesce((select paused from public.mastery_sources where course_id = p_course and source = 'khan'), false) then
    raise exception 'Khan Academy is paused for this course' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p -> 'skills') <> 'array' or jsonb_typeof(p -> 'links') <> 'array' or jsonb_typeof(p -> 'levels') <> 'array'
     or jsonb_array_length(p -> 'skills') > 3000 or jsonb_array_length(p -> 'links') > 500 or jsonb_array_length(p -> 'levels') > 60000 then
    raise exception 'That sync doesn''t look right' using errcode = 'P0001';
  end if;

  insert into public.mastery_khan_skills (course_id, skill_id, title, unit_title, unit_number, seen_at)
  select p_course, s ->> 'id', left(s ->> 'title', 200), left(coalesce(s ->> 'unit', ''), 200),
         case when (s ->> 'unitNumber') ~ '^\d{1,2}$' and (s ->> 'unitNumber')::int between 1 and 99 then (s ->> 'unitNumber')::int end, now()
  from jsonb_array_elements(p -> 'skills') s
  where (s ->> 'id') ~ '^[A-Za-z0-9_:.-]{1,80}$' and length(trim(coalesce(s ->> 'title', ''))) > 0
  on conflict (course_id, skill_id) do update
    set title = excluded.title, unit_title = excluded.unit_title, unit_number = excluded.unit_number, seen_at = excluded.seen_at;
  get diagnostics v_skills = row_count;

  insert into public.mastery_khan_links (course_id, kaid, person_id)
  select p_course, l ->> 'kaid', (l ->> 'person')::uuid
  from jsonb_array_elements(p -> 'links') l
  where (l ->> 'kaid') ~ '^[A-Za-z0-9_:.-]{4,80}$' and (l ->> 'person') ~ '^[0-9a-f-]{36}$'
    and private.on_roster(p_course, (l ->> 'person')::uuid)
    and private.has_consent((l ->> 'person')::uuid, 'mastery_records')
  on conflict do nothing;
  get diagnostics v_links = row_count;

  -- Every level, for linked students, for skills in the catalog.
  insert into public.mastery_khan_levels (course_id, person_id, skill_id, level, updated_at)
  select distinct on (k.person_id, s.skill_id) p_course, k.person_id, s.skill_id, left(lower(v ->> 'level'), 30), now()
  from jsonb_array_elements(p -> 'levels') v
  join public.mastery_khan_skills s on s.course_id = p_course and s.skill_id = v ->> 'skill'
  join public.mastery_khan_links k on k.course_id = p_course and k.person_id::text = v ->> 'person'
  where lower(v ->> 'level') ~ '^[a-z_ -]{1,30}$'
    and private.has_consent(k.person_id, 'mastery_records')
  on conflict (course_id, person_id, skill_id) do update set level = excluded.level, updated_at = excluded.updated_at;
  get diagnostics v_levels = row_count;

  insert into public.mastery_evidence (course_id, person_id, standard_code, source, title, level, external_key)
  select p_course, k.person_id, s.standard_code, 'khan', left('Khan Academy: ' || s.title, 200),
         case lower(v ->> 'level') when 'mastered' then 'extending' else 'proficient' end,
         'khan:' || s.skill_id || ':' || lower(v ->> 'level')
  from jsonb_array_elements(p -> 'levels') v
  join public.mastery_khan_skills s on s.course_id = p_course and s.skill_id = v ->> 'skill' and s.standard_code is not null
  join public.mastery_khan_links k on k.course_id = p_course and k.person_id::text = v ->> 'person'
  where lower(v ->> 'level') in ('proficient', 'mastered')
    and private.has_consent(k.person_id, 'mastery_records')
  on conflict (course_id, person_id, standard_code, external_key) where external_key is not null do nothing;
  get diagnostics v_added = row_count;

  v_summary := format('From the extension: %s Khan levels updated, %s new piece%s of evidence.', v_levels, v_added, case when v_added = 1 then '' else 's' end);
  insert into public.mastery_sources (course_id, source, last_run_at, last_summary)
  values (p_course, 'khan', now(), v_summary)
  on conflict (course_id, source) do update set last_run_at = excluded.last_run_at, last_summary = excluded.last_summary;
  insert into public.mastery_log (course_id, actor, action, detail)
  values (p_course, v_staff, 'import_khan_extension', jsonb_build_object('summary', v_summary, 'skills_seen', v_skills, 'new_links', v_links));
  return jsonb_build_object('skills', v_skills, 'links', v_links, 'levels', v_levels, 'added', v_added);
end $$;

-- The extension no longer filters by key skill; it sends every level.
create or replace function private.mastery_ext_context(p_token text) returns jsonb
  language plpgsql volatile security definer set search_path = '' as $$
declare
  v_staff uuid := private.ext_staff(p_token);
begin
  if v_staff is null then return null; end if;
  update public.mastery_extension_tokens set last_used_at = now()
  where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  return jsonb_build_object(
    'staff', (select display_name from public.staff where user_id = v_staff),
    'courses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'title', c.title, 'slug', c.slug, 'config_key', c.config_key,
        'khan_class_code', c.khan_class_code, 'is_sample', c.is_sample,
        'saved_config', (select ss.config from public.mastery_standard_sets ss where ss.key = c.config_key),
        'roster', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'first', p.first_name, 'last', p.last_name, 'preferred', p.preferred_name)), '[]')
                   from public.mastery_roster r join public.people p on p.id = r.person_id where r.course_id = c.id),
        'khan_links', (select coalesce(jsonb_agg(jsonb_build_object('kaid', k.kaid, 'person', k.person_id)), '[]')
                       from public.mastery_khan_links k where k.course_id = c.id)
      ) order by c.title)
      from public.mastery_courses c where c.teacher_id = v_staff), '[]'));
end $$;
