-- Open House pathways (Fizzy #38): scan a QR code, type a first name, tap
-- what they love, get a personalized Formation Pathway on your own phone,
-- that night, and share it. Friends who come through a family's link are
-- tracked; when one applies, the sharing family earns an application-fee
-- waiver (only once leadership has turned the thank-you on).
--
-- seno approved (2026-10-16) that these AI pathways reach families BEFORE an
-- adult reviews them, a deliberate exception to "a named adult signs every
-- AI draft", on these guardrails: mentors and projects only from a curated
-- catalog (real faculty by name + department, real programs); an honest
-- "Drafted with AI" label; staff can pull or sign any card from the live
-- wall; no names sent to the AI.
--
-- Everything public goes through functions here (like submit_inquiry and the
-- family links): join, read your own page by its private token, share, read a
-- shared card by its code, list feeder schools. Only the app's server can
-- write a pathway: openhouse_set_pathways needs a key whose hash is in
-- private.openhouse_keys (seno adds it; docs/open-house.md), so nobody can
-- put their own words on a Pacifica card.

-- ------------------------------------------------------------------ tables

create table private.openhouse_keys (key_hash text primary key check (key_hash ~ '^[0-9a-f]{64}$'));
revoke all on private.openhouse_keys from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then revoke all on private.openhouse_keys from anon; end if;
end $$;
revoke all on private.openhouse_keys from authenticated;

create table public.openhouse_families (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- The family's own page: /oh/<token>. Only its hash is kept.
  page_token_hash text not null unique check (page_token_hash ~ '^[0-9a-f]{64}$'),
  -- Their code for sharing: /oh?ref=<code>.
  share_code text not null unique check (share_code ~ '^[A-Z0-9]{8}$'),
  referred_by_code text check (referred_by_code ~ '^[A-Z0-9]{8}$'),
  child_first_name text not null check (char_length(trim(child_first_name)) between 1 and 40),
  grade int check (grade between 5 and 12),
  interests text[] not null default '{}' check (cardinality(interests) <= 3),
  current_school text check (char_length(current_school) <= 120),
  parent_email text not null check (char_length(parent_email) <= 200 and parent_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  consent_contact boolean not null check (consent_contact),
  consent_version text not null check (char_length(consent_version) <= 40),
  -- [{ title, why, mentors: [id], projects: [id] }], from the server only.
  pathways jsonb check (pathways is null or (jsonb_typeof(pathways) = 'array' and jsonb_array_length(pathways) <= 2 and octet_length(pathways::text) <= 6000)),
  used_ai boolean not null default false,
  status text not null default 'new' check (status in ('new', 'live', 'pulled')),
  reviewed_by_name text,
  reviewed_at timestamptz,
  -- A parent or guardian chose to share (asked at the moment of sharing).
  shared_at timestamptz,
  applied boolean not null default false,
  fee_waived_at timestamptz,
  fee_waived_by text,
  -- Made by signed-in admissions in test mode (fictional only), e.g. on
  -- staging or before inquiries open.
  is_sample boolean not null default false,
  delete_after date not null default (now() + interval '18 months')::date
);
create index openhouse_families_created on public.openhouse_families (created_at desc);
create index openhouse_families_referred on public.openhouse_families (referred_by_code) where referred_by_code is not null;

-- Feeder schools, counts only (admissions enters them). Shown to families
-- only at 5 or more students, so no student can be picked out.
create table public.openhouse_schools (
  name text primary key check (char_length(trim(name)) between 2 and 120),
  students int not null check (students between 0 and 5000),
  highlights text[] not null default '{}' check (cardinality(highlights) <= 3),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ public functions (private bodies)

create function private.openhouse_join(p jsonb) returns jsonb
  language plpgsql volatile security definer set search_path = '' as $$
declare
  settings public.pilot_settings%rowtype;
  v_token text := encode(sha256(convert_to(gen_random_uuid()::text || clock_timestamp()::text || gen_random_uuid()::text, 'UTF8')), 'hex');
  v_code text;
  v_ref text;
  v_id uuid;
  v_interests text[];
  v_sample boolean := false;
begin
  select * into settings from public.pilot_settings limit 1;
  -- Test mode: signed-in admissions can always make fictional sample cards.
  if p is not null and jsonb_typeof(p) = 'object' and coalesce((p ->> 'sample') = 'true', false) then
    if not private.has_role('admin', 'admissions') then
      raise exception 'Test mode is for admissions' using errcode = 'P0001';
    end if;
    v_sample := true;
  elsif not coalesce(settings.inquiries_open, false) or not coalesce(settings.real_data_enabled, false) then
    raise exception 'Open House pathways aren''t open yet' using errcode = 'P0001';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' or octet_length(p::text) > 3000 then
    raise exception 'That couldn''t be read' using errcode = 'P0001';
  end if;
  if exists (select 1 from jsonb_object_keys(p) k where k not in
             ('child_first_name', 'grade', 'interests', 'current_school', 'parent_email', 'consent_contact', 'consent_version', 'ref', 'sample')) then
    raise exception 'Unexpected fields' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(x), '{}') into v_interests
  from (select distinct x from jsonb_array_elements_text(coalesce(p -> 'interests', '[]')) x where x ~ '^[a-z]{2,20}$' limit 3) t;
  -- Backstop against floods from one address (siblings are fine).
  if (select count(*) from public.openhouse_families
      where parent_email = lower(trim(p ->> 'parent_email')) and created_at > now() - interval '1 day') >= 4 then
    raise exception 'We already have your family. Check your phone for your link.' using errcode = 'P0001';
  end if;
  v_ref := upper(nullif(trim(p ->> 'ref'), ''));
  if v_ref is not null and not exists (select 1 from public.openhouse_families where share_code = v_ref) then v_ref := null; end if;
  for attempt in 1..5 loop
    v_code := upper(left(replace(gen_random_uuid()::text, '-', ''), 8));
    begin
      insert into public.openhouse_families (page_token_hash, share_code, referred_by_code, child_first_name, grade, interests,
                                             current_school, parent_email, consent_contact, consent_version, is_sample)
      values (encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), v_code, v_ref, trim(p ->> 'child_first_name'),
              case when (p ->> 'grade') ~ '^\d{1,2}$' then (p ->> 'grade')::int end, v_interests,
              nullif(trim(p ->> 'current_school'), ''), lower(trim(p ->> 'parent_email')),
              coalesce((p ->> 'consent_contact')::boolean, false), p ->> 'consent_version', v_sample)
      returning id into v_id;
      return jsonb_build_object('token', v_token, 'share_code', v_code);
    exception when unique_violation then null;
    end;
  end loop;
  raise exception 'Please try again' using errcode = 'P0001';
end $$;

-- The app's server writes the pathway, once, with its key. (Admissions'
-- own test-mode samples need no key.)
create function private.openhouse_set_pathways(p_token text, p_key text, p jsonb, p_used_ai boolean) returns boolean
  language plpgsql volatile security definer set search_path = '' as $$
declare v_keyed boolean := exists (select 1 from private.openhouse_keys
                                   where key_hash = encode(sha256(convert_to(coalesce(p_key, ''), 'UTF8')), 'hex'));
begin
  if not v_keyed and not private.has_role('admin', 'admissions') then
    raise exception 'Not allowed' using errcode = 'P0001';
  end if;
  update public.openhouse_families
  set pathways = p, used_ai = coalesce(p_used_ai, false), status = 'live'
  where page_token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') and status = 'new'
    and (v_keyed or is_sample);
  if not found and not v_keyed then raise exception 'Not allowed' using errcode = 'P0001'; end if;
  return found;
end $$;

create function private.openhouse_page(p_token text) returns jsonb
  language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'child_first_name', f.child_first_name, 'grade', f.grade, 'interests', f.interests, 'current_school', f.current_school,
    'pathways', case when f.status = 'live' then f.pathways end, 'status', f.status, 'used_ai', f.used_ai,
    'reviewed_by_name', f.reviewed_by_name, 'share_code', f.share_code, 'shared', f.shared_at is not null,
    'waiver', (select case when s.referral_thanks_open then s.referral_thanks_what end from public.pilot_settings s limit 1),
    'friends', (select count(*) from public.openhouse_families r where r.referred_by_code = f.share_code))
  from public.openhouse_families f
  where f.page_token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
$$;

-- A parent or guardian chooses to share; returns the share code.
create function private.openhouse_share(p_token text, p_guardian boolean) returns text
  language plpgsql volatile security definer set search_path = '' as $$
declare v_code text;
begin
  if not coalesce(p_guardian, false) then
    raise exception 'Only a parent or guardian can share' using errcode = 'P0001';
  end if;
  update public.openhouse_families set shared_at = coalesce(shared_at, now())
  where page_token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') and status = 'live'
  returning share_code into v_code;
  return v_code;
end $$;

-- What a shared link shows: first name and the pathways, only once shared
-- and while live. Never the email, school or anything else.
create function private.openhouse_public(p_code text) returns jsonb
  language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('child_first_name', f.child_first_name, 'pathways', f.pathways, 'used_ai', f.used_ai,
                            'reviewed_by_name', f.reviewed_by_name,
                            'waiver', (select case when s.referral_thanks_open then s.referral_thanks_what end from public.pilot_settings s limit 1))
  from public.openhouse_families f
  where f.share_code = upper(coalesce(p_code, '')) and f.shared_at is not null and f.status = 'live'
$$;

create function private.openhouse_school_list() returns jsonb
  language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'students', students, 'highlights', highlights) order by name), '[]')
  from public.openhouse_schools where students >= 5
$$;

-- ------------------------------------------------------------------ staff (live wall)

-- Staff can sign or pull a card, mark a family applied, and waive the fee
-- (only once leadership turned the thank-you on, and only for a family whose
-- friend applied through their link). Who signed or waived is stamped from
-- the signed-in staff record. Nothing else changes.
-- Security invoker on purpose: current_user is 'authenticated' only for a
-- staff member's own update; the functions above run as their owner.
create function private.openhouse_families_guard() returns trigger
  language plpgsql security invoker set search_path = '' as $$
declare v_name text := (select s.display_name from public.staff s where s.user_id = (select auth.uid()) and s.active);
begin
  if new.id is distinct from old.id or new.page_token_hash is distinct from old.page_token_hash
     or new.share_code is distinct from old.share_code or new.referred_by_code is distinct from old.referred_by_code
     or new.child_first_name is distinct from old.child_first_name or new.parent_email is distinct from old.parent_email
     or new.interests is distinct from old.interests or new.pathways is distinct from old.pathways
     or new.created_at is distinct from old.created_at or new.shared_at is distinct from old.shared_at
     or new.is_sample is distinct from old.is_sample then
    -- (The server's pathway write and the family's share run inside the
    -- functions above, as their owner, not as the signed-in role.)
    if current_user = 'authenticated' then
      raise exception 'Only a card''s status, review, application and waiver can change here' using errcode = 'P0001';
    end if;
  end if;
  if current_user <> 'authenticated' then return new; end if;
  if new.reviewed_at is distinct from old.reviewed_at or new.reviewed_by_name is distinct from old.reviewed_by_name then
    new.reviewed_by_name := v_name;
    new.reviewed_at := now();
  end if;
  if new.fee_waived_at is not null and old.fee_waived_at is null then
    if not coalesce((select referral_thanks_open from public.pilot_settings limit 1), false) then
      raise exception 'The fee waiver isn''t on yet (leadership''s decision, on the referrals page)' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.openhouse_families r where r.referred_by_code = new.share_code and r.applied) then
      raise exception 'No friend has applied through this family''s link yet' using errcode = 'P0001';
    end if;
    new.fee_waived_by := v_name;
    new.fee_waived_at := now();
  elsif new.fee_waived_at is distinct from old.fee_waived_at or new.fee_waived_by is distinct from old.fee_waived_by then
    raise exception 'A waiver, once given, stays' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger openhouse_families_guard before update on public.openhouse_families
  for each row execute function private.openhouse_families_guard();

-- ------------------------------------------------------------------ grants

do $$
declare f text;
begin
  foreach f in array array['openhouse_join(jsonb)', 'openhouse_set_pathways(text, text, jsonb, boolean)', 'openhouse_page(text)',
                           'openhouse_share(text, boolean)', 'openhouse_public(text)', 'openhouse_school_list()', 'openhouse_families_guard()'] loop
    execute format('revoke all on function private.%s from public', f);
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function private.openhouse_families_guard() from anon;
    grant execute on function private.openhouse_join(jsonb) to anon;
    grant execute on function private.openhouse_set_pathways(text, text, jsonb, boolean) to anon;
    grant execute on function private.openhouse_page(text) to anon;
    grant execute on function private.openhouse_share(text, boolean) to anon;
    grant execute on function private.openhouse_public(text) to anon;
    grant execute on function private.openhouse_school_list() to anon;
  end if;
end $$;
revoke all on function private.openhouse_families_guard() from authenticated;
grant execute on function private.openhouse_join(jsonb) to authenticated;
grant execute on function private.openhouse_set_pathways(text, text, jsonb, boolean) to authenticated;
grant execute on function private.openhouse_page(text) to authenticated;
grant execute on function private.openhouse_share(text, boolean) to authenticated;
grant execute on function private.openhouse_public(text) to authenticated;
grant execute on function private.openhouse_school_list() to authenticated;

create function public.openhouse_join(p jsonb) returns jsonb
  language sql volatile security invoker set search_path = '' as $$ select private.openhouse_join(p) $$;
create function public.openhouse_set_pathways(p_token text, p_key text, p jsonb, p_used_ai boolean) returns boolean
  language sql volatile security invoker set search_path = '' as $$ select private.openhouse_set_pathways(p_token, p_key, p, p_used_ai) $$;
create function public.openhouse_page(p_token text) returns jsonb
  language sql stable security invoker set search_path = '' as $$ select private.openhouse_page(p_token) $$;
create function public.openhouse_share(p_token text, p_guardian boolean) returns text
  language sql volatile security invoker set search_path = '' as $$ select private.openhouse_share(p_token, p_guardian) $$;
create function public.openhouse_public(p_code text) returns jsonb
  language sql stable security invoker set search_path = '' as $$ select private.openhouse_public(p_code) $$;
create function public.openhouse_school_list() returns jsonb
  language sql stable security invoker set search_path = '' as $$ select private.openhouse_school_list() $$;

-- ------------------------------------------------------------------ RLS

alter table public.openhouse_families enable row level security;
alter table public.openhouse_schools enable row level security;

create policy openhouse_families_read on public.openhouse_families for select to authenticated
  using ((select private.has_role('admin', 'admissions')));
create policy openhouse_families_update on public.openhouse_families for update to authenticated
  using ((select private.has_role('admin', 'admissions'))) with check ((select private.has_role('admin', 'admissions')));
create policy openhouse_families_delete on public.openhouse_families for delete to authenticated
  using ((select private.has_role('admin')));

create policy openhouse_schools_read on public.openhouse_schools for select to authenticated
  using ((select private.has_role('admin', 'admissions')));
create policy openhouse_schools_write on public.openhouse_schools for all to authenticated
  using ((select private.has_role('admin', 'admissions'))) with check ((select private.has_role('admin', 'admissions')));

grant select, update, delete on public.openhouse_families to authenticated;
grant select, insert, update, delete on public.openhouse_schools to authenticated;
