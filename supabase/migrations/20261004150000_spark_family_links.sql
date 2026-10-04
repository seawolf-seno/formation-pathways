-- At-home Spark links: a staff member sends a family a link so the student
-- can light up their sparks on their own device, with no school login.
--
-- This is the system of record's ONLY anonymous write path, so it is narrow:
--   * the link carries a long random token; only its SHA-256 hash is stored,
--     so the link is shown once and can't be recovered from the database;
--   * it expires (7 days by default) and works ONCE;
--   * it is WRITE-ONLY: a visitor learns the student's first name (for the
--     greeting) and the expiry, nothing else, and can submit sparks once;
--   * student_voice consent is checked when the link is made AND when it is
--     used (the student_sparks consent trigger also runs);
--   * sparks arrive attributed to the staff member who sent the link, marked
--     source = 'family_link', and the submission is written to access_log.
--
-- The two functions anyone may call are SECURITY INVOKER in public and do
-- nothing but call SECURITY DEFINER twins in the private schema (keeping the
-- rule that no definer function is exposed in the API schema). anon gets USAGE
-- on private and EXECUTE on exactly those two functions.

alter table public.student_sparks
  add column source text not null default 'in_person' check (source in ('in_person', 'family_link'));

create table public.spark_links (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  first_name text not null check (length(first_name) between 1 and 60),
  created_by uuid not null default auth.uid() references public.staff (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
    check (expires_at <= created_at + interval '30 days'),
  used_at timestamptz
);
create index spark_links_person on public.spark_links (person_id, created_at desc);

alter table public.spark_links enable row level security;

-- Staff make links as themselves; whoever can read sparks can see links exist
-- (never the token: only its hash is stored). Admins can cancel one.
create policy spark_links_insert on public.spark_links for insert to authenticated
  with check ((select private.is_staff()) and created_by = (select auth.uid()));
create policy spark_links_read on public.spark_links for select to authenticated
  using ((select private.has_role('admin', 'admissions', 'teacher')));
create policy spark_links_delete on public.spark_links for delete to authenticated
  using ((select private.has_role('admin')) or created_by = (select auth.uid()));

-- Making a link needs student_voice consent, like saving sparks does.
create trigger spark_links_consent before insert on public.spark_links
  for each row execute function private.enforce_consent('student_voice');

-- ---------------------------------------------------------------- private

-- anon now has USAGE on private (below), so make sure no function added here
-- later is executable by default: each must be granted on purpose.
alter default privileges in schema private revoke execute on functions from public;

create function private.spark_link_greeting(p_token text)
  returns table (first_name text, expires_at timestamptz)
  language sql stable security definer set search_path = '' as $$
  select l.first_name, l.expires_at
  from public.spark_links l
  where l.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
    and l.used_at is null
    and l.expires_at > now()
    and private.has_consent(l.person_id, 'student_voice')
$$;

create function private.spark_link_submit(p_token text, p_sparks jsonb)
  returns boolean
  language plpgsql volatile security definer set search_path = '' as $$
declare
  link public.spark_links%rowtype;
begin
  if p_sparks is null or jsonb_typeof(p_sparks) <> 'object' or octet_length(p_sparks::text) > 20000 then
    return false;
  end if;
  -- Lock the row so two submits can't both use it.
  select * into link from public.spark_links
  where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
    and used_at is null
    and expires_at > now()
  for update;
  if not found or not private.has_consent(link.person_id, 'student_voice') then
    return false;
  end if;
  insert into public.student_sparks (person_id, sparks, created_by, source)
    values (link.person_id, p_sparks, link.created_by, 'family_link');
  update public.spark_links set used_at = now() where id = link.id;
  insert into public.access_log (staff_id, action, person_id, detail)
    values (link.created_by, 'spark_link_submit', link.person_id, jsonb_build_object('link', link.id));
  return true;
end $$;

revoke all on function private.spark_link_greeting(text) from public;
revoke all on function private.spark_link_submit(text, jsonb) from public;

-- ---------------------------------------------------------------- public (invoker)

create function public.spark_link_greeting(p_token text)
  returns table (first_name text, expires_at timestamptz)
  language sql stable security invoker set search_path = '' as $$
  select * from private.spark_link_greeting(p_token)
$$;

create function public.spark_link_submit(p_token text, p_sparks jsonb)
  returns boolean
  language sql volatile security invoker set search_path = '' as $$
  select private.spark_link_submit(p_token, p_sparks)
$$;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant usage on schema private to anon;
    grant execute on function private.spark_link_greeting(text) to anon;
    grant execute on function private.spark_link_submit(text, jsonb) to anon;
  end if;
end $$;
grant execute on function private.spark_link_greeting(text) to authenticated;
grant execute on function private.spark_link_submit(text, jsonb) to authenticated;
