# Formation Pathways

A platform for Pacifica Christian High School. Teachers capture short voice/text
observations of student formation moments; AI synthesizes them into a
forward-looking "Pathway" per student. Governing principle: AI works for the
adults behind the scenes; students stay present, in person, with people.

## Status (keep under 40 lines and current; history goes in `docs/history.md` and git)

**Current focus: simplify (Fizzy #40, from 2026-10-20).** Fast feature work left 52 pages,
too much text and too many taps. Until seno says otherwise, work is cleanup: merge or remove
screens, cut words and taps, delete unused code. A new feature only when it replaces
something. Follow "Simplicity first" below; the card's steps are the order of work, and
seno decides keep / merge / cut for each area before it's built.

**What exists** (https://formation-pathways.vercel.app, school Vercel team; previews use staging):
- Staff: `/capture` (voice notes), `/pilot` (roster, consent, imports, switches),
  `/pilot/people/[id]` (person page, pathway drafts), Spark, class reflections, Study Hub.
- Families: `/discover` inquiry → welcome → signed pathway → share (`/welcome`, `/w`),
  referral thank-yous; Open House `/oh` + staff wall `/pilot/openhouse` (`docs/open-house.md`).
- Admissions: `/pilot/inquiries`, `/season` (counts only).
- Mastery Hub: `/mastery/<course>` (teacher), `/me/<course>` (student), Khan Chrome extension.
- Students: `/study`. STEM Scholars: `/stem`, `/scholars/[token]`.
- Fictional exec demo (`/apply`, `/admissions`, `/courses`, `/classes`, `/students`): a
  candidate to retire (#40).

**Databases** (checked 2026-10-20): production has every migration except
`20261025000000_stem_scholars.sql` (so `/stem` stays hidden there). Staging has all of them
through `20261026000000`, fingerprint-verified.

**Open House, Wed 10/21** (`docs/open-house.md`). As of 2026-10-20: `OPENHOUSE_KEY` set in
Vercel Production and its hash in production's `private.openhouse_keys` (one row, verified;
redeployed). Still blocking: **inquiries closed**, so `/oh` says "open soon" until leadership's
approval is recorded on `/pilot/inquiries`. Fee-waiver thank-you off (optional). Once open, seno
makes one test card on a phone with a made-up name: pathways showing proves the key matches
the hash; then Pull it on `/pilot/openhouse`.

**Waiting on others:** admissions (offered-place statuses and release dates for `/season`,
the real application link for `NEXT_STEP_LINKS`, phone-test answers); leadership (consent
wording, thank-you and FTC wording, Anthropic terms for students); IT (Google Drive).

**Next:** open inquiries + the phone test card → #40 inventory with seno → one small PR per area →
seno applies the STEM migration and approves its rubric → Vercel team hardening
(spend limit, 2FA, Firewall rate limits on `POST /discover`, `/oh` and `/login`).

Tracked on https://claude.ai/artifact/3L9fUkHmf4q6d378289uP6 and narrated on
https://claude.ai/artifact/GWGzrdfMSr8vfWsRycGM1T; keep both current (global `~/.claude/CLAUDE.md`).

## Standing rules from past work (details in `docs/history.md`)
- **Databases.** Production (`cvppxixatcreyptpkymh`, real pilot students): `.mcp.json`'s
  `supabase` server is read-only; agents never write to it, never query per-student tables,
  never apply migrations. Staging (`tavgqwdqlwpmcejzefso`, fictional only, what Previews use):
  seno's agent may apply migrations and load samples via the local `supabase-staging` server;
  never put a real person there or open its real-data gate. Order: staging → seno checks the
  preview → seno applies to production → merge.
- **AI on real data** goes through `lib/sor/ai-input.ts` (names → placeholders,
  `assertNoNames`); never add a call that bypasses it. Real-student AI needs
  `AI_REAL_STUDENTS=on` plus `ai_drafting` consent.
- **Never use the service-role key**; server-only writes use a scoped role or a key whose hash
  the database checks (`mastery_importer`, `OPENHOUSE_KEY`).
- **Spark** never brings back the watch-history upload, and its skills card is never a level.
- **Links**: server-built links use `requestOrigin()`; never hard-code a host.
- **Contributors** stay Vercel Viewers; they test with `npm run dev:staging`, and seno builds
  previews of their PRs with `scripts/preview-pr.sh <n>` (`docs/staging.md`).

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

## Simplicity first (seno, 2026-10-16; the current focus since 2026-10-20)
The app grew cluttered while features shipped fast. Every new or changed screen must be simple
and easy to use, and cleanup counts as real work:
- **One job per screen, one obvious primary button.** Secondary things go behind a single
  "More" or onto a separate page, never stacked above the main action.
- **Fewest taps.** Count the taps for the main task and cut them; prefill, default and remember
  instead of asking.
- **Less text.** A heading, at most one short sentence of help, and labels. No paragraphs of
  explanation on screen; put details in docs.
- **Phone first.** Test at phone width; big tap targets.
- **Intuitive over complete.** If a feature needs instructions to use, simplify it before adding it.
  When in doubt, leave it out.
Review each PR against this list and say how it was met.
- **Remove before adding.** Prefer deleting, merging or hiding a screen to adding one. Each PR says
  how many screens, taps and words it removed. A feature behind a switch nobody turns on is a
  candidate to delete.
- **Keep docs short too.** This file's Status stays under 40 lines; finished work is recorded in
  the PR and `docs/history.md`, not here.

## Product principles — enforce in UI copy and logic, every session
1. Humans author, AI drafts. Every AI output is labeled "Draft" until a named
   adult reviews and signs it. There is no unsupervised send.
   One approved exception: Open House cards (`docs/open-house.md`), catalog-only
   and labeled "Drafted with AI" until staff sign.
2. Compass, never dossier. No numeric scores on students anywhere. Counts and
   narratives only. No red/failure states on a student profile. The word
   "record" never appears in the UI — say "Pathway."
   One deliberate exception (seno, 2026-10-12): the Mastery Hub's `mastery_evidence`
   keeps raw scores for the teacher and that student only. They never appear on a Pathway,
   a family page, the person page (words and counts only there) or in any AI call.
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
