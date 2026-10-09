-- An inquiring family's own page and their shares (Fizzy #29, third PR).
-- docs/family-sharing.md.
--
-- 1. inquiry_family_links: after signing, admissions makes a private link for
--    the family (no school login). Like Spark family links: a long random
--    token, only its SHA-256 hash stored, an expiry the server sets, and it
--    stops working when the staff member who made it is deactivated. It only
--    READS the family's own page and makes shares; it can't change anything
--    the family or staff wrote.
-- 2. inquiry_shares: when the family shares a pathway, a short public code
--    for that pathway and card look. The public page shows only the child's
--    first name and that signed pathway's name, glimpse, first semester,
--    horizon and mentor line (the app keeps the department only). Signed
--    pathways are read-only, so a share can never show anything other than
--    what staff signed and the family chose. Stopping sharing ends every code.
--
-- Anyone may call the four public functions (SECURITY INVOKER wrappers of
-- SECURITY DEFINER twins in private, as for Spark links).

create table public.inquiry_family_links (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null default auth.uid() references public.staff (user_id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '60 days'
);
create index inquiry_family_links_inquiry on public.inquiry_family_links (inquiry_id, created_at desc);

create table public.inquiry_shares (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries (id) on delete cascade,
  inquiry_pathway_id uuid not null references public.inquiry_pathways (id) on delete cascade,
  pathway_index int not null check (pathway_index between 0 and 5),
  style text not null check (style in ('tide', 'paper', 'sky')),
  code text not null unique check (code ~ '^[0-9a-f]{12}$'),
  created_at timestamptz not null default now(),
  stopped_at timestamptz
);
create unique index inquiry_shares_live on public.inquiry_shares (inquiry_pathway_id, pathway_index, style) where stopped_at is null;

alter table public.inquiry_family_links enable row level security;
alter table public.inquiry_shares enable row level security;
grant select, insert, delete on public.inquiry_family_links to authenticated;
grant select on public.inquiry_shares to authenticated;

create policy inquiry_family_links_insert on public.inquiry_family_links for insert to authenticated
  with check ((select private.has_role('admin', 'admissions')) and created_by = (select auth.uid()));
create policy inquiry_family_links_read on public.inquiry_family_links for select to authenticated
  using ((select private.has_role('admin', 'admissions')));
create policy inquiry_family_links_delete on public.inquiry_family_links for delete to authenticated
  using ((select private.has_role('admin', 'admissions')));
-- Shares are made only through family_share(); staff see them.
create policy inquiry_shares_read on public.inquiry_shares for select to authenticated
  using ((select private.has_role('admin', 'admissions')));

-- A link is only for a family who asked for a pathway and has a signed one.
-- The server sets the dates; at most 120 days.
create function private.inquiry_family_links_stamp() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  new.created_at := now();
  if new.expires_at > now() + interval '120 days' then
    raise exception 'A family link can last at most 120 days' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.inquiries i
    join public.inquiry_pathways p on p.inquiry_id = i.id and p.status = 'approved'
    where i.id = new.inquiry_id and i.consent_pathway
  ) then
    raise exception 'Sign this family''s pathway before making their link' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function private.inquiry_family_links_stamp() from public, anon, authenticated;
create trigger inquiry_family_links_stamp before insert on public.inquiry_family_links
  for each row execute function private.inquiry_family_links_stamp();

-- ---------------------------------------------------------------- private

-- The live link for a token: unexpired, its maker still active, the family
-- not closed.
create function private.family_link(p_token text)
  returns public.inquiry_family_links
  language sql stable security definer set search_path = '' as $$
  select l.*
  from public.inquiry_family_links l
  join public.staff s on s.user_id = l.created_by and s.active
  join public.inquiries i on i.id = l.inquiry_id and i.status <> 'closed' and i.consent_pathway
  where l.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
    and l.expires_at > now()
$$;

-- The newest signed pathway for an inquiry.
create function private.signed_inquiry_pathway(p_inquiry uuid)
  returns public.inquiry_pathways
  language sql stable security definer set search_path = '' as $$
  select p.* from public.inquiry_pathways p
  where p.inquiry_id = p_inquiry and p.status = 'approved'
  order by p.approved_at desc nulls last
  limit 1
$$;

-- Everything the family's own page shows. Their own words, never their
-- contact details or address.
create function private.family_page(p_token text)
  returns jsonb
  language plpgsql stable security definer set search_path = '' as $$
declare
  link public.inquiry_family_links;
  i public.inquiries;
  p public.inquiry_pathways;
begin
  link := private.family_link(p_token);
  if link.id is null then return null; end if;
  select * into i from public.inquiries where id = link.inquiry_id;
  p := private.signed_inquiry_pathway(i.id);
  return jsonb_build_object(
    'child_first_name', i.child_first_name,
    'parent_first_name', i.parent_first_name,
    'family_name', i.parent_last_name,
    'current_school', i.current_school,
    'one_thing', i.one_thing,
    'interests', to_jsonb(i.interests),
    'share_code', i.share_code,
    'is_sample', i.is_sample,
    'expires_at', link.expires_at,
    'pathways', p.pathways,
    'shares', coalesce((
      select jsonb_agg(jsonb_build_object('code', s.code, 'pathway_index', s.pathway_index, 'style', s.style) order by s.created_at)
      from public.inquiry_shares s
      where s.inquiry_pathway_id = p.id and s.stopped_at is null
    ), '[]'::jsonb)
  );
end $$;

-- The family shares one pathway in one card look: returns its public code
-- (the same code again for the same choice).
create function private.family_share(p_token text, p_index int, p_style text)
  returns text
  language plpgsql volatile security definer set search_path = '' as $$
declare
  link public.inquiry_family_links;
  p public.inquiry_pathways;
  existing text;
  new_code text;
begin
  link := private.family_link(p_token);
  if link.id is null or p_style is null or p_style not in ('tide', 'paper', 'sky') then return null; end if;
  p := private.signed_inquiry_pathway(link.inquiry_id);
  if p.id is null or p_index is null or p_index < 0 or p_index >= jsonb_array_length(p.pathways) then return null; end if;
  select code into existing from public.inquiry_shares
  where inquiry_pathway_id = p.id and pathway_index = p_index and style = p_style and stopped_at is null;
  if existing is not null then return existing; end if;
  new_code := left(replace(gen_random_uuid()::text, '-', ''), 12);
  insert into public.inquiry_shares (inquiry_id, inquiry_pathway_id, pathway_index, style, code)
    values (link.inquiry_id, p.id, p_index, p_style, new_code);
  insert into public.access_log (staff_id, action, person_id, detail)
    values (link.created_by, 'inquiry_family_share', null,
            jsonb_build_object('inquiry', link.inquiry_id, 'pathway_index', p_index, 'style', p_style));
  return new_code;
end $$;

-- The family stops sharing: every public code for them stops working.
create function private.family_stop_sharing(p_token text)
  returns int
  language plpgsql volatile security definer set search_path = '' as $$
declare
  link public.inquiry_family_links;
  n int;
begin
  link := private.family_link(p_token);
  if link.id is null then return 0; end if;
  update public.inquiry_shares set stopped_at = now()
  where inquiry_id = link.inquiry_id and stopped_at is null;
  get diagnostics n = row_count;
  insert into public.access_log (staff_id, action, person_id, detail)
    values (link.created_by, 'inquiry_family_stop_sharing', null, jsonb_build_object('inquiry', link.inquiry_id, 'stopped', n));
  return n;
end $$;

-- What a public share shows: the first name and one signed pathway's
-- shareable fields. Nothing once sharing stops or the inquiry closes.
create function private.public_share(p_code text)
  returns jsonb
  language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'first_name', i.child_first_name,
    'style', s.style,
    'ref', i.share_code,
    'pathway', jsonb_build_object(
      'name', p.pathways -> s.pathway_index -> 'name',
      'glimpse', p.pathways -> s.pathway_index -> 'glimpse',
      'firstSemester', p.pathways -> s.pathway_index -> 'firstSemester',
      'fourYearHorizon', p.pathways -> s.pathway_index -> 'fourYearHorizon',
      'mentorArchetype', p.pathways -> s.pathway_index -> 'mentorArchetype'
    )
  )
  from public.inquiry_shares s
  join public.inquiries i on i.id = s.inquiry_id and i.status <> 'closed'
  join public.inquiry_pathways p on p.id = s.inquiry_pathway_id and p.status = 'approved'
  where s.code = coalesce(p_code, '') and s.stopped_at is null
$$;

revoke all on function private.family_link(text) from public, anon, authenticated;
revoke all on function private.signed_inquiry_pathway(uuid) from public, anon, authenticated;
revoke all on function private.family_page(text) from public;
revoke all on function private.family_share(text, int, text) from public;
revoke all on function private.family_stop_sharing(text) from public;
revoke all on function private.public_share(text) from public;

-- ---------------------------------------------------------------- public (invoker)

create function public.family_page(p_token text) returns jsonb
  language sql stable security invoker set search_path = '' as $$ select private.family_page(p_token) $$;
create function public.family_share(p_token text, p_index int, p_style text) returns text
  language sql volatile security invoker set search_path = '' as $$ select private.family_share(p_token, p_index, p_style) $$;
create function public.family_stop_sharing(p_token text) returns int
  language sql volatile security invoker set search_path = '' as $$ select private.family_stop_sharing(p_token) $$;
create function public.public_share(p_code text) returns jsonb
  language sql stable security invoker set search_path = '' as $$ select private.public_share(p_code) $$;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function private.family_page(text) to anon;
    grant execute on function private.family_share(text, int, text) to anon;
    grant execute on function private.family_stop_sharing(text) to anon;
    grant execute on function private.public_share(text) to anon;
  end if;
end $$;
grant execute on function private.family_page(text) to authenticated;
grant execute on function private.family_share(text, int, text) to authenticated;
grant execute on function private.family_stop_sharing(text) to authenticated;
grant execute on function private.public_share(text) to authenticated;
