-- Student addresses are never approved automatically (Fizzy #35).
--
-- Students hold @pacificachristian.org addresses too; theirs carry a number
-- before the @ and staff ones don't. With auto_approve_staff on, the
-- provisioning trigger made a student's first sign-in an active Staff account.
--
-- Now an address with a number before the @ always starts PENDING, whatever
-- the setting. An admin can still approve one by hand on /pilot (a student
-- contributor, or a staff address that happens to carry a number), so a wrong
-- guess costs one click and never grants access.
--
-- Existing rows are not changed. /pilot marks them "Student address" so an
-- admin can review the accounts approved before this ran.

create function private.is_student_address(email text) returns boolean
  language sql immutable set search_path = '' as $$
  select split_part(lower(coalesce(email, '')), '@', 1) ~ '[0-9]'
$$;

revoke all on function private.is_student_address(text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function private.is_student_address(text) from anon;
  end if;
end $$;
revoke all on function private.is_student_address(text) from authenticated;

-- Same function as 20260924041619_staff_self_provisioning.sql; only the
-- `active` value changes.
create or replace function private.provision_staff() returns trigger
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
    not private.is_student_address(new.email)
      and coalesce((select auto_approve_staff from public.pilot_settings), false)
  )
  on conflict do nothing;  -- never touch an existing row (role, deactivation)
  return new;
end $$;
