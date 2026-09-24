-- Formation Pathways — system of record (consented pilot).
--
-- One `people` row per student across the whole lifecycle (applicant →
-- enrolled → alumni). Source systems (Finalsite, Blackbaud, Canvas) only ever
-- ENRICH people who were added to the pilot by an admin and have consent on
-- file — importers never discover new people. See docs/system-of-record.md.
--
-- Guardrails live in the database, not just the app, so they hold no matter
-- which client writes (app user, service role, SQL editor):
--   * no real (non-sample) person can be created until pilot_settings says
--     leadership sign-off is recorded;
--   * imported records require an active `import_records` consent;
--   * staff observations require an active `staff_observations` consent;
--   * AI drafts require an active `ai_drafting` consent;
--   * every table has RLS; staff access is by role; the access log is
--     append-only.

-- ---------------------------------------------------------------- types

create type lifecycle_stage as enum
  ('applicant', 'admitted', 'enrolled', 'alumni', 'withdrawn');
create type source_system as enum ('finalsite', 'blackbaud', 'canvas');
create type staff_role as enum ('admin', 'admissions', 'teacher', 'staff');
create type consent_scope as enum
  ('import_records', 'ai_drafting', 'staff_observations');
create type observation_source as enum ('voice', 'text', 'admissions', 'canvas');

-- ---------------------------------------------------------------- tables

-- Single-row switch. Real data stays locked until an admin records who in
-- school leadership approved the pilot and where that approval lives.
create table pilot_settings (
  id boolean primary key default true check (id),
  real_data_enabled boolean not null default false,
  approved_by text,
  approval_reference text,
  approved_at timestamptz,
  check (
    not real_data_enabled
    or (approved_by is not null and approval_reference is not null and approved_at is not null)
  )
);
insert into pilot_settings default values;

create table staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique check (lower(email) like '%@pacificachristian.org'),
  display_name text not null,
  role staff_role not null default 'staff',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table people (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  preferred_name text,
  stage lifecycle_stage not null,
  grad_year int,
  current_grade int check (current_grade between 6 and 12),
  -- Fictional sample record (fixtures), exempt from the real-data gate.
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Identity resolution: the same person's id in each source system.
create table external_ids (
  person_id uuid not null references people (id) on delete cascade,
  system source_system not null,
  external_id text not null,
  primary key (system, external_id),
  unique (person_id, system)
);

create table consents (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people (id) on delete cascade,
  scope consent_scope not null,
  granted_by text not null,          -- parent/guardian name
  granted_on date not null,
  evidence text not null,            -- where the signed form lives
  recorded_by uuid references staff (user_id),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index consents_one_active
  on consents (person_id, scope) where revoked_at is null;

-- Finalsite: where they've been, in their own words.
create table admissions_records (
  person_id uuid primary key references people (id) on delete cascade,
  entry_year int,
  entering_grade int,
  application_status text,
  previous_school text,
  interests text[] not null default '{}',
  activities text[] not null default '{}',
  -- [{ "question": "...", "answer": "..." }]
  responses jsonb not null default '[]',
  imported_at timestamptz not null default now()
);

-- Blackbaud: current enrollment.
create table enrollments (
  person_id uuid primary key references people (id) on delete cascade,
  grade int,
  grad_year int,
  advisor_name text,
  enrolled_since date,
  imported_at timestamptz not null default now()
);

-- Canvas: courses and narrative evidence. Scores are deliberately NOT
-- imported — nothing in Formation Pathways shows a number, so we don't hold
-- one (data minimization).
create table course_enrollments (
  person_id uuid not null references people (id) on delete cascade,
  canvas_course_id text not null,
  course_name text not null,
  teacher_name text,
  imported_at timestamptz not null default now(),
  primary key (person_id, canvas_course_id)
);

create table academic_evidence (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people (id) on delete cascade,
  canvas_course_id text not null,
  assignment_name text not null,
  submitted_at timestamptz,
  late boolean not null default false,
  missing boolean not null default false,
  teacher_comment text,
  imported_at timestamptz not null default now(),
  unique (person_id, canvas_course_id, assignment_name)
);

create table observations (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people (id) on delete cascade,
  author_id uuid references staff (user_id) on delete set null,
  author_name text not null,
  source observation_source not null default 'voice',
  raw_text text not null,
  body text not null,
  tags text[] not null default '{}' check (tags <@ array[
    'Spiritual Depth', 'Intellectual Courage', 'Character Under Pressure',
    'Love of Neighbor', 'Emerging Superpowers', 'Sense of Calling'
  ]),
  discipline_flag text,
  created_at timestamptz not null default now()
);
create index observations_person on observations (person_id, created_at desc);

-- "Who they are today" + three Ruakh 2.0 pathways. Always a draft until a
-- named staff member approves it; never shown to a family from here.
create table pathway_drafts (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people (id) on delete cascade,
  portrait text not null,
  pathways jsonb not null,
  sources_used text[] not null default '{}',
  used_fallback boolean not null default false,
  generated_by uuid references staff (user_id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);
create index pathway_drafts_person on pathway_drafts (person_id, created_at desc);

create table import_runs (
  id uuid primary key default gen_random_uuid(),
  system source_system not null,
  mode text not null check (mode in ('sample', 'live')),
  started_by uuid references staff (user_id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  matched int not null default 0,
  skipped_no_consent int not null default 0,
  unmatched int not null default 0,
  error text
);

-- Append-only. person_id is intentionally NOT a foreign key so the trail
-- survives a participant being withdrawn and deleted.
create table access_log (
  id bigint generated always as identity primary key,
  staff_id uuid,
  action text not null,
  person_id uuid,
  detail jsonb not null default '{}',
  at timestamptz not null default now()
);
create index access_log_person on access_log (person_id, at desc);

-- ---------------------------------------------------------------- helpers

create function current_staff_role() returns staff_role
  language sql stable security definer set search_path = public as $$
  select role from staff where user_id = auth.uid() and active
$$;

create function is_staff() returns boolean
  language sql stable security definer set search_path = public as $$
  select current_staff_role() is not null
$$;

create function has_role(variadic roles staff_role[]) returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(current_staff_role() = any (roles), false)
$$;

-- Sample (fictional) people are treated as consented to everything.
create function has_consent(p uuid, s consent_scope) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from people where id = p and is_sample)
      or exists (select 1 from consents
                 where person_id = p and scope = s and revoked_at is null)
$$;

-- ---------------------------------------------------------------- gates

create function enforce_real_data_gate() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if not new.is_sample
     and not (select real_data_enabled from pilot_settings) then
    raise exception 'Real students are locked until leadership sign-off is saved on the Pilot page'
      using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger people_real_data_gate
  before insert or update of is_sample on people
  for each row execute function enforce_real_data_gate();

create function enforce_consent() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  needed consent_scope := tg_argv[0]::consent_scope;
begin
  if not has_consent(new.person_id, needed) then
    raise exception 'No active % consent on file for this person', needed
      using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger admissions_records_consent before insert or update on admissions_records
  for each row execute function enforce_consent('import_records');
create trigger enrollments_consent before insert or update on enrollments
  for each row execute function enforce_consent('import_records');
create trigger course_enrollments_consent before insert or update on course_enrollments
  for each row execute function enforce_consent('import_records');
create trigger academic_evidence_consent before insert or update on academic_evidence
  for each row execute function enforce_consent('import_records');
create trigger observations_consent before insert on observations
  for each row execute function enforce_consent('staff_observations');
create trigger pathway_drafts_consent before insert on pathway_drafts
  for each row execute function enforce_consent('ai_drafting');

create function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger people_touch before update on people
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------- RLS

alter table pilot_settings enable row level security;
alter table staff enable row level security;
alter table people enable row level security;
alter table external_ids enable row level security;
alter table consents enable row level security;
alter table admissions_records enable row level security;
alter table enrollments enable row level security;
alter table course_enrollments enable row level security;
alter table academic_evidence enable row level security;
alter table observations enable row level security;
alter table pathway_drafts enable row level security;
alter table import_runs enable row level security;
alter table access_log enable row level security;

create policy pilot_settings_read on pilot_settings for select to authenticated using (is_staff());
create policy pilot_settings_admin on pilot_settings for update to authenticated
  using (has_role('admin')) with check (has_role('admin'));

create policy staff_read on staff for select to authenticated
  using (user_id = auth.uid() or has_role('admin'));
create policy staff_admin on staff for all to authenticated
  using (has_role('admin')) with check (has_role('admin'));

-- Every active staff member can see who is in the pilot (needed to capture).
create policy people_read on people for select to authenticated using (is_staff());
create policy people_admin on people for all to authenticated
  using (has_role('admin')) with check (has_role('admin'));

create policy external_ids_read on external_ids for select to authenticated
  using (has_role('admin', 'admissions'));
create policy external_ids_admin on external_ids for all to authenticated
  using (has_role('admin')) with check (has_role('admin'));

create policy consents_read on consents for select to authenticated using (is_staff());
create policy consents_admin on consents for all to authenticated
  using (has_role('admin')) with check (has_role('admin'));

-- Applicant essays are admissions-office material.
create policy admissions_records_read on admissions_records for select to authenticated
  using (has_role('admin', 'admissions'));
create policy admissions_records_admin on admissions_records for all to authenticated
  using (has_role('admin')) with check (has_role('admin'));

create policy enrollments_read on enrollments for select to authenticated using (is_staff());
create policy enrollments_admin on enrollments for all to authenticated
  using (has_role('admin')) with check (has_role('admin'));

create policy course_enrollments_read on course_enrollments for select to authenticated using (is_staff());
create policy course_enrollments_admin on course_enrollments for all to authenticated
  using (has_role('admin')) with check (has_role('admin'));

create policy academic_evidence_read on academic_evidence for select to authenticated
  using (has_role('admin', 'admissions', 'teacher'));
create policy academic_evidence_admin on academic_evidence for all to authenticated
  using (has_role('admin')) with check (has_role('admin'));

-- Any staff member can add an observation, only as themselves.
create policy observations_read on observations for select to authenticated using (is_staff());
create policy observations_insert on observations for insert to authenticated
  with check (is_staff() and author_id = auth.uid());
create policy observations_delete on observations for delete to authenticated
  using (author_id = auth.uid() or has_role('admin'));

create policy pathway_drafts_read on pathway_drafts for select to authenticated
  using (has_role('admin', 'admissions'));
create policy pathway_drafts_insert on pathway_drafts for insert to authenticated
  with check (has_role('admin', 'admissions') and generated_by = auth.uid());
create policy pathway_drafts_approve on pathway_drafts for update to authenticated
  using (has_role('admin', 'admissions')) with check (has_role('admin', 'admissions'));

create policy import_runs_admin on import_runs for all to authenticated
  using (has_role('admin')) with check (has_role('admin'));

create policy access_log_insert on access_log for insert to authenticated
  with check (is_staff() and staff_id = auth.uid());
create policy access_log_read on access_log for select to authenticated
  using (has_role('admin'));
-- No update/delete policies: the log is append-only for every app user.
