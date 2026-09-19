# Formation Pathways

A platform for Pacifica Christian High School. Teachers capture short voice/text
observations of student formation moments; AI synthesizes them into a
forward-looking "Pathway" per student. Governing principle: AI works for the
adults behind the scenes; students stay present, in person, with people.

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
  (model: claude-sonnet-4-6). Single repo, runs with `npm run dev`. No auth yet.
- Supabase (Postgres) holds one slice so far: the admissions-story pathway
  (see Architecture notes below). Everything else stays on SQLite until a
  later phase.
- Voice capture: browser Web Speech API for live dictation (Chrome), with a
  plain textarea fallback. (Production will use a dedicated speech-to-text
  service; do not block on audio quality now.)

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
5. FICTIONAL DATA ONLY until consent and privacy review are complete. Seed
   students are invented. Never suggest entering real student names.
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

## Architecture notes (established building the Day-1 slice — follow these)
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
  tag values.
- Fonts: Lora (display/serif headings) + Inter (body), both via
  `next/font/google`, exposed as `--font-display` / `--font-sans` CSS
  variables in `globals.css` alongside the brand color variables.
- SQLite connection is a singleton in `lib/db.ts` cached on `globalThis` to
  survive dev-mode hot reload; seeding (`lib/seed.ts`) runs once, guarded by
  `SELECT COUNT(*) FROM students` — safe to call on every boot.
- Admissions stories (Phase 4) live in Supabase's `admissions_stories` table
  (project "Formation Pathways", `cvppxixatcreyptpkymh`), not SQLite. RLS is
  enabled with zero policies — access is server-only via the service_role
  key (`lib/supabase.ts`, `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in
  `.env.local`, never committed). The client in `lib/supabase.ts` is built
  lazily on first use (not at module load) specifically so importing it
  can't crash pages/builds that don't touch admissions stories — keep that
  contract for any new Supabase-backed table. Portrait ids are `number |
  string`: a plain number is a SQLite `portraits.id` (family type), a
  string is a Supabase `admissions_stories.id` (uuid) — `getPortrait` in
  `lib/queries.ts` branches on `typeof id` to route to the right store.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
