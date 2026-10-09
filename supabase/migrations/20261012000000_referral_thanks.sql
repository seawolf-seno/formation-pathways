-- Referrals and thank-yous for inquiring families, the guardian's say-so
-- before a share, and a throttle on the public form (Fizzy #29, last PR).
-- docs/referrals.md.
--
-- 1. referral_thanks: when a family inquires through another family's shared
--    link, admissions confirms the referral, then (once the referred family
--    applies, or enrolls: leadership decides) approves a thank-you and records
--    who sent it. The database enforces the card's rules: the referral must be
--    real (the code that brought them), no family refers itself, a cap per
--    family, nothing that reads like cash, and nothing approved for a real
--    family until an admin has recorded leadership's decision. Samples can go
--    the whole way so admissions can try it.
-- 2. inquiry_shares.guardian_confirmed_at: a share is made only after the
--    person on the family's page confirms they're the child's parent or
--    guardian and chooses to share. family_share() takes that confirmation.
-- 3. public_share() and family_page() say whether thank-yous are on, so the
--    share text and the public page carry the disclosure a post made for a
--    reward needs (the FTC's endorsement rules), and only then.
-- 4. submit_inquiry(): at most 3 inquiries per email a day, and a pause when
--    more than 40 arrive in ten minutes. Still add the Vercel Firewall rule
--    (docs/inquiries.md); this is the backstop.

-- ---------------------------------------------------------------- the decision
alter table public.pilot_settings
  add column referral_thanks_open boolean not null default false,
  add column referral_thanks_what text check (char_length(referral_thanks_what) <= 200),
  add column referral_thanks_on text not null default 'applied' check (referral_thanks_on in ('applied', 'enrolled')),
  add column referral_thanks_cap int not null default 3 check (referral_thanks_cap between 1 and 10),
  add column referral_thanks_approved_by text,
  add column referral_thanks_approval_reference text,
  add column referral_thanks_approved_at timestamptz,
  add constraint referral_thanks_recorded check (
    not referral_thanks_open
    or (referral_thanks_what is not null and referral_thanks_approved_by is not null
        and referral_thanks_approval_reference is not null and referral_thanks_approved_at is not null)
  ),
  -- No cash or cash equivalents (card #29).
  add constraint referral_thanks_not_cash check (
    referral_thanks_what is null or referral_thanks_what !~* '(\$|cash|gift ?card|venmo|paypal|zelle|check for)'
  );

-- ---------------------------------------------------------------- referral_thanks
create table public.referral_thanks (
  id uuid primary key default gen_random_uuid(),
  -- The family who inquired through a link, and the family whose link it was.
  referred_inquiry_id uuid not null unique references public.inquiries (id) on delete cascade,
  referrer_inquiry_id uuid not null references public.inquiries (id) on delete cascade,
  is_sample boolean not null default false,
  status text not null default 'confirmed' check (status in ('confirmed', 'approved', 'sent', 'declined')),
  confirmed_by text not null default '',
  confirmed_at timestamptz not null default now(),
  -- What the thank-you was (copied from the decision when approved).
  what text check (char_length(what) <= 200 and what !~* '(\$|cash|gift ?card|venmo|paypal|zelle|check for)'),
  approved_by text,
  approved_at timestamptz,
  sent_by text,
  sent_at timestamptz,
  note text check (char_length(note) <= 500),
  check (referred_inquiry_id <> referrer_inquiry_id)
);
create index referral_thanks_referrer on public.referral_thanks (referrer_inquiry_id);

alter table public.referral_thanks enable row level security;
-- Supabase no longer grants new tables to the API by default: say so here.
-- No delete: a thank-you record stays (it goes when the inquiry is deleted).
grant select, insert, update on public.referral_thanks to authenticated;

create policy referral_thanks_read on public.referral_thanks for select to authenticated
  using ((select private.has_role('admin', 'admissions')));
create policy referral_thanks_insert on public.referral_thanks for insert to authenticated
  with check ((select private.has_role('admin', 'admissions')));
create policy referral_thanks_update on public.referral_thanks for update to authenticated
  using ((select private.has_role('admin', 'admissions')))
  with check ((select private.has_role('admin', 'admissions')));

-- The signed-in staff member's own name: nobody records a step as someone else.
create function private.own_staff_name() returns text
  language sql stable security definer set search_path = '' as $$
  select display_name from public.staff where user_id = auth.uid() and active
$$;
revoke all on function private.own_staff_name() from public, anon, authenticated;

-- Confirming: only a real referral (the code that brought them), never a
-- family referring itself.
create function private.referral_thanks_confirm() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare
  referred public.inquiries;
  referrer public.inquiries;
  me text := private.own_staff_name();
begin
  if me is null then
    raise exception 'Only active staff can confirm a referral' using errcode = 'P0001';
  end if;
  select * into referred from public.inquiries where id = new.referred_inquiry_id;
  select * into referrer from public.inquiries where id = new.referrer_inquiry_id;
  if referred.id is null or referrer.id is null
     or referred.referred_by_code is distinct from referrer.share_code then
    raise exception 'That family didn''t inquire through this family''s link' using errcode = 'P0001';
  end if;
  if lower(referred.parent_email) = lower(referrer.parent_email)
     or (lower(trim(referred.address_1)) = lower(trim(referrer.address_1))
         and lower(coalesce(trim(referred.address_2), '')) = lower(coalesce(trim(referrer.address_2), ''))
         and trim(referred.zip) = trim(referrer.zip)) then
    raise exception 'A family can''t refer itself' using errcode = 'P0001';
  end if;
  if referred.is_sample <> referrer.is_sample then
    raise exception 'A sample and a real family can''t be linked' using errcode = 'P0001';
  end if;
  new.is_sample := referred.is_sample;
  new.status := 'confirmed';
  new.confirmed_by := me;
  new.confirmed_at := now();
  new.what := null;
  new.approved_by := null; new.approved_at := null;
  new.sent_by := null; new.sent_at := null;
  return new;
end $$;
revoke all on function private.referral_thanks_confirm() from public, anon, authenticated;
create trigger referral_thanks_confirm before insert on public.referral_thanks
  for each row execute function private.referral_thanks_confirm();

-- Then one step at a time: confirmed → approved → sent, or declined (with a
-- note) before it's sent. Each step records the signed-in staff member.
create function private.referral_thanks_step() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare
  settings public.pilot_settings%rowtype;
  referred public.inquiries;
  given int;
  me text := private.own_staff_name();
begin
  if (new.referred_inquiry_id, new.referrer_inquiry_id, new.is_sample, new.confirmed_by, new.confirmed_at)
     is distinct from (old.referred_inquiry_id, old.referrer_inquiry_id, old.is_sample, old.confirmed_by, old.confirmed_at) then
    raise exception 'A confirmed referral can''t be moved to other families' using errcode = 'P0001';
  end if;
  if me is null then
    raise exception 'Only active staff can record a thank-you' using errcode = 'P0001';
  end if;
  if new.status = old.status then
    -- Only the note can change without a step, and not once it's settled.
    if (new.what, new.approved_by, new.approved_at, new.sent_by, new.sent_at)
       is distinct from (old.what, old.approved_by, old.approved_at, old.sent_by, old.sent_at)
       or old.status in ('sent', 'declined') then
      raise exception 'Record a thank-you one step at a time' using errcode = 'P0001';
    end if;
    return new;
  end if;

  if old.status = 'confirmed' and new.status = 'approved' then
    select * into settings from public.pilot_settings limit 1;
    if not new.is_sample and not coalesce(settings.referral_thanks_open, false) then
      raise exception 'Thank-yous are off until an admin records leadership''s decision' using errcode = 'P0001';
    end if;
    select * into referred from public.inquiries where id = new.referred_inquiry_id;
    if (coalesce(settings.referral_thanks_on, 'applied') = 'applied' and referred.status not in ('applied', 'enrolled'))
       or (settings.referral_thanks_on = 'enrolled' and referred.status <> 'enrolled') then
      raise exception 'A thank-you is approved once the family they brought has %', coalesce(settings.referral_thanks_on, 'applied')
        using errcode = 'P0001';
    end if;
    select count(*) into given from public.referral_thanks
      where referrer_inquiry_id = new.referrer_inquiry_id and status in ('approved', 'sent') and id <> new.id;
    if given >= coalesce(settings.referral_thanks_cap, 3) then
      raise exception 'This family has had the most thank-yous we give (%)', coalesce(settings.referral_thanks_cap, 3)
        using errcode = 'P0001';
    end if;
    new.what := coalesce(nullif(trim(new.what), ''), settings.referral_thanks_what, case when new.is_sample then 'A handwritten note (sample)' end);
    if new.what is null then
      raise exception 'Say what the thank-you is' using errcode = 'P0001';
    end if;
    new.approved_by := me;
    new.approved_at := now();
    new.sent_by := null; new.sent_at := null;
  elsif old.status = 'approved' and new.status = 'sent' then
    new.what := old.what; new.approved_by := old.approved_by; new.approved_at := old.approved_at;
    new.sent_by := me;
    new.sent_at := now();
  elsif old.status in ('confirmed', 'approved') and new.status = 'declined' then
    if coalesce(trim(new.note), '') = '' then
      raise exception 'Add a note saying why' using errcode = 'P0001';
    end if;
    new.what := old.what; new.approved_by := old.approved_by; new.approved_at := old.approved_at;
    new.sent_by := null; new.sent_at := null;
  else
    raise exception 'A thank-you goes confirmed → approved → sent (or declined before it''s sent)' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function private.referral_thanks_step() from public, anon, authenticated;
create trigger referral_thanks_step before update on public.referral_thanks
  for each row execute function private.referral_thanks_step();

-- Whether a real family's share needs the reward disclosure.
create function private.referral_thanks_on(p_sample boolean) returns boolean
  language sql stable security definer set search_path = '' as $$
  select coalesce(p_sample, false) or coalesce((select referral_thanks_open from public.pilot_settings limit 1), false)
$$;
revoke all on function private.referral_thanks_on(boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------- the guardian's say-so to share
alter table public.inquiry_shares add column guardian_confirmed_at timestamptz;

drop function public.family_share(text, int, text);
drop function private.family_share(text, int, text);

-- As before, plus: nothing is shared until the person on the page confirms
-- they're the child's parent or guardian and chooses to share.
create function private.family_share(p_token text, p_index int, p_style text, p_guardian boolean)
  returns text
  language plpgsql volatile security definer set search_path = '' as $$
declare
  link public.inquiry_family_links;
  p public.inquiry_pathways;
  existing text;
  new_code text;
begin
  if p_guardian is not true then return null; end if;
  link := private.family_link(p_token);
  if link.id is null or p_style is null or p_style not in ('tide', 'paper', 'sky') then return null; end if;
  p := private.signed_inquiry_pathway(link.inquiry_id);
  if p.id is null or p_index is null or p_index < 0 or p_index >= jsonb_array_length(p.pathways) then return null; end if;
  select code into existing from public.inquiry_shares
  where inquiry_pathway_id = p.id and pathway_index = p_index and style = p_style and stopped_at is null;
  if existing is not null then return existing; end if;
  new_code := left(replace(gen_random_uuid()::text, '-', ''), 12);
  insert into public.inquiry_shares (inquiry_id, inquiry_pathway_id, pathway_index, style, code, guardian_confirmed_at)
    values (link.inquiry_id, p.id, p_index, p_style, new_code, now());
  insert into public.access_log (staff_id, action, person_id, detail)
    values (link.created_by, 'inquiry_family_share', null,
            jsonb_build_object('inquiry', link.inquiry_id, 'pathway_index', p_index, 'style', p_style, 'guardian_confirmed', true));
  return new_code;
end $$;
revoke all on function private.family_share(text, int, text, boolean) from public;
create function public.family_share(p_token text, p_index int, p_style text, p_guardian boolean) returns text
  language sql volatile security invoker set search_path = '' as $$ select private.family_share(p_token, p_index, p_style, p_guardian) $$;

-- ---------------------------------------------------------------- the disclosure flag
create or replace function private.family_page(p_token text)
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
    'thanks', private.referral_thanks_on(i.is_sample),
    'shares', coalesce((
      select jsonb_agg(jsonb_build_object('code', s.code, 'pathway_index', s.pathway_index, 'style', s.style) order by s.created_at)
      from public.inquiry_shares s
      where s.inquiry_pathway_id = p.id and s.stopped_at is null
    ), '[]'::jsonb)
  );
end $$;

create or replace function private.public_share(p_code text)
  returns jsonb
  language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'first_name', i.child_first_name,
    'style', s.style,
    'ref', i.share_code,
    'thanks', private.referral_thanks_on(i.is_sample),
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

-- ---------------------------------------------------------------- a throttle on the public form
create or replace function private.submit_inquiry(p jsonb) returns text
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
  -- A backstop for floods: a family may send a few (siblings), not dozens.
  if (select count(*) from public.inquiries
      where not is_sample and parent_email = lower(trim(p ->> 'parent_email')) and created_at > now() - interval '1 day') >= 3 then
    raise exception 'We already have your inquiry' using errcode = 'P0001';
  end if;
  if (select count(*) from public.inquiries where not is_sample and created_at > now() - interval '10 minutes') >= 40 then
    raise exception 'Too many inquiries just now' using errcode = 'P0001';
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

-- ---------------------------------------------------------------- grants
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function private.family_share(text, int, text, boolean) to anon;
    grant execute on function public.family_share(text, int, text, boolean) to anon;
  end if;
end $$;
grant execute on function private.family_share(text, int, text, boolean) to authenticated;
grant execute on function public.family_share(text, int, text, boolean) to authenticated;
