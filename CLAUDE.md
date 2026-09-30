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
  tested in the browser on sample data only; the leadership gate is still LOCKED. Deployed
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
  Swagger page. **2026-09-29: the admissions officer approved live Finalsite data**; not yet
  recorded on `/season` (admin records name/title + where the approval lives), and no
  credentials yet. Once live rows exist `/season` shows them instead of sample figures,
  so decide live vs. sample for the Oct 5 demo before importing. Merged via PR #8; migration `20260929022903_admissions_funnel.sql` **applied
  to live Supabase 2026-09-28** (advisors: nothing new; funnel approval off; table empty until
  an admin clicks *Load sample figures* on `/season`). See `docs/admissions-season.md`.
- **Blocked 2026-09-21**: live Google Drive setup — seno has no access to the Google
  Cloud/OAuth 2.0 developer console needed to generate a Drive token, waiting on Pacifica
  IT. Don't push on this until he says it's unblocked. Everything else (mock Canvas/Drive,
  the whole app) works with zero live credentials in the meantime.
- **Live deployment (2026-09-28)**: https://formation-pathways.vercel.app, Vercel project
  `formation-pathways` on seno's personal **Hobby** team (`seno-2280s-projects`; move to a
  school Pro/Education team before real use). The GitHub repo is connected: merges to `main`
  auto-deploy to production, PRs get previews behind Vercel login. Env is
  `NEXT_PUBLIC_SUPABASE_URL` + the publishable key only (Production + Preview): no Anthropic key
  (every AI step runs its offline fallback), no service role, no Finalsite or Canvas credentials.
  Supabase Auth Site URL and `/auth/callback` redirect are set to the production URL; code and
  link sign-in both verified in the auth logs. On Vercel the fictional demo's SQLite lives in
  per-instance `/tmp`: seed data always returns, but shares/approvals/captures made in the demo
  can vanish or 404 (details in `docs/oct-5-demo.md`). Server-built links use
  `requestOrigin()` (`lib/origin.ts`); never hard-code a host.
- **Agent database access (2026-09-28)**: the account-level claude.ai Supabase connector (owner
  access, bypasses RLS and consent triggers) was disabled. The repo's `.mcp.json` Supabase
  server is `read_only=true` (PR #11), authenticated 2026-09-28 and verified
  (`transaction_read_only = on`). Agents: never write to the
  live database, never query per-student tables once real students exist, and apply new
  migrations only via the SQL editor or `supabase db push` run by seno.
- **Decided, not built**: Anthropic auth on Vercel should be Workload Identity Federation
  (Vercel OIDC token → federation rule; SDK 0.125 has `oidcFederationProvider` +
  `TokenCache`), set up in the school's Anthropic org, not seno's personal one. Until then,
  no key, or a throwaway spend-capped key for the demo only.
- **Next concrete actions, in order**:
  1. Custom SMTP (required: built-in Supabase email only reaches Supabase team members, so no
     other staff can sign in without it; Gmail SMTP + app password, see
     `docs/system-of-record.md` Setup step 2), then add `{{ .Token }}` to *Magic Link* and
     *Confirm signup*.
  2. Sign in on the live site (laptop + phone), `/season` → *Load sample figures*, run the
     `docs/oct-5-demo.md` checklist on the live URL, rehearse. Check `/admissions/inquiries`
     drafts now read `https://formation-pathways.vercel.app/from/…` (PR #10, not yet eyeballed).
     Admissions officer self-test: `docs/admissions-tester-guide.md` (approve her as
     *Admissions* on `/pilot` after her first sign-in).
  3. Live Finalsite counts (`docs/admissions-season.md`, "Switching on"): record the
     approval on `/season`; get External API credentials (Finalsite System Admin with Data
     permissions; Finalsite may need to enable the feature); send the Swagger page's contact
     endpoint + field names so `FINALSITE_FUNNEL_FIELDS` can be fixed; env in Vercel;
     *Check connection*; import.
  4. **Oct 5 board demo.**
  5. After the demo: the real-student beta for a few of seno's own students (parents have
     approved). Steps and what's still required: `docs/system-of-record.md`, "Starting the
     real-student beta". Don't open the gate before the demo: real names would show on the
     `/pilot` roster on stage.
  6. Later: Google One Tap (waiting on IT), alumni consent-reset design (sketched on the Systems Map).
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
  the consent and gate rules in principle #5, sends Claude the first name only (no
  ids, no timeliness data) and only with `ai_drafting` consent, never imports
  Canvas scores, and matches spoken names locally (`lib/sor/match.ts`) so the
  roster never reaches Claude. Keep all four properties.)
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
