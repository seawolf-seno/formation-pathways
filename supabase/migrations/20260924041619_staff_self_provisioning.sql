-- Staff self-provisioning: the first confirmed sign-in from a school address
-- creates a `staff` row, so no admin has to add every teacher by SQL.
--
-- New rows are PENDING (active = false) by default: an admin approves each
-- one on /pilot. RLS helpers only count active staff, so a pending account
-- sees nothing. An admin can turn on auto_approve_staff once it's confirmed
-- that only staff (not students) hold @pacificachristian.org addresses.
-- Subdomains (e.g. @students.pacificachristian.org) never match.
--
-- Fires on confirmation, not on insert: requesting a sign-in code creates an
-- unconfirmed auth user, and nobody should get a staff row for an address
-- they haven't proven they own.

alter table pilot_settings add column auto_approve_staff boolean not null default false;

create function private.provision_staff() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if new.email_confirmed_at is null
     or lower(new.email) not like '%@pacificachristian.org' then
    return new;
  end if;
  insert into public.staff (user_id, email, display_name, role, active)
  values (
    new.id,
    lower(new.email),
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(lower(new.email), '@', 1)
    ),
    'staff',
    coalesce((select auto_approve_staff from public.pilot_settings), false)
  )
  on conflict do nothing;  -- never touch an existing row (role, deactivation)
  return new;
end $$;

revoke all on function private.provision_staff() from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function private.provision_staff() from anon;
  end if;
end $$;
revoke all on function private.provision_staff() from authenticated;

create trigger provision_staff_on_confirm
  after insert or update of email_confirmed_at on auth.users
  for each row execute function private.provision_staff();
