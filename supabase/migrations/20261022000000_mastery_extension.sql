-- Mastery Hub browser extension (Fizzy #37): Khan Academy key skills, and
-- tagging resources from any web page.
--
-- The teacher's Chrome extension (extensions/mastery-hub) reads Khan
-- Academy's skills report in the teacher's own signed-in browser and sends
-- the levels here; it also saves pages the teacher tags for a class. It
-- authenticates with a token the teacher creates on /mastery: random, shown
-- once, stored only as a SHA-256 hash, expiring, revocable. Every call goes
-- through a SECURITY DEFINER function here that checks the token, that the
-- course is the token owner's own, the roster and the consent, exactly as
-- the family links do (20261011000000_family_share.sql).
--
-- Khan Academy, as seno teaches with it:
--   * only two levels count: "proficient" → Proficient, "mastered" →
--     Extending. Anything below is not evidence (and never a mark against);
--   * only the teacher's KEY skills count: at most three per Khan unit, each
--     mapped to one standard (mastery_khan_skills.chosen). The rest of the
--     catalog is kept (titles only) so the teacher can pick from it.
--   * Khan students are linked to roster students in the extension, in the
--     teacher's browser; only links to students on the roster with consent
--     are stored. A Khan student who isn't matched never reaches the hub.

alter table public.mastery_courses add column khan_class_code text
  check (khan_class_code ~ '^[A-Z0-9]{6,12}$');

-- ------------------------------------------------------------------ tables

create table public.mastery_extension_tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  staff_id uuid not null default auth.uid() references public.staff (user_id) on delete cascade,
  label text not null default 'Chrome' check (length(trim(label)) between 1 and 60),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '180 days',
  last_used_at timestamptz,
  revoked_at timestamptz,
  check (expires_at <= created_at + interval '366 days')
);

create table public.mastery_khan_links (
  course_id uuid not null references public.mastery_courses (id) on delete cascade,
  kaid text not null check (kaid ~ '^[A-Za-z0-9_:.-]{4,80}$'),
  person_id uuid not null references public.people (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (course_id, kaid),
  unique (course_id, person_id)
);

create table public.mastery_khan_skills (
  course_id uuid not null references public.mastery_courses (id) on delete cascade,
  skill_id text not null check (skill_id ~ '^[A-Za-z0-9_:.-]{1,80}$'),
  title text not null check (length(trim(title)) between 1 and 200),
  unit_title text not null default '' check (length(unit_title) <= 200),
  standard_code text check (standard_code ~ '^[A-Za-z0-9.-]{1,20}$'),
  chosen boolean not null default false,
  seen_at timestamptz not null default now(),
  primary key (course_id, skill_id),
  check (not chosen or standard_code is not null)
);

create table public.mastery_course_resources (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.mastery_courses (id) on delete cascade,
  -- Where it shows: one standard, or a whole unit (group).
  standard_code text check (standard_code ~ '^[A-Za-z0-9.-]{1,20}$'),
  group_code text check (group_code ~ '^[A-Za-z0-9.-]{1,20}$'),
  kind text not null check (kind in ('video', 'khan', 'phet', 'openstax', 'ap_classroom', 'other')),
  title text not null check (length(trim(title)) between 1 and 200),
  url text not null check (url ~ '^https://[^\s@]+$' and length(url) <= 500),
  video_id text check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  channel text check (length(channel) <= 100),
  note text check (length(note) <= 300),
  added_by uuid default auth.uid() references public.staff (user_id) on delete set null,
  created_at timestamptz not null default now(),
  check (standard_code is not null or group_code is not null),
  check ((kind = 'video') = (video_id is not null))
);
create index mastery_course_resources_course on public.mastery_course_resources (course_id, created_at desc);

-- ------------------------------------------------------------------ guards

-- A token is created by its owner and can only be revoked after that.
create function private.mastery_extension_tokens_guard() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.staff_id := (select auth.uid());
    new.created_at := now();
    new.last_used_at := null;
    new.revoked_at := null;
    if new.expires_at > now() + interval '366 days' then new.expires_at := now() + interval '180 days'; end if;
    return new;
  end if;
  if new.token_hash is distinct from old.token_hash or new.staff_id is distinct from old.staff_id
     or new.created_at is distinct from old.created_at or new.expires_at is distinct from old.expires_at
     or new.label is distinct from old.label or old.revoked_at is not null then
    raise exception 'A connection can only be revoked' using errcode = 'P0001';
  end if;
  return new;
end $$;

create function private.mastery_khan_links_guard() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if not private.on_roster(new.course_id, new.person_id) then
    raise exception 'That student is not on this course''s roster' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- At most three key skills per Khan unit.
create function private.mastery_khan_skills_guard() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if new.chosen and (select count(*) from public.mastery_khan_skills
                     where course_id = new.course_id and unit_title = new.unit_title
                       and chosen and skill_id <> new.skill_id) >= 3 then
    raise exception 'At most three key skills per unit. Unpick one first.' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ------------------------------------------------------------------ extension functions

-- The active teacher or admin a token belongs to, or null.
create function private.ext_staff(p_token text) returns uuid
  language sql stable security definer set search_path = '' as $$
  select t.staff_id
  from public.mastery_extension_tokens t
  join public.staff s on s.user_id = t.staff_id and s.active and s.role::text in ('admin', 'teacher')
  where t.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
    and t.revoked_at is null and t.expires_at > now()
$$;

-- Everything the extension needs: the teacher's own courses, each with its
-- standards (if saved in the hub), roster names (to match Khan students in
-- the teacher's browser), existing Khan links and key skills.
create function private.mastery_ext_context(p_token text) returns jsonb
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
                       from public.mastery_khan_links k where k.course_id = c.id),
        'khan_key_skills', (select coalesce(jsonb_agg(jsonb_build_object('id', s.skill_id, 'standard', s.standard_code)), '[]')
                            from public.mastery_khan_skills s where s.course_id = c.id and s.chosen)
      ) order by c.title)
      from public.mastery_courses c where c.teacher_id = v_staff), '[]'));
end $$;

-- One Khan sync for one course:
--   p = { skills: [{id, title, unit}], links: [{kaid, person}], levels: [{person, skill, level}] }
-- Keeps the skill catalog, stores new links (roster + consent only), and adds
-- evidence for KEY skills at proficient / mastered. Running it twice adds
-- nothing new.
create function private.mastery_ext_khan_sync(p_token text, p_course uuid, p jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = '' as $$
declare
  v_staff uuid := private.ext_staff(p_token);
  v_skills int := 0;
  v_links int := 0;
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
     or jsonb_array_length(p -> 'skills') > 3000 or jsonb_array_length(p -> 'links') > 500 or jsonb_array_length(p -> 'levels') > 30000 then
    raise exception 'That sync doesn''t look right' using errcode = 'P0001';
  end if;

  insert into public.mastery_khan_skills (course_id, skill_id, title, unit_title, seen_at)
  select p_course, s ->> 'id', left(s ->> 'title', 200), left(coalesce(s ->> 'unit', ''), 200), now()
  from jsonb_array_elements(p -> 'skills') s
  where (s ->> 'id') ~ '^[A-Za-z0-9_:.-]{1,80}$' and length(trim(coalesce(s ->> 'title', ''))) > 0
  on conflict (course_id, skill_id) do update set title = excluded.title, unit_title = excluded.unit_title, seen_at = excluded.seen_at;
  get diagnostics v_skills = row_count;

  insert into public.mastery_khan_links (course_id, kaid, person_id)
  select p_course, l ->> 'kaid', (l ->> 'person')::uuid
  from jsonb_array_elements(p -> 'links') l
  where (l ->> 'kaid') ~ '^[A-Za-z0-9_:.-]{4,80}$' and (l ->> 'person') ~ '^[0-9a-f-]{36}$'
    and private.on_roster(p_course, (l ->> 'person')::uuid)
    and private.has_consent((l ->> 'person')::uuid, 'mastery_records')
  on conflict do nothing;
  get diagnostics v_links = row_count;

  insert into public.mastery_evidence (course_id, person_id, standard_code, source, title, level, external_key)
  select p_course, k.person_id, s.standard_code, 'khan', left('Khan Academy: ' || s.title, 200),
         case lower(v ->> 'level') when 'mastered' then 'extending' else 'proficient' end,
         'khan:' || s.skill_id || ':' || lower(v ->> 'level')
  from jsonb_array_elements(p -> 'levels') v
  join public.mastery_khan_skills s on s.course_id = p_course and s.skill_id = v ->> 'skill' and s.chosen
  join public.mastery_khan_links k on k.course_id = p_course and k.person_id::text = v ->> 'person'
  where lower(v ->> 'level') in ('proficient', 'mastered')
    and private.has_consent(k.person_id, 'mastery_records')
  on conflict (course_id, person_id, standard_code, external_key) where external_key is not null do nothing;
  get diagnostics v_added = row_count;

  v_summary := format('From the extension: %s new piece%s of evidence (key skills at proficient or mastered).', v_added, case when v_added = 1 then '' else 's' end);
  insert into public.mastery_sources (course_id, source, last_run_at, last_summary)
  values (p_course, 'khan', now(), v_summary)
  on conflict (course_id, source) do update set last_run_at = excluded.last_run_at, last_summary = excluded.last_summary;
  insert into public.mastery_log (course_id, actor, action, detail)
  values (p_course, v_staff, 'import_khan_extension', jsonb_build_object('summary', v_summary, 'skills_seen', v_skills, 'new_links', v_links));
  return jsonb_build_object('skills', v_skills, 'links', v_links, 'added', v_added);
end $$;

-- Tag a page for a course: one standard or a whole unit.
create function private.mastery_ext_tag(p_token text, p_course uuid, p jsonb) returns uuid
  language plpgsql volatile security definer set search_path = '' as $$
declare
  v_staff uuid := private.ext_staff(p_token);
  v_id uuid;
begin
  if v_staff is null then raise exception 'This extension isn''t connected (or the connection was revoked)' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.mastery_courses where id = p_course and teacher_id = v_staff) then
    raise exception 'That course isn''t yours' using errcode = 'P0001';
  end if;
  insert into public.mastery_course_resources (course_id, standard_code, group_code, kind, title, url, video_id, channel, note, added_by)
  values (p_course, nullif(p ->> 'standard', ''), nullif(p ->> 'group', ''), p ->> 'kind', left(p ->> 'title', 200), p ->> 'url',
          nullif(p ->> 'video_id', ''), left(nullif(p ->> 'channel', ''), 100), left(nullif(p ->> 'note', ''), 300), v_staff)
  returning id into v_id;
  insert into public.mastery_log (course_id, actor, action, detail)
  values (p_course, v_staff, 'resource_tagged', jsonb_build_object('title', left(p ->> 'title', 120), 'standard', p ->> 'standard', 'group', p ->> 'group'));
  return v_id;
end $$;

-- ------------------------------------------------------------------ grants on functions

do $$
declare f text;
begin
  foreach f in array array['mastery_extension_tokens_guard()', 'mastery_khan_links_guard()', 'mastery_khan_skills_guard()'] loop
    execute format('revoke all on function private.%s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function private.%s from anon', f);
    end if;
    execute format('revoke all on function private.%s from authenticated', f);
  end loop;
end $$;
revoke all on function private.ext_staff(text) from public;
revoke all on function private.mastery_ext_context(text) from public;
revoke all on function private.mastery_ext_khan_sync(text, uuid, jsonb) from public;
revoke all on function private.mastery_ext_tag(text, uuid, jsonb) from public;

-- Called by the app's extension routes with the publishable key and no
-- session (the token is the credential), like the family-link functions.
create function public.mastery_ext_context(p_token text) returns jsonb
  language sql volatile security invoker set search_path = '' as $$ select private.mastery_ext_context(p_token) $$;
create function public.mastery_ext_khan_sync(p_token text, p_course uuid, p jsonb) returns jsonb
  language sql volatile security invoker set search_path = '' as $$ select private.mastery_ext_khan_sync(p_token, p_course, p) $$;
create function public.mastery_ext_tag(p_token text, p_course uuid, p jsonb) returns uuid
  language sql volatile security invoker set search_path = '' as $$ select private.mastery_ext_tag(p_token, p_course, p) $$;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function private.mastery_ext_context(text) to anon;
    grant execute on function private.mastery_ext_khan_sync(text, uuid, jsonb) to anon;
    grant execute on function private.mastery_ext_tag(text, uuid, jsonb) to anon;
  end if;
end $$;
grant execute on function private.mastery_ext_context(text) to authenticated;
grant execute on function private.mastery_ext_khan_sync(text, uuid, jsonb) to authenticated;
grant execute on function private.mastery_ext_tag(text, uuid, jsonb) to authenticated;

-- ------------------------------------------------------------------ triggers

create trigger mastery_extension_tokens_guard before insert or update on public.mastery_extension_tokens
  for each row execute function private.mastery_extension_tokens_guard();
create trigger mastery_khan_links_consent before insert on public.mastery_khan_links
  for each row execute function private.enforce_consent('mastery_records');
create trigger mastery_khan_links_guard before insert on public.mastery_khan_links
  for each row execute function private.mastery_khan_links_guard();
create trigger mastery_khan_skills_guard before insert or update on public.mastery_khan_skills
  for each row execute function private.mastery_khan_skills_guard();

-- ------------------------------------------------------------------ RLS

alter table public.mastery_extension_tokens enable row level security;
alter table public.mastery_khan_links enable row level security;
alter table public.mastery_khan_skills enable row level security;
alter table public.mastery_course_resources enable row level security;

create policy mastery_extension_tokens_read on public.mastery_extension_tokens for select to authenticated
  using ((select private.is_staff()) and staff_id = (select auth.uid()));
create policy mastery_extension_tokens_insert on public.mastery_extension_tokens for insert to authenticated
  with check ((select private.has_role('admin', 'teacher')) and staff_id = (select auth.uid()));
create policy mastery_extension_tokens_revoke on public.mastery_extension_tokens for update to authenticated
  using ((select private.is_staff()) and staff_id = (select auth.uid()))
  with check ((select private.is_staff()) and staff_id = (select auth.uid()));

create policy mastery_khan_links_teacher on public.mastery_khan_links for select to authenticated
  using ((select private.teaches_course(course_id)));
create policy mastery_khan_links_delete on public.mastery_khan_links for delete to authenticated
  using ((select private.teaches_course(course_id)));

create policy mastery_khan_skills_read on public.mastery_khan_skills for select to authenticated
  using ((select private.teaches_course(course_id)));
create policy mastery_khan_skills_update on public.mastery_khan_skills for update to authenticated
  using ((select private.teaches_course(course_id))) with check ((select private.teaches_course(course_id)));

-- Tagged resources: the teacher manages them; students on the roster see them.
create policy mastery_course_resources_read on public.mastery_course_resources for select to authenticated
  using ((select private.teaches_course(course_id))
         or (select private.on_roster(course_id, (select private.current_student()))));
create policy mastery_course_resources_insert on public.mastery_course_resources for insert to authenticated
  with check ((select private.teaches_course(course_id)));
create policy mastery_course_resources_delete on public.mastery_course_resources for delete to authenticated
  using ((select private.teaches_course(course_id)));

grant select, insert, update on public.mastery_extension_tokens to authenticated;
grant select, delete on public.mastery_khan_links to authenticated;
grant select, update on public.mastery_khan_skills to authenticated;
grant select, insert, delete on public.mastery_course_resources to authenticated;
