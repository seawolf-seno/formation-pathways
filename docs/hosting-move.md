# Moving hosting to a school-owned Vercel team

Fizzy card #26. Today production runs in seno's personal Vercel **Hobby** team (`seno-2280s-projects`). That team is meant for personal, non-commercial use, it keeps runtime logs for only one hour, and seno is its only member. A school system holding consented student data should sit in a team the school owns, with at least two admins, longer log retention and a spend limit.

The move itself is done by seno and Pacifica IT. Nothing here has been changed in Vercel or Supabase yet.

## Decide first

- **Who owns the team.** A school account (for example an IT-managed address), not a personal one. seno and one IT admin as owners.
- **Plan and billing.** A paid team plan, billed to the school. Set a spend limit on day one.
- **The address families and staff will use.** Recommended: a school subdomain such as `pathways.pacificachristian.org`, set up as part of the move. If the app keeps a `*.vercel.app` address, that address may change when the project moves teams, and every link below would have to change with it. A school domain is stable across any future move.

## What has to move with it

**Environment variables** (Production; names only). Set today: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY`, `AI_REAL_STUDENTS`, `GOOGLE_SIGNIN`, `FINALSITE_API_BASE_URL`, `FINALSITE_API_CREDENTIAL_ID`, `FINALSITE_API_SECRET`, `FINALSITE_ADMITTED_STATUSES`, `FINALSITE_DECISION_DATES`, `BLACKBAUD_CLIENT_ID`, `BLACKBAUD_CLIENT_SECRET`, `BLACKBAUD_SUBSCRIPTION_KEY`, `CANVAS_BASE_URL`, `CANVAS_API_TOKEN`, `CANVAS_PILOT_COURSE_IDS`. Keep the secrets marked **Sensitive**. Read by the code but not set (defaults apply): `ANTHROPIC_MODEL` (defaults to Sonnet 4.6), `WORLD_SIGNALS`, `DEMO_PERSIST`, the other `FINALSITE_*` options.

**Addresses registered elsewhere** (each must name the new production address):
- Supabase Auth: **Site URL**, and the redirect allow list entry for `<address>/auth/callback`.
- Blackbaud SKY app: redirect URI `<address>/auth/blackbaud/callback`.
- Google sign-in: the OAuth client goes through Supabase, so its redirect normally doesn't change. Check it anyway if a custom domain is added to Supabase Auth.

**Things that will break if the address changes**
- Staff sessions are cookies on the old address, so everyone signs in once more.
- One-time family Spark links and shared pathway pages already sent carry the old address. Keep the old project serving (or redirecting) until outstanding Spark links have expired (7 days).

## Settings to turn on in the new team

- Two-factor sign-in required for team members.
- Deployment Protection for preview deployments (Vercel Authentication), as today.
- **Separate data for previews.** Today preview deployments get the production Supabase URL and key, so any unmerged branch runs against real student data. Give Preview its own Supabase project holding fictional data only, or no Supabase settings at all.
- Log retention and alerts long enough to investigate a problem the next morning.
- Spend limit and usage alerts.

## Order of operations

1. Create the school team; add seno and IT as owners; set the spend limit and 2FA.
2. Add the school subdomain to the project, if chosen, and point DNS at it.
3. Transfer the project. Check that every environment variable listed above is present afterwards.
4. Update Supabase Auth Site URL and redirect list, and the Blackbaud redirect URI, to the new address.
5. Sign in with a code and with Google; open `/pilot` (the "database matches the code" line should show); run a Spark with a fictional sample student; open a family link and a shared page.
6. Tell staff to sign in again. Keep the old address redirecting for at least 7 days.
7. Remove seno's personal team's access once everything works.

Do it outside school hours. Rollback: point the domain back at the old deployment, which keeps running until step 7.
