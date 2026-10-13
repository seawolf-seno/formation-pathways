-- Mastery Hub: automatic imports with nobody signed in (Fizzy #37).
--
-- Until now Canvas evidence came in only when a teacher opened their course
-- page. To run on a schedule (a Vercel Cron job), the importer needs its own
-- way into the database. It is NOT the service-role key (which ignores every
-- policy) and not a staff account (which would read pathways, observations
-- and the rest). It is one narrow Postgres role:
--
--   mastery_importer can
--     - read the real (non-sample) mastery courses that have a Canvas course id,
--       their rosters, and those students' Canvas ids;
--     - read which import keys a course already has (no scores, no levels);
--     - add Canvas / Khan Academy evidence for students on those rosters;
--     - record when it ran (mastery_sources) and a summary in mastery_log.
--   It can't read names, consents, observations, sparks, drafts, scores, or
--   anything else, and it can't change or delete anything it didn't add.
--
-- RLS applies to it like any other non-owner role (no BYPASSRLS). The consent,
-- roster and log triggers still run on every row it adds.
--
-- The role is created WITHOUT login. To switch automatic imports on, seno sets
-- a password in the SQL editor (never in this file):
--     alter role mastery_importer with login password '<generated>';
-- and puts the pooler connection string in Vercel as MASTERY_IMPORTER_DATABASE_URL
-- (docs/mastery-hub.md, "Automatic imports"). Without it the cron job does nothing.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'mastery_importer') then
    create role mastery_importer nologin noinherit;
  end if;
end $$;

grant usage on schema public to mastery_importer;

-- An automatic import has no person behind it: recorded_by stays empty for
-- Canvas and Khan rows the importer adds (shown as "Automatic import"). Every
-- other row is still stamped with the signed-in adult by the guard.
alter table public.mastery_evidence alter column recorded_by drop not null;
-- The guard trigger already stamps recorded_by with auth.uid(); the column
-- default did the same and would fail for a role outside Supabase's auth
-- schema, so it goes.
alter table public.mastery_evidence alter column recorded_by drop default;
alter table public.mastery_evidence add constraint mastery_evidence_recorded_by_check
  check (recorded_by is not null or source in ('canvas', 'khan'));

-- ------------------------------------------------------------------ grants
-- Column-level: the importer never sees a score, a level or a name.

grant select (id, teacher_id, config_key, canvas_course_id, is_sample) on public.mastery_courses to mastery_importer;
grant select (course_id, person_id) on public.mastery_roster to mastery_importer;
grant select (person_id, system, external_id) on public.external_ids to mastery_importer;
grant select (course_id, person_id, standard_code, external_key) on public.mastery_evidence to mastery_importer;
grant insert (course_id, person_id, standard_code, source, title, score, max_score, occurred_at, external_key)
  on public.mastery_evidence to mastery_importer;
grant select (course_id, source, paused, last_run_at, last_summary) on public.mastery_sources to mastery_importer;
grant insert (course_id, source, last_run_at, last_summary) on public.mastery_sources to mastery_importer;
grant update (last_run_at, last_summary) on public.mastery_sources to mastery_importer;
-- actor is written explicitly as null: its default, auth.uid(), lives in a
-- schema this role can't use.
grant insert (course_id, actor, action, detail) on public.mastery_log to mastery_importer;

-- ------------------------------------------------------------------ RLS

-- Real courses connected to Canvas only. Sample courses are never imported.
create policy mastery_courses_importer on public.mastery_courses for select to mastery_importer
  using (not is_sample and canvas_course_id is not null);

create policy mastery_roster_importer on public.mastery_roster for select to mastery_importer
  using (exists (select 1 from public.mastery_courses c
                 where c.id = course_id and not c.is_sample and c.canvas_course_id is not null));

-- Canvas ids of students on such a roster, and nothing else in external_ids.
create policy external_ids_importer on public.external_ids for select to mastery_importer
  using (system = 'canvas' and exists (
    select 1 from public.mastery_roster r join public.mastery_courses c on c.id = r.course_id
    where r.person_id = external_ids.person_id and not c.is_sample and c.canvas_course_id is not null));

create policy mastery_evidence_importer_read on public.mastery_evidence for select to mastery_importer
  using (source in ('canvas', 'khan'));
create policy mastery_evidence_importer_insert on public.mastery_evidence for insert to mastery_importer
  with check (source in ('canvas', 'khan') and recorded_by is null
              and exists (select 1 from public.mastery_courses c
                          where c.id = course_id and not c.is_sample and c.canvas_course_id is not null));

create policy mastery_sources_importer_read on public.mastery_sources for select to mastery_importer
  using (source = 'canvas');
create policy mastery_sources_importer_insert on public.mastery_sources for insert to mastery_importer
  with check (source = 'canvas');
create policy mastery_sources_importer_update on public.mastery_sources for update to mastery_importer
  using (source = 'canvas') with check (source = 'canvas');

create policy mastery_log_importer on public.mastery_log for insert to mastery_importer
  with check (action = 'import_canvas_scheduled' and actor is null);

