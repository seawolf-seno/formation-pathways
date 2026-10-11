# Formation Pathways

A platform for Pacifica Christian High School. Teachers capture short voice/text
observations of student formation moments; AI synthesizes them into a
forward-looking "Pathway" per student. Governing principle: AI works for the
adults behind the scenes; students stay present, in person, with people.

## Status (update as work happens — keep current, not historical)

- **September 25 contribution (`codex/pathways-first-experience`)**: family-facing
  pathway exploration and focused sharing preview for the October 5 demonstration.
  Start locally at `/applicant/emma-r-8f3k2a`; no dashboard is part of this flow.
  Public HTML and image cards use selected snapshots. See `docs/pathway-sharing.md`
  for verification and unresolved production-family access/storage requirements.

- **Built**: all three exec-demo features (spec Part 3) — Voice Capture (Day-1),
  Admissions Personalized Pathways (`/apply` → `/admissions` → `/applicant/[slug-token]`),
  Teacher Skills Page (`/courses` — Canvas + Google Drive → skill snapshots). Merged to
  `main` via PR #3, CI green, as of 2026-09-20.
- **Built 2026-09-23 (branch `seno/system-of-record`)**: the **system of record** for a
  consented real-student pilot. Supabase Postgres, staff login, `/pilot` (leadership gate,
  roster, consent, Finalsite/Blackbaud/Canvas imports), `/pilot/people/[id]` ("who they are
  today" plus three Ruakh 2.0 pathways), and `/capture` (phone voice capture for any staff member).
  Runs on fictional `fixtures/sample/*` until leadership sign-off. See
  `docs/system-of-record.md`, which is the source of truth for setup, guardrails and gaps.
  **Applied to the live Supabase project 2026-09-23** (both migrations; advisors clean), with
  seno as the only `staff` admin and the six fictional sample students loaded. End-to-end
  tested in the browser on sample data first; the leadership gate was opened for the consented pilot by 2026-10-01. Deployed
  over HTTPS 2026-09-28 (see "Live deployment"). Leadership sign-off, consent form and
  AI-vendor terms are still pending.
  Merged via PR #5.
- **Built 2026-09-23 (branch `seno/staff-capture-access`)**: frictionless staff phone access.
  6-digit email-code sign-in, self-provisioned **pending** staff accounts (DB trigger on
  confirmed `@pacificachristian.org` sign-ins; admins approve/set roles on `/pilot`, optional
  auto-approve), installable "Capture" home-screen app, capture flow shortened to
  mic → Done → Save, and Vercel readiness (every page signed-in in production, runtime files
  traced). Migration applied to live Supabase. Google One Tap sign-in is the next step once IT
  creates an Internal OAuth client (see `docs/system-of-record.md`, "Google sign-in").
- **Built 2026-09-27 (for the Oct 5 demo)**: `/season`, the admissions
  season dashboard. Whole-school Finalsite **counts only** (`admissions_funnel_counts`: no
  person/name/id column, 1–4 refused as too small to show), this season vs. the three before on
  the same date, pace chart, application rate, yield table, the family pathway walkthrough
  link, and a measurement plan that shows **no pathway result** (none exists yet; don't
  add one). Runs on fictional `fixtures/sample/finalsite-funnel.json`. The live Finalsite
  External API client (`lib/sor/importers/finalsite-api.ts`) is built but OFF: needs
  `FINALSITE_API_*` env **and** a separate recorded approval (`pilot_settings.funnel_*`,
  DB-enforced). Its field map is unverified guesswork until checked against the school's
  Swagger page. **Live connection working 2026-09-30 (PRs #16–22)**: base
  `https://pacificachristian.fsenrollment.com`, `/api/external/contacts`, Bearer JWT,
  `X-Api-Version: 1`; each season pulled separately (`school_year_id` + `enrollment_type=new`);
  fields mapped. Finalsite has no admission decision date, so "admitted" = that season's status
  in `FINALSITE_ADMITTED_STATUSES`, dated by `FINALSITE_DECISION_DATES`. The admissions officer
  approved live data 2026-09-29 (record it on `/season`). **Waiting on her** for the statuses
  that mean "offered a place" and the March 2024/25/26 release dates; the import refuses to run
  without them. Once live rows exist `/season` shows them instead of sample figures, so decide
  live vs. sample for the Oct 5 demo before importing. The credential returns far more than
  needed (income, net worth, race, religion, essays); the app keeps year + 4 dates only. Ask
  Finalsite to narrow it. Merged via PR #8; migration `20260929022903_admissions_funnel.sql` **applied
  to live Supabase 2026-09-28** (advisors: nothing new; funnel approval off; table empty until
  an admin clicks *Load sample figures* on `/season`). See `docs/admissions-season.md`.
- **Blocked 2026-09-21**: live Google Drive setup — seno has no access to the Google
  Cloud/OAuth 2.0 developer console needed to generate a Drive token, waiting on Pacifica
  IT. Don't push on this until he says it's unblocked. Everything else (mock Canvas/Drive,
  the whole app) works with zero live credentials in the meantime.
- **Live deployment (2026-09-28; team moved 2026-10-11)**: https://formation-pathways.vercel.app,
  Vercel project `formation-pathways`, now in the school's **Pacifica Christian High School**
  team (moved from seno's personal Hobby team 2026-10-11). Preview deployments use the
  staging Supabase project (see "Agent database access"); Production keeps the live one. The GitHub repo is connected: merges to `main`
  auto-deploy to production, PRs get previews behind Vercel login. Preview has only the two
  public Supabase settings (staging), so AI and integrations run their offline fallbacks there;
  Production has the live keys and integration secrets (names in `docs/hosting-move.md`). No
  service-role key anywhere.
  Supabase Auth Site URL and `/auth/callback` redirect are set to the production URL; code and
  link sign-in both verified in the auth logs. On Vercel the fictional demo's SQLite lives in
  per-instance `/tmp`. `lib/demo-persist.ts` (2026-10-01) snapshots it to Supabase
  `demo_snapshots` after each demo write and reloads newer copies per page, so signed-in users
  see one consistent demo; anonymous visitors still see the instance's own copy. **Needs
  migration `20261001180000_demo_snapshots.sql` applied by seno**; until then it silently stays
  per-instance (details in `docs/oct-5-demo.md`). Server-built links use
  `requestOrigin()` (`lib/origin.ts`); never hard-code a host.
- **Agent database access (updated 2026-10-11)**: two databases, two rules.
  - **Production** (`cvppxixatcreyptpkymh`, real pilot students): the repo's `.mcp.json`
    Supabase server is `read_only=true` (PR #11, verified `transaction_read_only = on`).
    Agents never write to it, never query per-student tables, and never apply migrations
    there; seno applies them (SQL editor or `supabase db push`). The account-level claude.ai
    Supabase connector (owner access, bypasses RLS) stays disabled.
  - **Staging** (`tavgqwdqlwpmcejzefso`, fictional data only): what Vercel **Preview**
    deployments use. seno's agent has a writable `supabase-staging` MCP server (local
    scope, not in `.mcp.json`) and may apply migrations and load sample data there. Never
    put a real student or family in staging, and never open its real-data gate. Built
    2026-10-11: all 14 migrations through `20261013000000` applied under their file
    timestamps, schema fingerprint-verified identical to a PGlite run of the same files,
    security advisors clean.
  - Order for any new migration: staging first (check the PR preview), then production,
    then merge.
- **Decided, not built**: Anthropic auth on Vercel should be Workload Identity Federation
  (Vercel OIDC token → federation rule; SDK 0.125 has `oidcFederationProvider` +
  `TokenCache`), set up in the school's Anthropic org, not seno's personal one. Until then,
  no key, or a throwaway spend-capped key for the demo only.
- **Blackbaud (2026-10-01, PR #23)**: *Connect Blackbaud* on `/pilot` (SKY auth code + PKCE;
  60-minute token in the admin's httpOnly cookie only) and a names-only *Check connection* on
  seno's own staff record. Env set (subscription key, client id/secret, redirect URI registered).
  **Waiting on the Blackbaud environment admin** to connect the app ("This application has not
  been connected to your Blackbaud environment"). Field map (`mapBlackbaudUser`) unverified until
  the check runs.
- **Google sign-in (PR #24)**: *Continue with Google* built, hidden until `GOOGLE_SIGNIN=on`.
  **Waiting on IT** for an Internal OAuth client (request text in `docs/system-of-record.md`,
  "Google sign-in"). Staff phone guide: `docs/staff-capture-guide.md`.
- **State as of 2026-10-04 (PRs #26–39)**: leadership gate **OPEN**, with a small consented
  real-student pilot (seno's students; real names show on the `/pilot` roster). Blackbaud
  connected (extended user record + `course_history` class history; the import needs
  Academic Group Manager / Schedule Manager for schedules). Finalsite per-student import via
  API with a field allowlist (`STUDENT_RESPONSE_FIELDS` / `STUDENT_INTEREST_FIELDS`). Google
  sign-in and email codes both work. `ANTHROPIC_API_KEY` is set: AI runs for the fictional demo
  and sample students; **real-student AI needs `AI_REAL_STUDENTS=on`** (off until the Anthropic
  terms for student data are confirmed) plus `ai_drafting` consent. Live season counts are
  imported (`/season` shows live); the low fall-2027 inquiry count is unconfirmed by admissions.
  Built: demo persistence (`demo_snapshots`), animated pathway journeys + glimpse, edit before
  signing, signed-pathway view `/pathway/[id]`, **Spark** (`/pathway/[id]/spark`, new
  `student_voice` consent, `student_sparks`) and at-home one-time family links
  (`/spark/family/[token]`, the only anonymous write path). Agents still never write to the
  live DB or query per-student tables.
- **Unique pathways (2026-10-06, branch `seno/unique-pathways`)**: testing found pathways
  too generic (current students all take the same classes). Both generators now draft **six**
  pathways (staff remove down to three before signing) under `prompts/unique-pathways.txt`:
  find what only this student has (prior school, a project, a hobby, one sentence), courses are
  backdrop, a swap test, banned generic names. Each pathway carries a `hook` (their words) and,
  where it genuinely fits, `whyNow` + `whyNowSource` from **world signals**
  (`lib/world-signals.ts`): the head of public podcast feeds (TBPN, as in TeenAlpha, plus How I
  Built This, 99% Invisible, Short Wave, Radiolab), last 45 days, unsuitable topics filtered,
  cached 6h per instance, snapshot fallback `fixtures/world-signals.json`
  (`npm run world:refresh`; `WORLD_SIGNALS=off` = snapshot only). No student data leaves for
  this. Not yet quality-tested against real Claude output (no local key).
- **Spark results for staff (2026-10-06, branch `seno/spark-results`, stacked on #42)**: the
  person page opens with Spark (status pill in the header, every session, said-aloud/typed,
  both sides of each this-or-that, and "→ pathway · step" under each spark from the latest
  draft's hooks/✦ steps, or "not in a pathway"); `/pilot` roster shows Spark status per student.
  Drafting now merges all sessions (`mergeSparks`), not just the latest. RLS unchanged: teachers
  read sparks but not drafts (so no "used in" for them); plain `staff` read neither.
- **Spark Lab (2026-10-06, branch `seno/spark-lab`)**: "Start a Spark conversation" now runs two
  formats back to back (`components/sor/SparkLab.tsx`), pairs rotating through all six orders of
  current flow / sentence starters / swipe deck (`lib/sor/spark-lab.ts`). After each: "Did that
  feel like you?"; after both: "Which felt more like you?" Each leg saves as its own
  `student_sparks` row with `format` + `lab` in the jsonb (no migration). `/pilot/spark-lab`
  compares formats (reactions, head to head, time, specific details, share of sparks used in a
  later draft), counts only, pilot vs. fictional samples. `?format=classic` = the old single
  flow; family links still use it. Content: `prompts/spark-starters.txt`, `prompts/spark-cards.txt`.
  Spark (all modes) now saves on reaching the end; an expired sign-in shows a plain message.
- **Spark family links migration applied (2026-10-06)**: verified read-only (table, `source`
  column, consent trigger, anon grants on the two link functions only). The person page reads
  `student_sparks` with `*` so a missing column can't hide sessions again; a drift check is
  Fizzy card #19.
- **Quality check + run guide (2026-10-06)**: `npm run eval:pathways` drafts for the fictional
  sample students locally (no DB) and writes `reports/` (git-ignored) with cross-student
  checks for generic names, course-named pathways, hooks and why-nows. Needs a key in
  `.env.local`; without one it reports the fallback. `docs/spark-lab-guide.md` is the run
  sheet for Spark Lab sittings. Parallel work for colleagues is on Fizzy (board Salty, #18–27).
- **Grounded "why now", varied glimpses, plainer prose (2026-10-07)**: a pathway's "why now"
  must cite a numbered podcast item (`whyNowRef`); code keeps it only if the item exists, isn't
  reused, the line shares real words with it, and the draft has fewer than three; the source is
  written from the item (`groundWhyNows`, `lib/world-signals.ts`). Feeds drop reruns and
  money/valuation sentences. Glimpses follow "THE GLIMPSE" rules (no weekday, no "Picture",
  six different moments); a STYLE section bans contrast formulas and stock phrases, and
  `lib/draft-style.ts` tidies the two that still slip through. `npm run eval:pathways` now
  counts glimpse openings, weekdays, em dashes and banned phrasing.
- **CI on main + database drift check (2026-10-07)**: CI also runs on every push to `main`.
  `/pilot` shows admins whether the live database has every table and column the migrations
  create (`lib/sor/drift.ts`: zero-row selects as the admin; names the file to apply, and flags
  a table the Data API can't reach, which needs grants). `npm run db:drift:sql` prints the same
  check as one metadata-only query for the read-only connection or SQL editor. Verified against
  live 2026-10-07: nothing missing. Checks tables and columns only, not functions, policies or
  triggers.
- **Security review (2026-10-07, card #26)**: `docs/security-review.md`. Fixed in code: Next
  16.3.8 (critical next/og advisory), open redirect (`lib/safe-next.ts`), demo pages/actions
  require active staff in production (`lib/demo-access.ts`), demo never uses live Canvas/Drive
  in production, sparks re-validated on read, security headers (CSP report-only). **Needs seno to
  apply `20261008000000_security_hardening.sql`** (draft guards, fixed `is_sample`, link and
  payload checks, no cascade deletes from staff, demo snapshot admin/admissions only). Open
  decisions listed in the doc. Hosting move plan: `docs/hosting-move.md`.
- **Inquiries foundation (2026-10-08, card #29)**: our own family inquiry form at `/discover`
  (public; `?src=website`, `?ref=CODE`, `?embed=1` framable on pacificachristian.org only),
  admissions inbox and Finalsite export at `/pilot/inquiries`. Finalsite's External API is
  read-only, so inquiries go to Finalsite as a Create-import CSV matched by each inquiry's FP id
  (`CHILD.external_id`); settings in `docs/inquiries.md`. **Closed until seno applies
  `20261009000000_inquiries.sql` and an admin records leadership's approval on
  `/pilot/inquiries`.** Consent wording in `lib/discover.ts` is a draft for leadership. Next PRs:
  welcome page, signed pathway by email, sharing with referral codes and thank-yous.
- **Inquiry demo loop (2026-10-08, branch `seno/inquiry-demo-loop`, card #29)**: signed-in
  admin/admissions get a **test mode** on `/discover` (saves fictional samples, even while closed);
  **Load demo families** (`lib/discover-demo.ts`); `/pilot/inquiries/[id]` drafts six pathways
  from the family's own words (`inquiryDraftInput`), staff keep up to three and sign
  (`inquiry_pathways`, consent + read-only-once-signed triggers); `/pilot/inquiries/[id]/family`
  previews the family page (`components/discover/FamilyWelcome.tsx`) with a share card and
  referral link. AI only for samples until `AI_REAL_STUDENTS=on`. **Needs seno to apply
  `20261010000000_inquiry_pathways.sql`.** Walkthrough: `docs/inquiry-demo.md`. Next: email the
  family page, referral thank-yous.
- **AI on real students, names removed (2026-10-08, card #22 done)**: leadership approved
  `AI_REAL_STUDENTS=on` on condition that student data is anonymized. Every system-of-record
  AI call (pathway drafts, capture cleanup, inquiry pathways) goes through
  `lib/sor/ai-input.ts` → `lib/sor/anonymize.ts`: known names (student, family, roster,
  staff in the record, inquiry parent) and contact details become placeholders
  (`[STUDENT]`, `[FAMILY]`, `[PERSON n]`, `[STAFF n]`, `[EMAIL]`…), `assertNoNames` refuses
  to send a payload with a known name left, and names are restored locally in the result.
  Staff see the exact payload under "What the AI sees" on person and inquiry pages. Names
  not in our records can't be caught: `docs/ai-anonymization.md`. Never add an AI call on
  real data that bypasses `ai-input.ts`.
- **Pathways per audience (2026-10-08, PR #53)**: `PATHWAY_PLAN` in `lib/types.ts`: an
  inquiry gets **2** (the family page says more come with the application), an application
  (`applicant`/`admitted`, `audienceForStage`) **3**, a current student **6** (keep at least 3).
  Prompts carry `{{N}}`-style tokens rendered by `lib/pathway-count.ts` (also scales the
  combination/why-now rules and max tokens). Measured on sonnet-4-6: 2 pathways ≈ 49s,
  6 ≈ 108s. While drafting, staff see `components/sor/SeawolfSurf.tsx` (original SVG, not
  the mascot artwork) with a clock; pathway calls stop at 230s inside `maxDuration = 300`.
- **Family page and sharing (2026-10-08, branch `seno/family-share`, card #29)**: after
  signing, admissions makes a private family link (`inquiry_family_links`, hash only, 60
  days) from the inquiry page, with a ready email. `/welcome/[token]` (public, no sign-in)
  is the family's page with a share studio: pathway, look (tide/paper/sky), post/story,
  one Share button (native share sheet with the image on phones), network links, saved
  image, editable words, Stop sharing. Public `/w/[code]` (GET-only) shows first name + one
  signed pathway, unfurls with an OG card, and links to `/discover?ref=`. All reads/writes
  through `family_page`/`family_share`/`family_stop_sharing`/`public_share`. Cards:
  `lib/family-card.tsx`. **Needs seno to apply `20261011000000_family_share.sql`.**
  `docs/family-sharing.md`.
- **Inquiry flow complete (2026-10-09, branch `seno/inquiry-complete`, card #29)**: instant
  welcome right after `/discover` (no AI: their words, programs, `FIRST_WEEK` placeholder for
  admissions to rewrite, what happens next); "Email it to …" / "Text it" from the inquiry page
  (staff's own mail app, by name; no email service); guardian confirmation before any share
  (`family_share(…, p_guardian)`); reward disclosure on shares and `/w` while thank-yous are on
  (`withDisclosure`); referrals at `/pilot/inquiries/referrals` (`referral_thanks`: confirm →
  approve → sent/declined, DB-enforced real referral, no self-referral, cap, no cash, off for
  real families until an admin records leadership's decision); counts-only "How it's going"
  report (`lib/inquiry-report.ts`, 1–4 hidden); phone-card inbox; DB throttle on
  `submit_inquiry`. **Needs seno to apply `20261012000000_referral_thanks.sql`.** Phone test
  for admissions: `docs/admissions-phone-test.md`; what's left (decisions, drafts, shot list,
  design review, 5-family pilot, Vercel Firewall rule): `docs/inquiry-launch.md`.
- **Class reflections (2026-10-09, branch `samuel/class-reflections`, card #32)**: first step
  of folding Study Hub (a student's separate `study-commons` app) into Formation Pathways.
  `/pathway/[personId]/classes`, opened by staff with the student like Spark: tap the classes
  they enjoy from their own schedule (`classesForReflection`: latest Blackbaud year plus
  Canvas), twice for ones they love, then what makes each good
  (`prompts/class-reflection-likes.txt`) and one sentence. Enjoyment only: an untapped class
  is not recorded, no ratings. `class_reflections` table (`student_voice` consent trigger,
  same RLS as sparks); shown on the person page ("Classes they enjoy") and sent to drafting as
  `classReflections` (`lib/sor/class-reflections.ts`, through `ai-input.ts`). **Needs seno to
  apply `20261014000000_class_reflections.sql`**; until then the feature is hidden
  (`classReflectionsReady`) and everything else works. Open for leadership: whether the signed `student_voice` form covers this, since its
  wording names Spark. Not yet tried against real Claude output.
- **Study Hub (2026-10-09, same branch, card #32)**: `/pathway/[personId]/study`, staff-opened
  and read-only (no migration): the student's classes from the imported schedule, each with
  free study links from `fixtures/study-library.json` (faculty-editable; subjects matched by
  explicit title phrases, first match wins, no guessing; `https://` only;
  `lib/sor/study-library.ts`) and what they said they enjoy. Linked from the person page and
  from class reflections. The library started from Study Commons' curated links
  (github.com/TheEnigmaticPhilosopher/study-commons): **confirm the author's permission and
  the name to credit** (the page says "a Pacifica student's project"). Not carried over from
  Study Commons: fictional grades, grade-based practice, Canvas submission, discussions.
  Next for #32, each needing a decision first: student sign-in (none exists), student uploads
  with teacher approval, and open questions that build a no-numbers "where you are" narrative.
- **Always a next step (2026-10-09, branch `seno/always-next-step`, card #29)**: every family
  page ends with `components/discover/NextSteps.tsx`: the pathway (on its way / share it / ask for
  one), invite a family with their referral code, start the application. `NEXT_STEP_LINKS` in
  `lib/discover.ts` are **placeholders** until admissions gives the real application link;
  staff and samples see a "Placeholder link" tag. **Needs seno to apply
  `20261013000000_referral_thanks_public.sql`** (until then invites always carry the disclosure).
- **Student addresses wait (2026-10-10, branch `samuel/student-signin`, card #35)**: students
  hold `@pacificachristian.org` addresses too (a number before the @), so with auto-approve on
  a student's first sign-in became an active Staff account. Now the provisioning trigger never
  auto-approves an address with a number (`private.is_student_address`; same rule in
  `lib/sor/student-address.ts`); it waits, sees `/login?error=student`, and `/pilot` tags it
  *Student address* and counts the ones that already have access. An admin can still approve one
  by hand (student contributors). **Needs seno to apply `20261016000000_student_addresses_wait.sql`**,
  then review the tagged accounts on `/pilot`: the migration changes no existing row. Not done:
  a student sign-in with its own pages (#32), and narrowing what plain Staff can read
  (`docs/security-review.md`, decision 1).
- **Next concrete actions**:
  1. **Oct 5 board demo**: `docs/oct-5-demo.md` (decide live vs. sample `/season` tonight; never
     open a real student on screen). The deck (overview → live demo → what we build next → ask)
     is a claude.ai artifact, documented in `docs/board-deck.md`.
  2. Admissions director's self-test (`docs/admissions-tester-guide.md`); her answers on the
     fall-2027 counts and whether `financial_aid_waitlisting` counts as admitted.
  3. After leadership confirms Anthropic terms: `AI_REAL_STUDENTS=on`, then Spark → Draft →
     Edit → Sign → Open it with each pilot student; tune prompts from what they say.
  4. Canvas for the pilot (`CANVAS_*` env + Canvas user ids); ask Finalsite to narrow the API
     credential; move hosting to a school-owned Vercel team with a security review.
  5. Later: alumni consent-reset design (sketched on the Systems Map).
- Tracked live at https://claude.ai/artifact/3L9fUkHmf4q6d378289uP6 (Formation Pathways
  section) and narrated architecturally at
  https://claude.ai/artifact/GWGzrdfMSr8vfWsRycGM1T — keep both current alongside this file
  when something changes (see the global `~/.claude/CLAUDE.md`'s "Living artifacts" note).

## Background context
`/context` holds the business/product background this project was built
from. At the start of a session, read `context/formation-pathways-agent-context.md`
first — it's written as agent onboarding and says so itself. The other three
files (`pacifica-ai-formation-proposal.md`, `pacifica-pathways-one-pager.md`,
`exec-demo-prototype-spec.md`) are supplementary board/demo material — read
them only when a task needs that level of detail. Where anything there
conflicts with this file, this file wins for what's already built.

## Stack
- Next.js (App Router) + Tailwind, SQLite via better-sqlite3, Anthropic SDK
  (model: claude-sonnet-4-6). Single repo, runs with `npm run dev`.
- Two data stores, deliberately separate:
  - **Demo (SQLite, no auth)**: `app/(staff)/`, `/apply`, `/applicant/*`, all
    fictional. Plus one Supabase slice, the admissions-story pathway (see below).
  - **System of record (Supabase Postgres + Supabase Auth)**: `app/(sor)/`,
    `lib/sor/`, `supabase/migrations/`. Staff sign in with an emailed link
    (`@pacificachristian.org` only; no Google OAuth, which is blocked on IT). All reads
    and writes go through `getSorClient()` as the signed-in staff member, so **Postgres
    RLS is the authorization layer**. Never use the service-role key for system-of-record
    data. `proxy.ts` (Next 16's renamed middleware) only redirects signed-out users.
- Voice capture: browser Web Speech API for live dictation (Chrome), with a
  plain textarea fallback. (Production will use a dedicated speech-to-text
  service; do not block on audio quality now.)
- Canvas + Google Drive integrations (`lib/integrations/`) are mock-by-default
  (`MOCK_INTEGRATIONS`); a real per-teacher Canvas token or Drive OAuth token
  switches to the live client. See "Live-data safety" below before touching either.

## Product principles — enforce in UI copy and logic, every session
1. Humans author, AI drafts. Every AI output is labeled "Draft" until a named
   adult reviews and signs it. There is no unsupervised send.
2. Compass, never dossier. No numeric scores on students anywhere. Counts and
   narratives only. No red/failure states on a student profile. The word
   "record" never appears in the UI — say "Pathway."
3. Grace in the architecture. Prompts must frame struggle as
   growth-in-progress and actively surface pattern-breaking positives.
4. Warm, not clinical. AI writes about teenagers the way a teacher who loves
   them would. Never diagnose, label, or score.
5. FICTIONAL DATA ONLY everywhere except the system of record's consented
   pilot. The demo's seed students are invented; never put real names there.
   Real students may exist ONLY in the system-of-record tables, and only after
   (a) leadership sign-off is saved in `pilot_settings` and (b) that student has
   an active consent for the specific scope (`import_records`,
   `staff_observations`, `ai_drafting`). Both are enforced by Postgres triggers.
   Never weaken, bypass or "temporarily disable" those triggers, and never add a
   path that creates real people from an import (importers only enrich
   allowlisted people).
6. No gamification, ever. No points, badges, streaks, leaderboards.

## Formation Framework (tag vocabulary — faculty owns this; keep editable in /prompts)
Spiritual Depth · Intellectual Courage · Character Under Pressure ·
Love of Neighbor · Emerging Superpowers · Sense of Calling

## Design
Deep navy #16324F dominant, Pacific blue #8FB3D9 and gold #C9A24B accents,
white surfaces, serif display headings, humanist sans body. Define brand
colors once as CSS variables (official Pacifica codes will be swapped in).
Test for every screen: "would a parent trust this with their child's story?"

## Conventions
- All Claude system prompts live in /prompts as .txt files, loaded at runtime.
- Every Claude call has a canned-fallback path so demos never break offline.
- Keep it boring: no extra services, no Docker, no cloud until asked.
- Existing pages/nav live under `app/(staff)/` with their own layout; `/apply`
  and `/applicant/[slugToken]` stay outside that group so public-facing pages
  never inherit the internal staff header/nav.
- **Migrations: seno applies every one** (SQL editor or `supabase db push`). Contributors and
  their agents write the migration file in their PR but never apply it, and never touch the
  live database. Name it `YYYYMMDDHHMMSS_what_it_does.sql` with a timestamp later than the
  newest on `main`; rebase before review. CI (`tests/migrations.test.mjs`) fails a reused
  timestamp. Code that needs a new table must degrade gracefully until it exists (return
  empty, hide the feature), because the deploy and the migration never land at the same moment.
- From 2026-10-30 Supabase no longer auto-grants Data API access to new `public`
  tables (existing tables are unaffected). Every migration that creates a table must
  include its own `grant` statements in the same file, or the table is unreachable
  via supabase-js — this applies to preview branches and local `db reset` too.

## Architecture notes (follow these — extend, don't duplicate)
- Reads vs. writes split: `lib/queries.ts` holds plain read functions called
  directly from Server Components (no API routes for reads). `lib/actions.ts`
  holds `"use server"` Server Actions — the only way data is ever written —
  called directly from Client Components. Don't add REST/API routes for
  CRUD; Server Actions cover it.
- `lib/claude.ts` wraps every Anthropic call in try/catch. On a missing key
  or any failure it returns the same return shape with `usedFallback: true`
  plus a canned-but-honest fallback value (never throws, never blocks the
  UI). Callers (`CaptureModal`, `PortraitPanel`) surface that flag as a
  plain-language "AI assist is offline" notice rather than failing silently
  — keep this contract for any new Claude call.
- Sign-off (DRAFT watermark + "Reviewed and signed by ___" + Sign button)
  applies to BOTH the family Pathway Portrait and the anonymized admissions
  story, not just the family one — principle #1 ("no unsupervised send") was
  read as covering admissions copy too, even though only the disclaimer
  label was spelled out for that button. Keep both gated the same way.
- The discipline-vs-formation check (product principle #3) surfaces as a
  dismissable inline banner in the capture review step, not a blocking
  error — the teacher can edit/reframe or save through it either way.
- Formation tags are stored as a JSON-encoded array in the `observations`
  table's `tags` TEXT column. Always validate against the fixed 6-tag enum
  in `lib/types.ts` server-side before writing; never trust client input for
  tag values. `observations.source` (added for Features 1/2) is one of
  `voice | text | admissions | canvas` — extend the union in `lib/types.ts`
  before writing a new source value, never a bare string.
- Fonts: Lora (display/serif headings) + Inter (body), both via
  `next/font/google`, exposed as `--font-display` / `--font-sans` CSS
  variables in `globals.css` alongside the brand color variables.
- SQLite connection is a singleton in `lib/db.ts` cached on `globalThis` to
  survive dev-mode hot reload; seeding (`lib/seed.ts`) runs once per table,
  each guarded by its own `SELECT COUNT(*)` check — safe to call on every boot.
  New tables get their own `seed*IfEmpty(db)` function called from `db.ts`.
- Admissions stories (Phase 4) live in Supabase's `admissions_stories` table
  (project "Formation Pathways", `cvppxixatcreyptpkymh`), not SQLite. RLS is
  enabled with zero policies — access is server-only via the service_role
  key (`lib/supabase.ts`, `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in
  `.env.local`, never committed). The client in `lib/supabase.ts` is built
  lazily on first use (not at module load) specifically so importing it
  can't crash pages/builds that don't touch admissions stories — keep that
  contract for any new Supabase-backed table. `isSupabaseConfigured()` gates
  every Supabase read/write; when it's false, degrade gracefully (return
  empty/undefined, hide the UI affordance) rather than throwing — the
  Student page must never 500 just because Supabase isn't configured in this
  environment. Portrait ids are `number | string`: a plain number is a
  SQLite `portraits.id` (family type), a string is a Supabase
  `admissions_stories.id` (uuid) — `getPortrait` in `lib/queries.ts` branches
  on `typeof id` to route to the right store.
- Applicants (Feature 1): `applicants` table holds the admissions questionnaire
  (`answers` JSON), `generated_pathways` JSON (`GeneratedPathwaysResult`), and
  a `status` lifecycle (`in_progress → submitted → approved → enrolled`).
  `draftAdmissionsPathways` in `lib/claude.ts` names a **real Pacifica faculty
  member by department only** for the mentor field — see
  `prompts/admissions-pathways.txt` and `prompts/pacifica-context.txt` for the
  hard rule: never invent a personal habit/teaching-style claim about a real,
  named person, since only their name + department is public. Converting an
  approved applicant to a student (`convertApplicantToStudentAction`) writes
  their `seedObservations` with `source: 'admissions'`.
- Courses/skills (Feature 2): `courses` / `course_students` / `course_skills` /
  `skill_snapshots` tables. `lib/integrations/canvas.ts` and `drive.ts` each
  export a `CanvasSource`/`DriveSource` interface with a `Mock*` (default) and
  `Live*` implementation, selected by `getCanvasSource()`/`getDriveSource()`
  reading `MOCK_INTEGRATIONS`/credentials — never call the Live classes
  directly. **Live-data safety**: `isLiveCanvasConfigured()` gates a
  mandatory `pseudonymizeToRoster()` call in `lib/actions.ts`'s
  `runCourseSync` — real Canvas student names must be renamed onto the app's
  local fictional roster by array position *before* the data is used in a
  Claude prompt or written to `skill_snapshots`. Keep this contract for any
  new live data source: a real name from an external system should never
  persist in this app or reach a third-party API call. The mock path also
  supports a stateful "world" per course (`lib/integrations/canvas.ts`'s
  `getOrCreateMockWorld`/`simulateCanvasActivity`) so a demo can click
  "Simulate Canvas activity" and watch the sync pipeline react live, with
  zero real data — reuse this pattern rather than making the mock stateless
  again.
  (The pseudonymize-before-use contract above governs the **demo**. The system
  of record is the one sanctioned exception. It stores real names only under
  the consent and gate rules in principle #5, sends Claude **no names at all**
  (placeholders via `lib/sor/anonymize.ts`, restored locally; no ids) and only with
  `ai_drafting` consent, never imports Canvas scores, and matches spoken names locally
  (`lib/sor/match.ts`) so the roster never reaches Claude. Keep all four properties.)
- System of record specifics: one `people` row per student for the whole
  lifecycle, linked to source ids via `external_ids`. The access log is
  append-only (no app user can update or delete it), and its `person_id` is
  deliberately not a foreign key so withdrawals stay auditable. New tables need
  RLS policies plus a consent trigger if they hold per-student data. Add a case
  to `supabase/tests/rls.test.mjs` for any new guardrail.
- Canvas client auth/pagination (`LiveCanvasSource`) is reused from a Pacifica
  student's own app — Levi Gibbons, github.com/levihgibbons1/canvasnotifications
  — credited in the `(staff)` layout's footer. Keep that credit if the
  integration code is substantially rewritten.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
