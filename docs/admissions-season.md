# Admissions season dashboard

`/season` (admin and admissions, signed in) shows how this admissions season
is going next to the three before it: inquiries, applications, admits and
enrollments to date, a pace chart, application rate on the same date each
season, and a season-by-season table with yield. It also explains the family
pathway experience and how we'll measure whether it helps.

It runs on **fictional sample figures** until live Finalsite counts are both
configured and approved.

## What it holds, and what it never holds

`admissions_funnel_counts` holds totals only: entry year, stage, date, count.
There is no person, name, id or free-text column, so no individual family can
end up in it (a test checks the column list).

- **Small-cell suppression.** Postgres refuses counts of 1–4; the importer
  stores NULL ("fewer than 5") instead. Zero and 5+ are kept.
- **Live counts are approved separately.** The database refuses non-sample
  counts until an admin records who approved showing live Finalsite totals and
  where (`pilot_settings.funnel_*`). Withdrawing approval blocks new live
  imports; delete existing live rows too if leadership wants them gone.
- **This is not the student pilot.** The pilot gate, consent scopes and
  allowlist rules for per-student data are untouched and still LOCKED.
- **Roles.** Admin and admissions read; only admins import or approve. Every
  view, import, check and approval change goes to the access log.

`npm run test:db` covers the database rules; `npm run test:share` covers the
counting (`lib/sor/funnel.ts`), the sample generator and the Finalsite mapping.

## How counts are made

Same pipeline for sample and live (`lib/sor/importers/run-funnel.ts`):

1. **Events.** Each student becomes a `FunnelEvent`: an entry year and the
   dates they inquired, applied, were admitted and enrolled. Nothing else.
   Sample events come from `fixtures/sample/finalsite-funnel.json`; live events
   from Finalsite contacts, each mapped and dropped immediately.
2. **Aggregate** (`aggregateFunnel`): cumulative counts per stage, weekly from
   Aug 1, plus today and the same date in each past season, then suppressed.
   A later stage implies the earlier ones (an admitted student with no inquiry
   date still counts as an inquiry).
3. **Upsert** into `admissions_funnel_counts`. The dashboard shows live rows
   once any exist, otherwise sample rows.

A season is named by the fall the class enters: entry year 2027 is the
2026–27 season, Aug 1, 2026 → Jul 31, 2027.

## Switching on live Finalsite counts

1. **Approval.** Someone in school leadership approves showing whole-school
   admissions totals here. Record it on `/season` → Data source.
2. **Credentials.** In Finalsite EMS: Settings → Fields & Data → External API
   Documentation (needs a System Admin with Data permissions; Finalsite
   enables the feature). Put the base URL, credential id and secret in
   `.env.local` (and Vercel env, when deployed) as `FINALSITE_API_*`. See
   `.env.local.example`. Never commit them or paste them into chat.
3. **Map the fields.** The Swagger page on that same screen lists the
   endpoint and field names. Pacifica's (checked 2026-09-30): base URL
   `https://pacificachristian.fsenrollment.com`, contacts at
   `/api/external/contacts` (the default), Bearer JWT. A wrong path reaches the
   web app instead and returns 401 "You need to sign in or sign up before
   continuing". Edit `FINALSITE_FUNNEL_FIELDS` in
   `lib/sor/importers/finalsite-api.ts` to match the contact fields; the
   current names are guesses, and *Check connection* lists the real ones.
4. **Check connection** on `/season`. It fetches one page and reports the
   field names it saw and which mapped fields it found, never values.
5. **Import live counts.** Warnings name missing fields, never values.

API facts the client relies on (Finalsite's "Custom Data Services: Finalsite
Enrollment External API" article): read-only GET over HTTPS; HS256 JWT with
`sub` = credential id, `name`, `exp` ≤ 60 min, as a Bearer token; optional
`X-Api-Version`; at most 100 objects per page with `meta.next_cursor` passed
back as `?cursor=`; 15 requests per 10 s, then 429 with Retry-After. The client
waits 0.7 s between pages and honors Retry-After.

A whole-school pull means every contact passes through server memory during
the import, even though only totals are kept. That's why step 1 comes first.

## Measuring the pathway experience (not built)

The dashboard states the plan and shows no result, because no real family has
used pathways yet. The table reserves `cohort = 'pathway' | 'comparison'` for:

- **Yield**: admitted families offered a pathway vs. comparable admitted
  families not yet offered, same season. Fairest with random assignment
  during the pilot; comparing with past seasons alone is weaker.
- **New inquiries**: inquiries arriving through a shared pathway card. Tag the
  "Discover Pacifica" link (`NEXT_PUBLIC_ADMISSIONS_URL`) and record it as
  the inquiry source in Finalsite.

This needs a per-family link between "got a pathway" and Finalsite status,
which is per-student data: it belongs in the consented pilot, under its
gate and consent rules, not in this counts-only table. Before it starts:
leadership approval and family consent for the pathway pilot, parent access to
their own page (`docs/pathway-sharing.md`), and approved AI vendor terms.

## Demo walkthrough (Oct 5)

1. `/season` — "Sample figures (fictional)" badge. Tiles show this season on
   today's date against last season on the same date, then the pace chart
   (switch to Applications), application rate and the table.
2. Data source — the live Finalsite path is built and waiting on approval
   (LOCKED panel), not on engineering.
3. "Walk through it with a fictional family" → `/applicant/emma-r-8f3k2a` →
   three pathways → Share this possibility.
4. Back to "How we'll know if pathways help": what we'll measure, when, and
   what has to happen first.
