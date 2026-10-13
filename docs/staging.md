# Staging: where the team tests

Staging is the second Supabase project (`tavgqwdqlwpmcejzefso`). It holds the
same schema as production, and every migration lands there first, but it has
**fictional data only**:
- the six sample students, with their Finalsite, Blackbaud, class history and Canvas data;
- 700 `/season` figures and 5 demo families;
- whatever sample courses people load in the Mastery Hub.

Never put a real student or family there.

## Three ways in

| Who | How | Sees |
|---|---|---|
| Anyone with the repo | `npm run dev:staging` → http://localhost:3000 | Their own working copy, on staging data |
| Anyone on the Vercel team (Viewers too) | A preview link, signed in to Vercel | A PR's code, on staging data |
| seno | The `supabase-staging` MCP / dashboard | The database itself |

Previews are **built** only for Developer seats (paid). Contributors are
Viewers (free), so seno builds a preview of their PR with
`scripts/preview-pr.sh <PR number>`, after reading its diff. The script puts
the PR on `preview/pr-<n>` with one empty commit by seno on top, waits for
Vercel, and comments the link on the PR. Run `scripts/preview-pr.sh <n> --done`
afterwards to delete the branch. Previews carry only the two public staging
settings, so a preview never has a secret or production access.

## Signing in to staging

Staging sends the same 6-digit code emails as production. That needs
**seno's one-time setup** in the Supabase dashboard of the **staging** project
(Supabase's built-in email only reaches members of the Supabase organization,
which colleagues shouldn't be, because membership also reaches production):

1. **Authentication → Emails → SMTP Settings**: turn on custom SMTP and enter
   the same sender, host, port, user and password as production's
   (production project → the same page). Sender name: "Formation Pathways
   (staging)".
2. **Authentication → Emails → Templates → Magic Link**: paste production's
   template, which shows `{{ .Token }}`. The code is what makes sign-in work
   on localhost and on any preview address. Put "STAGING" in the subject.
3. **Authentication → URL Configuration → Redirect URLs**: add
   `http://localhost:3000/**` and
   `https://*-pacifica-christian-high-school.vercel.app/**`, so the emailed
   link also works there.

After that, anyone `@pacificachristian.org` can request a code. Their first
sign-in creates a **pending** staging staff account. Student addresses (a
number before the @) are never approved automatically. seno approves it on
staging's `/pilot` and picks the role:
- **staff**: capture;
- **teacher**: plus the Mastery Hub, Spark results, class reflections;
- **admin**: everything;
- **viewer**: read-only, sample students.

seno's agent can do the same through the `supabase-staging` MCP.

## What to test where

- **Spark** (any entry point), **pathways**, **capture**, **Study Hub**,
  **inquiries**: the sample students and demo families are already there.
- **Mastery Hub**: `/mastery` → **Load a sample AP Physics 1 class** (each
  teacher gets their own `APPhysics1-Sample`). To see the student side, give a
  sample student a sign-in with another school address you can read, then
  sign in with it in a private window.
- **AI drafting** runs its canned fallback on previews (no key there). Run
  `npm run eval:pathways` locally with your own key for real output.
