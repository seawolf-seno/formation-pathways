-- Fizzy #34. Applied by the repository owner, never by an agent on the live DB.
create table public.stem_program (
  id boolean primary key default true check (id),
  introduction text not null default 'Explore a STEM question, build something meaningful, and grow alongside a mentor.' check (length(introduction) between 1 and 3000),
  requirements text[] not null default array['Develop and document a STEM project','Meet with a mentor and reflect on your learning','Share your work with others','Review your evidence with the STEM Scholars coordinator'],
  application_deadline date,
  approved_by text,
  approved_at timestamptz,
  check (cardinality(requirements) between 1 and 20),
  check ((approved_by is null) = (approved_at is null))
);
insert into public.stem_program default values;

create table public.stem_memberships (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null unique references public.people(id) on delete cascade,
  interest text not null default '' check (length(interest) <= 3000),
  goal text not null default '' check (length(goal) <= 3000),
  availability text not null default '' check (length(availability) <= 1000),
  student_email text not null default '' check (student_email = '' or student_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  status text not null default 'draft' check (status in ('draft','submitted','active','paused','distinction')),
  review_note text not null default '' check (length(review_note) <= 3000),
  reviewed_by text,
  distinction_by text,
  distinction_at timestamptz,
  distinction_requirements text[],
  created_by uuid not null default auth.uid() references public.staff(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stem_mentors (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 150),
  kind text not null check (kind in ('mentor','alumni')),
  expertise text not null check (length(trim(expertise)) between 1 and 1000),
  contact text not null default '' check (length(contact) <= 300),
  active boolean not null default true
);
create table public.stem_opportunities (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 200),
  kind text not null check (kind in ('internship','research','event')),
  organization text not null check (length(trim(organization)) between 1 and 200),
  description text not null check (length(trim(description)) between 1 and 3000),
  url text not null check (url ~ '^https?://[^[:space:]]+$' and length(url) <= 2000),
  deadline date,
  published boolean not null default false
);

-- One timeline, with structured fields for projects, notes, introductions,
-- requirement evidence and signed summaries. Meeting bodies never reach students.
create table public.stem_work (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.stem_memberships(person_id) on delete cascade,
  kind text not null check (kind in ('project','meeting','mentor','evidence','summary')),
  title text not null check (length(trim(title)) between 1 and 200),
  body text not null default '' check (length(body) <= 12000),
  next_step text not null default '' check (length(next_step) <= 2000),
  due_date date,
  url text not null default '' check (url = '' or (url ~ '^https?://[^[:space:]]+$' and length(url) <= 2000)),
  status text not null default 'planned' check (status in ('planned','active','completed')),
  mentor_id uuid references public.stem_mentors(id),
  requirement text not null default '',
  approved_by text,
  approved_at timestamptz,
  period_start date,
  period_end date,
  delivered_at timestamptz,
  created_by uuid not null default auth.uid() references public.staff(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((approved_by is null) = (approved_at is null)),
  check ((kind = 'summary' and period_start is not null and period_end = period_start + 14) or (kind <> 'summary' and period_start is null and period_end is null)),
  check (kind in ('evidence','summary') or approved_at is null),
  check (delivered_at is null or (kind = 'summary' and approved_at is not null)),
  check ((kind = 'mentor') = (mentor_id is not null)),
  check ((kind = 'evidence') = (length(trim(requirement)) > 0))
);
create index stem_work_person on public.stem_work(person_id, created_at desc);
create unique index stem_summary_period on public.stem_work(person_id, period_start) where kind = 'summary';

create table public.stem_links (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.stem_memberships(person_id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null default auth.uid() references public.staff(user_id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  check (expires_at <= created_at + interval '30 days')
);
create index stem_links_person on public.stem_links(person_id);

create function private.stem_person_allowed(p uuid, scope public.consent_scope) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.people where id = p and stage <> 'withdrawn'
    and (is_sample or (select real_data_enabled from public.pilot_settings)))
    and private.has_consent(p, scope)
$$;
revoke all on function private.stem_person_allowed(uuid, public.consent_scope) from public, anon;
grant execute on function private.stem_person_allowed(uuid, public.consent_scope) to authenticated;

-- RLS remains the authority for every staff query and mutation.
alter table public.stem_program enable row level security;
alter table public.stem_memberships enable row level security;
alter table public.stem_mentors enable row level security;
alter table public.stem_opportunities enable row level security;
alter table public.stem_work enable row level security;
alter table public.stem_links enable row level security;
grant select, insert, update, delete on public.stem_program, public.stem_memberships, public.stem_mentors, public.stem_opportunities, public.stem_work, public.stem_links to authenticated;
revoke all on public.stem_program, public.stem_memberships, public.stem_mentors, public.stem_opportunities, public.stem_work, public.stem_links from anon;
create policy stem_program_read on public.stem_program for select to authenticated using ((select private.is_staff()));
create policy stem_program_update on public.stem_program for update to authenticated using ((select private.has_role('admin'))) with check ((select private.has_role('admin')));
create policy stem_members_read on public.stem_memberships for select to authenticated using ((select private.has_role('admin','admissions','teacher')) and private.stem_person_allowed(person_id,'student_voice'));
create policy stem_members_insert on public.stem_memberships for insert to authenticated with check ((select private.has_role('admin','admissions','teacher')) and created_by = (select auth.uid()));
create policy stem_members_update on public.stem_memberships for update to authenticated using ((select private.has_role('admin','admissions','teacher')) and private.stem_person_allowed(person_id,'student_voice')) with check ((select private.has_role('admin','admissions','teacher')));
create policy stem_mentors_read on public.stem_mentors for select to authenticated using ((select private.has_role('admin','admissions','teacher')));
create policy stem_mentors_manage on public.stem_mentors for all to authenticated using ((select private.has_role('admin'))) with check ((select private.has_role('admin')));
create policy stem_opportunities_read on public.stem_opportunities for select to authenticated using ((select private.has_role('admin','admissions','teacher')));
create policy stem_opportunities_manage on public.stem_opportunities for all to authenticated using ((select private.has_role('admin'))) with check ((select private.has_role('admin')));
create policy stem_work_read on public.stem_work for select to authenticated using ((select private.has_role('admin','admissions','teacher')) and private.stem_person_allowed(person_id,case when kind = 'meeting' then 'staff_observations'::public.consent_scope else 'student_voice'::public.consent_scope end));
create policy stem_work_insert on public.stem_work for insert to authenticated with check ((select private.has_role('admin','admissions','teacher')) and created_by = (select auth.uid()));
create policy stem_work_update on public.stem_work for update to authenticated using ((select private.has_role('admin','admissions','teacher')) and private.stem_person_allowed(person_id,case when kind = 'meeting' then 'staff_observations'::public.consent_scope else 'student_voice'::public.consent_scope end)) with check ((select private.has_role('admin','admissions','teacher')));
create policy stem_links_read on public.stem_links for select to authenticated using ((select private.has_role('admin','admissions','teacher')) and private.stem_person_allowed(person_id,'student_voice'));
create policy stem_links_insert on public.stem_links for insert to authenticated with check ((select private.has_role('admin','admissions','teacher')) and created_by = (select auth.uid()));
create policy stem_links_delete on public.stem_links for delete to authenticated using ((select private.has_role('admin')) or created_by = (select auth.uid()));

create function private.stem_program_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r text;
begin
  foreach r in array new.requirements loop
    if length(trim(r)) not between 1 and 500 then raise exception 'Each requirement needs 1 to 500 characters'; end if;
  end loop;
  if cardinality(new.requirements) <> (select count(distinct x) from unnest(new.requirements) x) then raise exception 'Requirements must be distinct'; end if;
  if new.requirements is distinct from old.requirements then new.approved_by := null; new.approved_at := null;
  elsif new.approved_at is not null and old.approved_at is null then
    new.approved_by := (select display_name from public.staff where user_id = auth.uid() and active);
    new.approved_at := now();
  elsif old.approved_at is not null then new.approved_by := old.approved_by; new.approved_at := old.approved_at;
  end if;
  return new;
end $$;
create trigger stem_program_guard before update on public.stem_program for each row execute function private.stem_program_guard();

create function private.stem_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare who text; rules text[];
begin
  if not private.stem_person_allowed(new.person_id,case when tg_table_name = 'stem_work' and (to_jsonb(new)->>'kind') = 'meeting' then 'staff_observations'::public.consent_scope else 'student_voice'::public.consent_scope end) then
    raise exception 'Active consent and an open pilot are required';
  end if;
  if tg_op = 'INSERT' then new.created_at := now();
  elsif new.person_id <> old.person_id or new.created_by <> old.created_by or new.created_at <> old.created_at then raise exception 'Student and author cannot change'; end if;
  who := (select display_name from public.staff where user_id = auth.uid() and active and role in ('admin','admissions','teacher'));
  if tg_table_name = 'stem_links' then
    if tg_op = 'UPDATE' then raise exception 'Replace a link instead of editing it'; end if;
    return new;
  end if;
  new.updated_at := now();
  if tg_table_name = 'stem_memberships' then
    -- Serialize awards with rubric edits; an award stores the rubric used.
    select requirements into rules from public.stem_program where id for share;
    if tg_op = 'INSERT' and (new.status not in ('draft','submitted') or new.distinction_at is not null or new.distinction_by is not null or new.distinction_requirements is not null or new.reviewed_by is not null) then raise exception 'Start with an unsigned application'; end if;
    if tg_op = 'UPDATE' then
      if old.status = 'distinction' then raise exception 'A signed distinction is read-only'; end if;
      if new.status <> old.status and new.status not in ('draft','submitted') then
        if who is null then raise exception 'A staff coordinator must review this'; end if;
        if new.status = 'active' and old.status not in ('submitted','paused','active') then raise exception 'Submit the application before accepting it'; end if;
        new.reviewed_by := who;
      else new.reviewed_by := old.reviewed_by; end if;
      if new.status = 'distinction' then
        if old.status <> 'active' then raise exception 'Accept the application before reviewing the distinction'; end if;
        if not exists (select 1 from public.stem_program where approved_at is not null) or exists (
          select 1 from unnest(rules) r where not exists (select 1 from public.stem_work w where w.person_id = new.person_id and w.kind = 'evidence' and w.requirement = r and w.approved_at is not null)
        ) then raise exception 'Approve the rubric and review evidence for every requirement first'; end if;
        new.distinction_by := who; new.distinction_at := now(); new.distinction_requirements := rules;
      else new.distinction_by := old.distinction_by; new.distinction_at := old.distinction_at; new.distinction_requirements := old.distinction_requirements; end if;
    end if;
    if new.status = 'submitted' then
      if length(trim(new.interest)) = 0 or length(trim(new.goal)) = 0 or length(trim(new.availability)) = 0 then raise exception 'Complete interest, goal and availability before submitting'; end if;
      if exists (select 1 from public.stem_program where application_deadline < current_date) then raise exception 'The application deadline has passed; ask your coordinator'; end if;
    end if;
  elsif tg_table_name = 'stem_work' then
    if tg_op = 'UPDATE' then
      if new.kind <> old.kind or new.period_start is distinct from old.period_start or new.period_end is distinct from old.period_end then raise exception 'Activity type and summary period cannot change'; end if;
      if old.approved_at is not null and (to_jsonb(new) - array['updated_at','delivered_at']) <> (to_jsonb(old) - array['updated_at','delivered_at']) then raise exception 'Reviewed evidence and summaries are read-only'; end if;
    end if;
    if tg_op = 'INSERT' and (new.approved_at is not null or new.approved_by is not null or new.delivered_at is not null) then raise exception 'Save a draft before review'; end if;
    if new.approved_at is not null and (tg_op = 'INSERT' or old.approved_at is null) then
      if who is null or length(trim(new.body)) = 0 then raise exception 'A named coordinator must review meaningful evidence or a summary'; end if;
      new.approved_by := who; new.approved_at := now();
    end if;
    if new.kind = 'evidence' and not exists (select 1 from public.stem_program where new.requirement = any(requirements)) then raise exception 'Choose a current requirement'; end if;
    if new.kind = 'mentor' and not exists (select 1 from public.stem_mentors where id = new.mentor_id and active) then raise exception 'Choose an available mentor'; end if;
    if new.kind = 'summary' and new.period_end > current_date then raise exception 'This biweekly period is not due yet'; end if;
    if new.delivered_at is not null and (tg_op = 'INSERT' or old.delivered_at is null) then
      if who is null then raise exception 'A coordinator must confirm delivery'; end if;
      new.delivered_at := now();
    elsif tg_op = 'UPDATE' then new.delivered_at := old.delivered_at; end if;
  end if;
  return new;
end $$;
create trigger stem_members_guard before insert or update on public.stem_memberships for each row execute function private.stem_guard();
create trigger stem_work_guard before insert or update on public.stem_work for each row execute function private.stem_guard();
create trigger stem_links_guard before insert or update on public.stem_links for each row execute function private.stem_guard();
revoke all on function private.stem_guard(), private.stem_program_guard() from public, anon, authenticated;

create function private.stem_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.access_log(staff_id,action,person_id,detail) values
    (coalesce(auth.uid(),new.created_by),'stem_' || tg_table_name || '_' || lower(tg_op),new.person_id,jsonb_build_object('id',new.id,'via',case when auth.uid() is null then 'student_link' else 'staff' end));
  return new;
end $$;
revoke all on function private.stem_audit() from public, anon, authenticated;
create trigger stem_members_audit after insert or update on public.stem_memberships for each row execute function private.stem_audit();
create trigger stem_work_audit after insert or update on public.stem_work for each row execute function private.stem_audit();

create function private.stem_link(p_token text) returns public.stem_links
language sql stable security definer set search_path = '' as $$
  select l from public.stem_links l join public.staff s on s.user_id = l.created_by and s.active and s.role in ('admin','admissions','teacher')
  where l.token_hash = encode(sha256(convert_to(coalesce(p_token,''),'UTF8')),'hex') and l.expires_at > now()
    and private.stem_person_allowed(l.person_id,'student_voice')
$$;
revoke all on function private.stem_link(text) from public, anon, authenticated;

create function private.stem_student_view(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare l public.stem_links;
begin
  l := private.stem_link(p_token);
  if l.id is null then return null; end if;
  return jsonb_build_object(
    'first_name',(select coalesce(preferred_name,first_name) from public.people where id = l.person_id),
    'expires_at',l.expires_at,
    'program',(select to_jsonb(p) from public.stem_program p),
    'member',(select jsonb_build_object('interest',interest,'goal',goal,'availability',availability,'status',status,'review_note',review_note,'distinction_at',distinction_at) from public.stem_memberships where person_id = l.person_id),
    'work',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'title',title,'body',case when kind = 'mentor' then '' else body end,'next_step',next_step,'due_date',due_date,'url',url,'status',status,'requirement',requirement,'approved_at',approved_at) order by created_at desc)
      from public.stem_work where person_id = l.person_id and (kind in ('project','evidence','mentor') or (kind = 'summary' and approved_at is not null))),'[]'::jsonb),
    'mentors',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'kind',kind,'expertise',expertise)) from public.stem_mentors where active),'[]'::jsonb),
    'opportunities',coalesce((select jsonb_agg(to_jsonb(o)) from public.stem_opportunities o where published and (deadline is null or deadline >= current_date)),'[]'::jsonb)
  );
end $$;

create function private.stem_student_submit(p_token text,p_kind text,p_data jsonb) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare l public.stem_links; m public.stem_memberships; w public.stem_work;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 20000 then return false; end if;
  l := private.stem_link(p_token);
  if l.id is null then return false; end if;
  select * into m from public.stem_memberships where person_id = l.person_id for update;
  if m.status in ('paused','distinction') then return false; end if;
  if p_kind = 'application' then
    if m.status <> 'draft' or p_data - array['interest','goal','availability'] <> '{}'::jsonb then return false; end if;
    update public.stem_memberships set interest = p_data->>'interest',goal = p_data->>'goal',availability = p_data->>'availability',status = 'submitted' where id = m.id;
  elsif p_kind in ('project','evidence','mentor') then
    if p_data - array['id','title','body','next_step','due_date','url','requirement','mentor_id','status'] <> '{}'::jsonb then return false; end if;
    if (select count(*) from public.stem_work where person_id = l.person_id and kind <> 'summary') >= 200 then return false; end if;
    if p_kind = 'mentor' then
      insert into public.stem_work(person_id,kind,title,mentor_id,created_by)
        select l.person_id,'mentor','Introduction requested: ' || name,id,l.created_by from public.stem_mentors where id = (p_data->>'mentor_id')::uuid and active;
      return found;
    end if;
    if p_data->>'id' is not null then
      if p_kind <> 'project' then return false; end if;
      select * into w from public.stem_work where id = (p_data->>'id')::uuid and person_id = l.person_id and kind = 'project' for update;
      if not found then return false; end if;
      update public.stem_work set title = p_data->>'title',body = coalesce(p_data->>'body',''),next_step = coalesce(p_data->>'next_step',''),due_date = nullif(p_data->>'due_date','')::date,url = coalesce(p_data->>'url',''),status = coalesce(p_data->>'status','planned') where id = w.id;
    else
      insert into public.stem_work(person_id,kind,title,body,next_step,due_date,url,requirement,status,created_by)
        values(l.person_id,p_kind,p_data->>'title',coalesce(p_data->>'body',''),coalesce(p_data->>'next_step',''),nullif(p_data->>'due_date','')::date,coalesce(p_data->>'url',''),case when p_kind = 'evidence' then coalesce(p_data->>'requirement','') else '' end,coalesce(p_data->>'status','planned'),l.created_by);
    end if;
  else return false; end if;
  return true;
exception when check_violation or not_null_violation or invalid_text_representation or invalid_datetime_format or datetime_field_overflow or raise_exception then return false;
end $$;
revoke all on function private.stem_student_view(text), private.stem_student_submit(text,text,jsonb) from public;
grant execute on function private.stem_student_view(text), private.stem_student_submit(text,text,jsonb) to anon, authenticated;
create function public.stem_student_view(p_token text) returns jsonb language sql stable security invoker set search_path = '' as $$ select private.stem_student_view(p_token) $$;
create function public.stem_student_submit(p_token text,p_kind text,p_data jsonb) returns boolean language sql volatile security invoker set search_path = '' as $$ select private.stem_student_submit(p_token,p_kind,p_data) $$;
revoke all on function public.stem_student_view(text), public.stem_student_submit(text,text,jsonb) from public;
grant execute on function public.stem_student_view(text), public.stem_student_submit(text,text,jsonb) to anon, authenticated;

-- A database job prepares the biweekly assistant's drafts with no external
-- AI call or service-role API client. Signing releases them to student pages.
create function private.stem_prepare_due_summaries() returns int
language plpgsql volatile security definer set search_path = '' as $$
declare m public.stem_memberships; p public.stem_program; start_on date; end_on date;
  author uuid; summary_text text; count_added int := 0; changed int;
begin
  if auth.uid() is not null and not private.has_role('admin','admissions','teacher') then raise exception 'Coordinator access required'; end if;
  select * into p from public.stem_program where id;
  for m in select * from public.stem_memberships where status in ('submitted','active') loop
    if not private.stem_person_allowed(m.person_id,'student_voice') then continue; end if;
    author := coalesce(auth.uid(),m.created_by);
    if not exists (select 1 from public.staff where user_id = author and active and role in ('admin','admissions','teacher')) then continue; end if;
    select coalesce(max(period_end),m.created_at::date) into start_on from public.stem_work where person_id = m.person_id and kind = 'summary';
    end_on := start_on + 14;
    if end_on > current_date then continue; end if;
    summary_text := 'Your STEM Scholars update · ' || start_on || ' to ' || end_on || E'\n\nApplication: ' || m.status || E'.\n\nWhat has been happening\n' ||
      coalesce((select string_agg('• ' || title || ': ' || body,E'\n' order by updated_at) from public.stem_work where person_id = m.person_id and kind = 'project' and updated_at::date >= start_on and updated_at::date < end_on),'No new project updates in this period. Bring your latest work to your next mentor conversation.') ||
      E'\n\nYour next steps\n' || coalesce((select string_agg('• ' || title || ': ' || next_step || case when due_date is not null then ' (by ' || due_date || ')' else '' end,E'\n' order by due_date nulls last) from public.stem_work where person_id = m.person_id and kind <> 'summary' and status <> 'completed' and next_step <> ''),'Check in with your coordinator to choose your next step.') ||
      E'\n\n' || case when p.approved_at is null then 'Suggested requirements · awaiting school approval' else 'Toward the STEM Scholars distinction' end || E'\n' ||
      coalesce((select string_agg('• Gather and review evidence for: ' || r,E'\n') from unnest(p.requirements) r where not exists (select 1 from public.stem_work w where w.person_id = m.person_id and w.kind = 'evidence' and w.requirement = r and w.approved_at is not null)),'Your evidence is reviewed. Ask your coordinator to review your distinction.') ||
      E'\n\nOpportunities to explore\n' || coalesce((select string_agg('• ' || title || ' · ' || organization || case when deadline is not null then ' · apply by ' || deadline else '' end || E'\n' || url,E'\n') from (select * from public.stem_opportunities where published and (deadline is null or deadline >= current_date) order by deadline nulls last limit 6) o),'Ask your coordinator about upcoming research and internships.');
    insert into public.stem_work(person_id,kind,title,body,period_start,period_end,created_by)
      values(m.person_id,'summary','Biweekly update · ' || end_on,left(summary_text,12000),start_on,end_on,author)
      on conflict (person_id,period_start) where kind = 'summary' do nothing;
    get diagnostics changed = row_count;
    count_added := count_added + changed;
  end loop;
  return count_added;
end $$;
revoke all on function private.stem_prepare_due_summaries() from public, anon, authenticated;
create function private.stem_prepare_as_staff() returns int
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not private.has_role('admin','admissions','teacher') then raise exception 'Coordinator access required'; end if;
  return private.stem_prepare_due_summaries();
end $$;
revoke all on function private.stem_prepare_as_staff() from public, anon;
grant execute on function private.stem_prepare_as_staff() to authenticated;
create function public.stem_prepare_due_summaries() returns int
language sql volatile security invoker set search_path = '' as $$ select private.stem_prepare_as_staff() $$;
revoke all on function public.stem_prepare_due_summaries() from public, anon;
grant execute on function public.stem_prepare_due_summaries() to authenticated;

-- Supabase Cron is optional. If already enabled, install one idempotent daily
-- job; the per-student 14-day cadence and uniqueness live above, not in cron.
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('stem-scholars-biweekly','0 13 * * *','select private.stem_prepare_due_summaries()');
  end if;
end $$;
