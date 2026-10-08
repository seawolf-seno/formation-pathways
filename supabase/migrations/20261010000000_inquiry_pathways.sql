-- Formation Pathways for inquiring families (Fizzy #29, second PR), and a
-- staff test mode. docs/inquiries.md.
--
-- * Admissions, not only admins, may add fictional sample inquiries: staff
--   test /discover while it's closed, and load demo families for training.
--   Samples are never exported to Finalsite.
-- * inquiry_pathways holds pathway drafts for an inquiry, with the same
--   protections as pathway_drafts: only when the family asked for one
--   (consent_pathway), never moved to another family, read-only once signed,
--   and the signer's name always comes from their own staff record.

drop policy if exists inquiries_insert_sample on public.inquiries;
create policy inquiries_insert_sample on public.inquiries for insert to authenticated
  with check ((select private.has_role('admin', 'admissions')) and is_sample);

create table public.inquiry_pathways (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.inquiries (id) on delete cascade,
  created_at timestamptz not null default now(),
  generated_by uuid not null default auth.uid() references public.staff (user_id) on delete restrict,
  pathways jsonb not null check (jsonb_typeof(pathways) = 'array' and octet_length(pathways::text) <= 60000),
  used_fallback boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  approved_by text,
  approved_at timestamptz
);
create index inquiry_pathways_inquiry on public.inquiry_pathways (inquiry_id, created_at desc);

alter table public.inquiry_pathways enable row level security;
grant select, insert, update, delete on public.inquiry_pathways to authenticated;

create policy inquiry_pathways_read on public.inquiry_pathways for select to authenticated
  using ((select private.has_role('admin', 'admissions')));
create policy inquiry_pathways_insert on public.inquiry_pathways for insert to authenticated
  with check ((select private.has_role('admin', 'admissions')) and generated_by = (select auth.uid()));
create policy inquiry_pathways_update on public.inquiry_pathways for update to authenticated
  using ((select private.has_role('admin', 'admissions')))
  with check ((select private.has_role('admin', 'admissions')));
create policy inquiry_pathways_delete on public.inquiry_pathways for delete to authenticated
  using ((select private.has_role('admin')));

-- Only for families who asked for a pathway.
create function private.inquiry_pathways_consent() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.inquiries i where i.id = new.inquiry_id and i.consent_pathway) then
    raise exception 'This family didn''t ask for a Formation Pathway' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function private.inquiry_pathways_consent() from public, anon, authenticated;
create trigger inquiry_pathways_consent before insert or update on public.inquiry_pathways
  for each row execute function private.inquiry_pathways_consent();

create function private.inquiry_pathways_guard() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if new.inquiry_id <> old.inquiry_id or new.generated_by is distinct from old.generated_by then
    raise exception 'A draft stays with the family and author it was made for' using errcode = 'P0001';
  end if;
  if old.status = 'approved' then
    raise exception 'A signed pathway is read-only. Draft again to change it.' using errcode = 'P0001';
  end if;
  if new.status = 'approved' then
    new.approved_by := (select s.display_name from public.staff s where s.user_id = auth.uid());
    new.approved_at := now();
    if new.approved_by is null then
      raise exception 'Only a staff member can sign a pathway' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.inquiry_pathways_guard() from public, anon, authenticated;
create trigger inquiry_pathways_guard before update on public.inquiry_pathways
  for each row execute function private.inquiry_pathways_guard();
