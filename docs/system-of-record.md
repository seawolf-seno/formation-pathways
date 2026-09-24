# System of record — consented pilot

The new Formation Pathways database for a student's whole time with Pacifica:
one `people` row from applicant to alumni, filled in from **Finalsite**
(admissions), **Blackbaud** (enrollment) and **Canvas** (coursework), plus
what staff see and say. Supabase Postgres, schema in
`supabase/migrations/20260923000000_system_of_record.sql`.

It powers three tools:

| Route | Who | What |
|---|---|---|
| `/pilot` | admin, admissions | Leadership gate, pilot roster, consent, imports |
| `/pilot/people/[id]` | admin, admissions (teachers see less) | **Who they are today**: where they've been (Finalsite), where they are now (Blackbaud/Canvas), what staff have seen. Drafts a portrait plus **three Ruakh 2.0 pathways** that need sign-off |
| `/capture` | any staff member | **Phone capture**: say the name and what you saw, confirm the match, saved |

The fictional exec demo (`/`, `/admissions`, `/courses`, …) is untouched and
still runs on local SQLite.

## Guardrails (enforced by Postgres, not just the app)

- **Leadership gate.** Until an admin records who approved the pilot and
  where (`pilot_settings`), the database refuses to create any real person.
  Only `is_sample` fictional records can exist.
- **Allowlist, not discovery.** Importers only enrich people an admin already
  added to the pilot, matched by their Finalsite, Blackbaud or Canvas id.
  They never list the school. Blackbaud is fetched one id at a time, Canvas
  with `user_ids[]`/`student_ids[]`, and Finalsite CSV rows not on the list
  are dropped on parse. The uploaded file is never stored.
- **Consent per scope**, recorded with guardian name, date and where the signed
  form lives. There are three scopes: `import_records`, `staff_observations`
  and `ai_drafting`. A trigger re-checks consent on every write, so an app bug
  can't bypass it. Revoking a scope blocks new writes and AI use. **Withdraw**
  deletes the person and everything about them.
- **Data minimization.** Canvas scores are never imported. Claude receives the
  first name only, no ids, and nothing about late or missing work. The capture
  name matching runs on our server, so the roster is never sent to Claude.
- **Roles via RLS.** Applicant essays are visible only to admin and
  admissions. Teachers can't draft pathways. Staff can only write
  observations as themselves.
- **Append-only access log.** Every view, capture, draft, approval, import
  and consent change is logged. No app user can edit or delete the log.
- **AI drafts, people decide.** Pathway drafts are watermarked DRAFT until a
  named staff member signs them, and none of this reaches a family.

`npm run test:db` runs 29 tests of these rules against the real migration
(PGlite). CI runs it on every PR.

## Before any real student goes in

These are for school leadership, not code:

1. **Approve the pilot**: who's in it (suggest 5–10), which staff roles see
   what, how long data is kept, and who can withdraw a student.
2. **Consent form** for families covering the three scopes above, in plain
   language, including that Claude (Anthropic) drafts staff-only summaries.
3. **AI vendor terms.** Confirm Pacifica's Anthropic agreement covers
   student data (FERPA-aligned terms, no training on inputs) *before* setting
   `ANTHROPIC_API_KEY` for real records. The Claude for Education/Enterprise
   application in the roadmap is the natural route.
4. **Hosted security review** of the deployed app. Phone capture needs HTTPS,
   so this runs on a public URL, even though every page requires sign-in.

5. **Restrict AI tooling access.** The Supabase MCP server (used for
   development via Claude Code) connects as the database owner, which skips
   RLS and the consent triggers. Before the first real student goes in, either
   switch it to read-only (`&read_only=true` on the MCP URL in `.mcp.json`) or
   point it at a separate dev project that holds only sample data.

Then an admin records the sign-off on `/pilot`. That flip is logged too.

## Setup

1. **Apply the migration.** Paste the migration file into the Supabase SQL
   editor for project `cvppxixatcreyptpkymh`, or run `supabase db push`.
2. **Auth.** In Supabase → Authentication → URL configuration, set the
   Site URL and add `http://localhost:3000/auth/callback` plus the deployed
   `https://…/auth/callback` to redirect URLs. Sign-in uses an emailed link
   (no Google OAuth needed, which is still blocked on IT). Supabase's built-in
   email is rate-limited to a few messages an hour; set up custom SMTP before
   more than a couple of staff use it.
3. **Env.** Copy `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (Project settings → API) into `.env.local`.
4. **First admin.** Sign in once at `/login`, then in the SQL editor:
   ```sql
   insert into staff (user_id, email, display_name, role)
   select id, email, 'Seno', 'admin' from auth.users
   where email = 'seno@pacificachristian.org';
   ```
   Add other staff the same way with role `admissions`, `teacher` or `staff`.
   There's no staff-management UI yet.
5. **Try it on fiction.** Go to `/pilot`, click *Load fictional sample pilot*,
   then run all three imports (sample mode), open a student, click *Draft*,
   and capture on `/capture`.

## Going live per source

| Source | How | Notes |
|---|---|---|
| Finalsite | Upload a report export CSV on `/pilot` | Columns in `FINALSITE_COLUMNS` (`lib/sor/importers/finalsite.ts`); `Person ID` is required; any `Q: …` column is an application answer. Build the report to match, or edit the map. |
| Blackbaud | `BLACKBAUD_SUBSCRIPTION_KEY` + `BLACKBAUD_ACCESS_TOKEN` | SKY API subscription key from developer.blackbaud.com; token from the SKY OAuth flow (expires in 60 min). The field mapping in `mapBlackbaudUser` is a best guess, so the first live run reports any missing fields by **key name only**. Verify it and adjust. |
| Canvas | `CANVAS_BASE_URL` + `CANVAS_API_TOKEN` + `CANVAS_PILOT_COURSE_IDS` | A personal teacher token sees only that teacher's courses, which is the right scope for a pilot. |

Each source stays on `fixtures/sample/*` until it's configured **and** the
gate is open.

## Known gaps

- No staff-management UI (SQL only) and no consent-form upload (evidence is
  a text pointer to where the paper form lives).
- The Blackbaud field mapping is unverified against a real SKY response.
- The Finalsite API isn't wired; CSV export is the proof-of-concept path.
- Observation edit/delete UI, alumni stage transitions, and data-retention
  jobs are not built.
- Drive content scanning (see CLAUDE.md) still applies if Drive joins this
  pipeline.
