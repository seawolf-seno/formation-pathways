-- Security hardening from the 2026-10-07 review (docs/security-review.md).
-- No new tables. Apply in the Supabase SQL editor or with `supabase db push`;
-- agents never apply migrations to the live database.

-- ---------------------------------------------------------------- pathway drafts
-- Editing a draft re-checks ai_drafting consent (it was checked on insert
-- only), a draft can't move to another student or change who generated it,
-- a signed draft is read-only, and "signed by" is always the signer's own
-- staff name, never a value the client sends.

drop trigger if exists pathway_drafts_consent on public.pathway_drafts;
create trigger pathway_drafts_consent before insert or update on public.pathway_drafts
  for each row execute function private.enforce_consent('ai_drafting');

create function private.pathway_drafts_guard() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if new.person_id <> old.person_id or new.generated_by is distinct from old.generated_by then
    raise exception 'A draft stays with the student and author it was made for' using errcode = 'P0001';
  end if;
  if old.status = 'approved' then
    raise exception 'A signed draft is read-only. Draft again to change it.' using errcode = 'P0001';
  end if;
  if new.status = 'approved' then
    new.approved_by := (select s.display_name from public.staff s where s.user_id = auth.uid());
    new.approved_at := now();
    if new.approved_by is null then
      raise exception 'Only a staff member can sign a draft' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.pathway_drafts_guard() from public, anon, authenticated;

create trigger pathway_drafts_guard before update on public.pathway_drafts
  for each row execute function private.pathway_drafts_guard();

-- ---------------------------------------------------------------- people
-- A sample (fictional) person counts as consented to everything, so a real
-- student must never become a sample after the fact. is_sample is fixed at
-- creation.

create function private.people_sample_fixed() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if new.is_sample is distinct from old.is_sample then
    raise exception 'Whether someone is a fictional sample can''t change after they''re added' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function private.people_sample_fixed() from public, anon, authenticated;

create trigger people_sample_fixed before update of is_sample on public.people
  for each row execute function private.people_sample_fixed();

-- ---------------------------------------------------------------- family Spark links
-- The server sets created_at, so the 30-day cap can't be stretched by sending
-- an old created_at.

create function private.spark_links_stamp() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  new.created_at := now();
  if new.expires_at > now() + interval '30 days' then
    raise exception 'A family link can last at most 30 days' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function private.spark_links_stamp() from public, anon, authenticated;

create trigger spark_links_stamp before insert on public.spark_links
  for each row execute function private.spark_links_stamp();

-- A link stops working once the staff member who sent it is deactivated, and
-- a submission must have the shape the app saves (the anon key is public, so
-- the database is the only check a direct call meets).

create or replace function private.spark_link_greeting(p_token text)
  returns table (first_name text, expires_at timestamptz)
  language sql stable security definer set search_path = '' as $$
  select l.first_name, l.expires_at
  from public.spark_links l
  join public.staff s on s.user_id = l.created_by and s.active
  where l.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
    and l.used_at is null
    and l.expires_at > now()
    and private.has_consent(l.person_id, 'student_voice')
$$;

create function private.spark_payload_ok(p jsonb) returns boolean
  language sql immutable set search_path = '' as $$
  select jsonb_typeof(p) = 'object'
    and octet_length(p::text) <= 20000
    -- only the keys the app writes
    and not exists (
      select 1 from jsonb_object_keys(p) k
      where k not in ('answers', 'picks', 'leanings', 'channels', 'format', 'lab')
    )
    -- the lists are lists, no longer than the app allows
    and coalesce(jsonb_typeof(p -> 'answers'), 'array') = 'array' and jsonb_array_length(coalesce(p -> 'answers', '[]')) <= 8
    and coalesce(jsonb_typeof(p -> 'picks'), 'array') = 'array' and jsonb_array_length(coalesce(p -> 'picks', '[]')) <= 20
    and coalesce(jsonb_typeof(p -> 'leanings'), 'array') = 'array' and jsonb_array_length(coalesce(p -> 'leanings', '[]')) <= 10
    and coalesce(jsonb_typeof(p -> 'channels'), 'array') = 'array' and jsonb_array_length(coalesce(p -> 'channels', '[]')) <= 15
$$;
revoke all on function private.spark_payload_ok(jsonb) from public, anon, authenticated;

create or replace function private.spark_link_submit(p_token text, p_sparks jsonb)
  returns boolean
  language plpgsql volatile security definer set search_path = '' as $$
declare
  link public.spark_links%rowtype;
begin
  if p_sparks is null or not private.spark_payload_ok(p_sparks) then
    return false;
  end if;
  -- Lock the row so two submits can't both use it.
  select l.* into link from public.spark_links l
  join public.staff s on s.user_id = l.created_by and s.active
  where l.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
    and l.used_at is null
    and l.expires_at > now()
  for update of l;
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

-- Staff can't pass off a session as one a family sent from home.
drop policy if exists student_sparks_insert on public.student_sparks;
create policy student_sparks_insert on public.student_sparks for insert to authenticated
  with check ((select private.is_staff()) and created_by = (select auth.uid()) and source = 'in_person');

-- ---------------------------------------------------------------- keep student data when staff leave
-- Deleting a staff record (or their sign-in) used to delete every Spark
-- session and link they made, including families' answers. Deactivate staff
-- instead; deleting one with sparks on file is now refused.

alter table public.student_sparks drop constraint if exists student_sparks_created_by_fkey;
alter table public.student_sparks add constraint student_sparks_created_by_fkey
  foreign key (created_by) references public.staff (user_id) on delete restrict;
alter table public.spark_links drop constraint if exists spark_links_created_by_fkey;
alter table public.spark_links add constraint spark_links_created_by_fkey
  foreign key (created_by) references public.staff (user_id) on delete restrict;

-- ---------------------------------------------------------------- demo snapshot
-- The shared demo database is loaded by every server instance, so only
-- admins and admissions may replace it.

drop policy if exists demo_snapshots_insert on public.demo_snapshots;
drop policy if exists demo_snapshots_update on public.demo_snapshots;
create policy demo_snapshots_insert on public.demo_snapshots for insert to authenticated
  with check ((select private.has_role('admin', 'admissions')) and updated_by = (select auth.uid()));
create policy demo_snapshots_update on public.demo_snapshots for update to authenticated
  using ((select private.has_role('admin', 'admissions')))
  with check ((select private.has_role('admin', 'admissions')) and updated_by = (select auth.uid()));

-- ---------------------------------------------------------------- belt and braces
-- RLS doesn't cover TRUNCATE. The Data API can't issue it, but no app role
-- needs it either.
revoke truncate on all tables in schema public from anon, authenticated;
