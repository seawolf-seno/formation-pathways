-- Whether referral thank-yous are on: a yes/no anyone may ask, nothing else
-- (like inquiries_open()). The welcome page right after /discover lets a
-- family invite another family with their own code; while thank-yous are on
-- that invite must say so (the FTC's endorsement rules). docs/referrals.md.
-- The app treats a missing function as "on" and discloses anyway.

create function private.referral_thanks_open() returns boolean
  language sql stable security definer set search_path = '' as $$
  select coalesce((select referral_thanks_open from public.pilot_settings limit 1), false)
$$;
revoke all on function private.referral_thanks_open() from public;
create function public.referral_thanks_open() returns boolean
  language sql stable security invoker set search_path = '' as $$
  select private.referral_thanks_open()
$$;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function private.referral_thanks_open() to anon;
    grant execute on function public.referral_thanks_open() to anon;
  end if;
end $$;
grant execute on function private.referral_thanks_open() to authenticated;
grant execute on function public.referral_thanks_open() to authenticated;
