-- Formation Pathways' own inquiry form (/discover) and its referral codes
-- (Fizzy #29). Families who are curious about Pacifica tell us about their
-- child here instead of Finalsite's form; admissions exports new inquiries to
-- Finalsite with its Create import (the Finalsite External API is read-only),
-- matched by finalsite_external_id. docs/inquiries.md has the whole flow.
--
-- These are real families, so:
-- * the public form stays shut until an admin records leadership's approval
--   (inquiries_open, with who approved and where, like the funnel switch)
--   AND the real-data gate is open;
-- * the public can only call submit_inquiry(), which validates everything;
--   nobody but admin and admissions can read inquiries;
-- * every inquiry carries the parent's consent, its wording version and a
--   date to delete it by if the family goes no further.

-- ---------------------------------------------------------------- the switch
alter table public.pilot_settings
  add column inquiries_open boolean not null default false,
  add column inquiries_approved_by text,
  add column inquiries_approval_reference text,
  add column inquiries_approved_at timestamptz,
  add constraint inquiries_approval_recorded check (
    not inquiries_open
    or (inquiries_approved_by is not null and inquiries_approval_reference is not null
        and inquiries_approved_at is not null)
  );

-- ---------------------------------------------------------------- inquiries
create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'new'
    check (status in ('new', 'contacted', 'applied', 'enrolled', 'closed')),
  -- Where the family came from: the school website, a family's shared
  -- pathway (then referred_by_code says whose), or straight to the link.
  source text not null default 'direct' check (source in ('website', 'share', 'direct')),
  referred_by_code text,
  -- This family's own code, for when they share their pathway. Opaque.
  share_code text not null unique check (share_code ~ '^[A-Z0-9]{8}$'),

  parent_first_name text not null check (char_length(parent_first_name) between 1 and 80),
  parent_last_name text not null check (char_length(parent_last_name) between 1 and 80),
  parent_relationship text not null check (parent_relationship in ('Mother', 'Father', 'Guardian', 'Grandparent', 'Other')),
  parent_email text not null check (char_length(parent_email) <= 200 and parent_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  parent_phone text check (char_length(parent_phone) <= 40),

  -- Finalsite's Create import needs a complete household address.
  address_1 text not null check (char_length(address_1) between 1 and 200),
  address_2 text check (char_length(address_2) <= 200),
  city text not null check (char_length(city) between 1 and 100),
  state text not null check (char_length(state) between 1 and 100),
  zip text not null check (char_length(zip) between 1 and 20),
  country text not null default 'United States' check (char_length(country) between 1 and 100),

  child_first_name text not null check (char_length(child_first_name) between 1 and 80),
  child_last_name text not null check (char_length(child_last_name) between 1 and 80),
  child_grade int not null check (child_grade between 6 and 12),
  entry_year int not null check (entry_year between 2020 and 2100),
  current_school text check (char_length(current_school) <= 200),
  -- "One thing about your child a brochure would miss", in the parent's words.
  one_thing text check (char_length(one_thing) <= 1000),
  interests text[] not null default '{}' check (cardinality(interests) <= 20),

  consent_contact boolean not null check (consent_contact),
  consent_pathway boolean not null default false,
  consent_version text not null check (char_length(consent_version) between 1 and 40),
  delete_after date not null default (now() + interval '18 months')::date,
  is_sample boolean not null default false,

  -- Finalsite: the id we give it (CHILD.external_id), when admissions last
  -- exported this inquiry, and the contact id once the read-only API finds it.
  finalsite_external_id text generated always as ('FP-' || upper(left(replace(id::text, '-', ''), 12))) stored unique,
  finalsite_exported_at timestamptz,
  finalsite_contact_id text,
  applied_at timestamptz
);
create index inquiries_created on public.inquiries (created_at desc);
create index inquiries_referred_by on public.inquiries (referred_by_code) where referred_by_code is not null;

alter table public.inquiries enable row level security;

-- Supabase no longer grants new tables to the API by default: say so here.
grant select, insert, update, delete on public.inquiries to authenticated;

create policy inquiries_read on public.inquiries for select to authenticated
  using ((select private.has_role('admin', 'admissions')));
-- Staff only add fictional samples by hand (for trying the flow); real
-- inquiries arrive through submit_inquiry().
create policy inquiries_insert_sample on public.inquiries for insert to authenticated
  with check ((select private.has_role('admin')) and is_sample);
create policy inquiries_update on public.inquiries for update to authenticated
  using ((select private.has_role('admin', 'admissions')))
  with check ((select private.has_role('admin', 'admissions')));
create policy inquiries_delete on public.inquiries for delete to authenticated
  using ((select private.has_role('admin')));

-- What the family told us doesn't change after they send it; staff change
-- only the follow-up fields (status, Finalsite, applied_at, delete_after).
create function private.inquiries_guard() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if (new.parent_first_name, new.parent_last_name, new.parent_relationship, new.parent_email,
      new.parent_phone, new.address_1, new.address_2, new.city, new.state, new.zip, new.country,
      new.child_first_name, new.child_last_name, new.child_grade, new.entry_year, new.current_school,
      new.one_thing, new.interests, new.consent_contact, new.consent_pathway, new.consent_version,
      new.source, new.referred_by_code, new.share_code, new.is_sample, new.created_at)
     is distinct from
     (old.parent_first_name, old.parent_last_name, old.parent_relationship, old.parent_email,
      old.parent_phone, old.address_1, old.address_2, old.city, old.state, old.zip, old.country,
      old.child_first_name, old.child_last_name, old.child_grade, old.entry_year, old.current_school,
      old.one_thing, old.interests, old.consent_contact, old.consent_pathway, old.consent_version,
      old.source, old.referred_by_code, old.share_code, old.is_sample, old.created_at) then
    raise exception 'What a family sent can''t be changed; only follow-up fields can' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function private.inquiries_guard() from public, anon, authenticated;
create trigger inquiries_guard before update on public.inquiries
  for each row execute function private.inquiries_guard();

-- ---------------------------------------------------------------- the public way in
create function private.submit_inquiry(p jsonb) returns text
  language plpgsql volatile security definer set search_path = '' as $$
declare
  settings public.pilot_settings%rowtype;
  code text;
  ref text;
  src text;
  interests text[];
begin
  select * into settings from public.pilot_settings limit 1;
  if not coalesce(settings.inquiries_open, false) or not coalesce(settings.real_data_enabled, false) then
    raise exception 'Inquiries aren''t open yet' using errcode = 'P0001';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' or octet_length(p::text) > 8000 then
    raise exception 'That inquiry couldn''t be read' using errcode = 'P0001';
  end if;
  -- Only the keys the form sends.
  if exists (select 1 from jsonb_object_keys(p) k where k not in (
      'parent_first_name', 'parent_last_name', 'parent_relationship', 'parent_email', 'parent_phone',
      'address_1', 'address_2', 'city', 'state', 'zip', 'country',
      'child_first_name', 'child_last_name', 'child_grade', 'entry_year', 'current_school',
      'one_thing', 'interests', 'consent_contact', 'consent_pathway', 'consent_version', 'source', 'ref')) then
    raise exception 'That inquiry had unexpected fields' using errcode = 'P0001';
  end if;
  if jsonb_typeof(coalesce(p -> 'interests', '[]')) <> 'array' then
    raise exception 'Interests must be a list' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(left(trim(x), 60)), '{}') into interests
    from jsonb_array_elements_text(coalesce(p -> 'interests', '[]')) x where trim(x) <> '';

  -- A referral counts only if the code belongs to a family that inquired.
  ref := upper(nullif(trim(p ->> 'ref'), ''));
  if ref is not null and not exists (select 1 from public.inquiries i where i.share_code = ref) then
    ref := null;
  end if;
  src := case when ref is not null then 'share'
              when p ->> 'source' = 'website' then 'website'
              else 'direct' end;

  for attempt in 1..5 loop
    code := upper(left(replace(gen_random_uuid()::text, '-', ''), 8));
    begin
      insert into public.inquiries (
        source, referred_by_code, share_code,
        parent_first_name, parent_last_name, parent_relationship, parent_email, parent_phone,
        address_1, address_2, city, state, zip, country,
        child_first_name, child_last_name, child_grade, entry_year, current_school, one_thing, interests,
        consent_contact, consent_pathway, consent_version)
      values (
        src, ref, code,
        trim(p ->> 'parent_first_name'), trim(p ->> 'parent_last_name'), p ->> 'parent_relationship',
        lower(trim(p ->> 'parent_email')), nullif(trim(p ->> 'parent_phone'), ''),
        trim(p ->> 'address_1'), nullif(trim(p ->> 'address_2'), ''), trim(p ->> 'city'),
        trim(p ->> 'state'), trim(p ->> 'zip'), coalesce(nullif(trim(p ->> 'country'), ''), 'United States'),
        trim(p ->> 'child_first_name'), trim(p ->> 'child_last_name'), (p ->> 'child_grade')::int,
        (p ->> 'entry_year')::int, nullif(trim(p ->> 'current_school'), ''), nullif(trim(p ->> 'one_thing'), ''),
        interests,
        coalesce((p ->> 'consent_contact')::boolean, false), coalesce((p ->> 'consent_pathway')::boolean, false),
        p ->> 'consent_version');
      return code;
    exception when unique_violation then
      null; -- a share_code collision: try another
    end;
  end loop;
  raise exception 'Couldn''t save the inquiry; please try again' using errcode = 'P0001';
end $$;
revoke all on function private.submit_inquiry(jsonb) from public;

create function public.submit_inquiry(p jsonb) returns text
  language sql volatile security invoker set search_path = '' as $$
  select private.submit_inquiry(p)
$$;

-- Whether the public form is open: a yes/no anyone may ask, nothing else.
create function private.inquiries_open() returns boolean
  language sql stable security definer set search_path = '' as $$
  select coalesce((select inquiries_open and real_data_enabled from public.pilot_settings limit 1), false)
$$;
revoke all on function private.inquiries_open() from public;
create function public.inquiries_open() returns boolean
  language sql stable security invoker set search_path = '' as $$
  select private.inquiries_open()
$$;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function private.inquiries_open() to anon;
    grant execute on function public.inquiries_open() to anon;
    grant execute on function private.submit_inquiry(jsonb) to anon;
    grant execute on function public.submit_inquiry(jsonb) to anon;
  end if;
end $$;
grant execute on function private.inquiries_open() to authenticated;
grant execute on function public.inquiries_open() to authenticated;
grant execute on function private.submit_inquiry(jsonb) to authenticated;
grant execute on function public.submit_inquiry(jsonb) to authenticated;
