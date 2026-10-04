# System of record — consented pilot

The new Formation Pathways database for a student's whole time with Pacifica:
one `people` row from applicant to alumni, filled in from **Finalsite**
(admissions), **Blackbaud** (enrollment) and **Canvas** (coursework), plus
what staff see and say. Supabase Postgres, schema in
`supabase/migrations/20260924025527_system_of_record.sql`.

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

`npm run test:db` runs 34 tests of these rules against the real migration
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

5. **Restrict AI tooling access.** Done 2026-09-28 for the repo's Supabase MCP
   server: `.mcp.json` sets `&read_only=true`, so an agent can read but never
   write, and can't bypass RLS or the consent triggers with a write. It still
   reads as a privileged database user, so it *can* see real student rows:
   agents must not query per-student tables once real students exist. Also
   disconnect any account-level Supabase connector (claude.ai "Supabase" in
   `/mcp`), which has full owner access and isn't governed by this file.
   New migrations then go through the SQL editor or `supabase db push`, not
   the agent.

Then an admin records the sign-off on `/pilot`. That flip is logged too.

## Signed pathways with students

1. On a student's page, **Draft** (needs `ai_drafting` consent, and for a real
   student `AI_REAL_STUDENTS=on`; see below). Read it, then **Edit the pathways
   before signing** to change any word. The portrait stays staff-only.
2. **Sign** it. Signed drafts are locked; draft again to change one.
3. **Open it with [name]** → `/pathway/[personId]`. This is a full-screen,
   family-facing view of the three signed pathways, with no staff menus,
   opened by staff and explored **in person** with the student or family.
   Sign-in is required, and there is no student or family login. Admin and
   admissions can open it, following the RLS on `pathway_drafts`. Teacher
   access would be a policy change.
4. The student taps **This one excites me** (with an optional sentence in
   their own words). It's saved as an observation by the signed-in adult,
   tagged *Sense of Calling* and consent-checked by the database, so it
   feeds the next draft.

### Spark: what lights them up

Applications show the formal version of a student. On their page, **Start a
Spark conversation ✦** opens `/pathway/[personId]/spark` on the adult's own
signed-in device, a full-screen night sky that fills with stars:

- **Questions**, answered by voice or typing, each one becoming a star. They
  live in `prompts/student-spark-questions.txt`, which faculty can edit.
- **Interests** that float on screen: tap once if you love it, twice if
  you're obsessed (from `prompts/spark-interests.txt`, plus their own).
- **This or that** (`prompts/spark-choices.txt`).
- **Optional: their YouTube history.** The student drops in Google Takeout's
  `watch-history.json`. It is read **in the browser only, never uploaded**;
  they tap the channels that are really them, and only those names are saved.
- **The reveal:** the stars join into their constellation.

There are no scores, points or badges. Saving needs the new **`student_voice`**
consent scope (database trigger) and is done as the signed-in adult
(`student_sparks`, migration `20261004090000_student_sparks.sql`). Admin,
admissions and teachers can read sparks. The next draft treats sparks as the
strongest signal: every pathway grows from at least one, and milestones can
show "grew from your spark: …" on the journey. Sending sparks to Claude
follows the same AI rules as everything else (`ai_drafting` +
`AI_REAL_STUDENTS`).

**At home: Send a link home ✉.** On the student's page, staff can make a
one-time link (`/spark/family/[token]`) for the family to do Spark together
on their own device, with no sign-in. It is the system of record's only
anonymous write path, and it's deliberately narrow:

- Only the token's SHA-256 hash is stored, so the URL is shown once.
- It expires after 7 days and works once.
- It's write-only: the page learns the student's first name and nothing else.
- Consent is checked when the link is made and again when it's used.
- Sparks arrive as `source = family_link`, attributed to the adult who sent
  the link, and the submission is logged.

The browser calls two invoker functions that wrap SECURITY DEFINER functions
in the private schema (migration `20261004150000_spark_family_links.sql`;
19 RLS cases, including calls made as `anon`).

**AI for real students is a separate switch.** `ANTHROPIC_API_KEY` alone runs
AI for the fictional demo and the six sample students only. A real student's
details reach Claude only when the family consented (`ai_drafting`) **and**
`AI_REAL_STUDENTS=on`. Turn that on only after confirming that Pacifica's
Anthropic terms cover student data (no training on inputs, FERPA-aligned).
Until then, capture saves real students' notes as spoken, and drafting says
why it can't.

## Starting the real-student beta

For a few of seno's own students whose parents have approved. Parent approval
covers consent; the other rows above still apply. Status as of 2026-09-28:

| Requirement | Status |
|---|---|
| Consent per student, per scope | Parents approved. Record only the scopes the signed form actually covers; if it doesn't mention AI, leave `ai_drafting` off (capture and imports still work, Draft refuses). |
| Leadership sign-off on `/pilot` | Not yet. Must name a real approver (e.g. head of school) and where the approval lives. |
| AI vendor terms | Not yet. Skippable: no `ai_drafting` consent and no Anthropic key means nothing goes to Claude. |
| Voice capture privacy | Phone dictation sends audio to Apple/Google. Type, or have consent/leadership cover it. |
| Hosting | Personal Vercel Hobby team, no inactivity sign-out, no security review. Leadership should accept this knowingly. |
| Agent database access | Owner connector disabled; repo MCP server is read-only (see step 5 above). |

Do it **after the Oct 5 demo**: real names would appear on the `/pilot`
roster on stage. Then, by seno (real student details, so not an agent):

1. `/pilot` → *Save sign-off*.
2. Add each student: name, stage *Enrolled*, Finalsite Person ID, Canvas user id.
3. On each student's page, record consent: guardian, date signed, where the form is kept.
4. **Finalsite**: build a report with the `FINALSITE_COLUMNS` headers (`Person ID`,
   `Entry Year`, `Entering Grade`, `Status`, `Current School`, `Interests`, `Activities`,
   plus `Q: …` columns), export CSV, upload on `/pilot` → Import. Rows not on the pilot
   are dropped; the file isn't stored. (The Finalsite *API* client only does season
   counts, not per-student records.)
5. **Canvas**: add `CANVAS_BASE_URL`, `CANVAS_API_TOKEN` (seno's own teacher token) and
   `CANVAS_PILOT_COURSE_IDS` in Vercel env (Production), redeploy, run the Canvas import.
   Scores are never imported.
6. Capture on `/capture`; only consented students appear.

## Setup

1. **Apply the migrations** in `supabase/migrations/`, in order (`supabase db push`,
   or paste each into the SQL editor). Done for `cvppxixatcreyptpkymh` on
   2026-09-23 (admissions season counts: 2026-09-28); file names match the
   versions recorded there. The RLS helper
   functions live in the `private` schema so the API never exposes them;
   add new ones there too, then re-run Supabase's security and performance advisors.
2. **Auth.** In Supabase → Authentication → URL configuration, set the
   Site URL and add `http://localhost:3000/auth/callback` plus the deployed
   `https://…/auth/callback` to redirect URLs. Sign-in is a **6-digit code**
   emailed to a school address (the email also carries a link, for laptops).
   Codes matter on phones: a link often opens in another browser or inside the
   mail app, and an iPhone home-screen app never shares Safari's cookies. In
   Authentication → Emails, put `{{ .Token }}` in **both** the *Magic Link* and
   *Confirm signup* templates (first-time staff get the second one). **Custom
   SMTP is required before anyone but seno signs in**: Supabase's built-in email
   only delivers to members of the Supabase organization's team (and a few an
   hour), and editing templates needs custom SMTP too. The school is on Google
   Workspace, so the simplest route is Gmail SMTP from a school account:
   host `smtp.gmail.com`, port `587`, username the full address, password a
   Google **app password** (needs 2-Step Verification, and IT may have to allow
   app passwords), sender the same address. A dedicated account such as a
   `pathways@` mailbox is better than a personal one. The domain has no SPF
   record, which is fine for Gmail SMTP (Google signs its own mail) but would
   push a third-party sender like Resend into spam until IT adds DNS records.
   Then raise Authentication → Rate limits → emails per hour from its low
   default. Google sign-in replaces all of
   this once IT creates the OAuth client (see "Google sign-in" below).
3. **Env.** Copy `NEXT_PUBLIC_SUPABASE_URL` and the publishable key
   (`sb_publishable_…`, Project settings → API keys) into `.env.local` as
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. **First admin.** Sign in once at `/login` (you'll be *pending*), then in
   the SQL editor:
   ```sql
   update staff set role = 'admin', active = true
   where email = 'seno@pacificachristian.org';
   ```
5. **Everyone else signs themselves up.** Any confirmed sign-in from an
   `@pacificachristian.org` address creates a **pending** Staff account (a
   database trigger; subdomains like `@students.…` never match). Pending
   accounts see nothing. Admins approve them, set roles, or remove access in
   the Staff section of `/pilot`. Once you've confirmed students don't hold
   `@pacificachristian.org` addresses, tick *Approve new sign-ins
   automatically* there and new staff start as Staff (capture only) straight
   away. Nobody can change their own access.
6. **Try it on fiction.** Go to `/pilot`, click *Load fictional sample pilot*,
   then run all three imports (sample mode), open a student, click *Draft*,
   and capture on `/capture`.

## Staff phones

- **Install:** open the capture URL in Safari or Chrome, sign in once, then
  *Share → Add to Home Screen* (iPhone) or *Install app* (Android). The
  **Capture** icon opens `/capture` full screen and stays signed in.
- **Capture:** tap the mic, talk ("Iris stayed after chapel to…"), tap
  **Done**, tap **Save**. The name step is skipped when one pilot name
  clearly matches; *Wrong student* is always there.
- **Voice:** reliable in Chrome on Android; less so in Safari. The
  keyboard's own dictation mic, typing into the text box, works on every phone.
  Safari asks for the mic each visit unless Settings → Safari → Microphone is
  set to *Allow*.
- **Privacy:** browser speech recognition sends the audio to Google (Chrome)
  or Apple (Safari) to transcribe. Fine for fictional data; for real students
  it's on the leadership list alongside the Anthropic terms.

## Deploying (Vercel)

- Live at https://formation-pathways.vercel.app (Vercel project
  `formation-pathways`, GitHub connected). `main` deploys to production; every
  PR gets a preview.
- Env: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  (publishable key). Optional: `ANTHROPIC_API_KEY` (fictional data only until
  vendor terms). **Never** set `SUPABASE_SERVICE_ROLE_KEY` there.
- Then add `https://<domain>/auth/callback` to Supabase redirect URLs and
  make the Site URL the production domain.
- In production **every** page needs a signed-in `@pacificachristian.org`
  account (`proxy.ts`), including the fictional exec demo, which has no auth
  of its own and makes paid Claude calls. The demo stays open in `npm run dev`.
- The demo's SQLite lives in `/tmp` on Vercel, so `lib/demo-persist.ts` keeps it
  in step across instances. Each demo write saves the serialized database to
  `demo_snapshots`, a single row that active staff can read and write as
  themselves (RLS) and that holds fictional data only. Each demo page loads a
  newer copy if there is one. `DEMO_PERSIST=off` disables it, and `=on` enables
  it locally. The system of record is unaffected.
- `next.config.ts` ships `prompts/` and `fixtures/sample/` with every route,
  because they're read with `fs` at runtime.

## Google sign-in (when IT creates the OAuth client)

Staff already signed in to their school Google account tap **Continue with
Google** and they're in. There's no email code, and it doesn't depend on SMTP.
The button is built and hidden until `GOOGLE_SIGNIN=on`.

**What IT creates** (Google Cloud console, in the school's Workspace org):

1. A project (e.g. "Formation Pathways"). No APIs need enabling.
2. **OAuth consent screen**: User type **Internal** (school accounts only, no
   Google verification), app name "Formation Pathways", support and developer
   contact email, authorized domains `vercel.app` and `supabase.co`. Scopes:
   `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile` only. No
   Drive, Gmail or Calendar.
3. **Credentials → Create OAuth client ID → Web application**:
   - Authorized JavaScript origins: `https://formation-pathways.vercel.app`
   - Authorized redirect URIs:
     `https://cvppxixatcreyptpkymh.supabase.co/auth/v1/callback`
4. Send seno the **Client ID** and **Client secret** through a secure channel
   (not plain email).
5. Optional: Admin console → Security → API controls → App access control →
   mark the client **Trusted**, so staff never see a consent prompt.

**Then seno:**

1. Supabase → Authentication → Providers → **Google**: enable it and paste the
   client ID and secret.
2. Vercel env (Production): `GOOGLE_SIGNIN=on`, then redeploy.
3. Sign in once with Google. The staff trigger already handles Google sign-ins:
   they arrive confirmed, with the person's full name, and start as *pending*
   until approved on `/pilot`, unless auto-approve is on.

## Going live per source

| Source | How | Notes |
|---|---|---|
| Finalsite | **API** (the same `FINALSITE_API_*` credentials as the season counts), or upload a report export CSV on `/pilot` | **API:** *Import from Finalsite* reads the current and next school years' contacts and keeps only consented pilot students. They're matched by the Finalsite contact id on their page, or by their Blackbaud id when `FINALSITE_SIS_ID_FIELD` names the Finalsite id field that holds it (see "id fields" in *Check connection* on `/season`); a match by Blackbaud id saves the Finalsite id for next time. An explicit field allowlist (`STUDENT_RESPONSE_FIELDS`, `STUDENT_INTEREST_FIELDS` in `lib/sor/importers/finalsite-api.ts`) covers the student's essay and questionnaire answers, interests, previous school, entry year, grade and status. Never imported: parent questionnaire, family circumstances, income, aid, race, religion, GPA, contact details. **CSV:** | Columns in `FINALSITE_COLUMNS` (`lib/sor/importers/finalsite.ts`); `Person ID` is required; any `Q: …` column is an application answer. Build the report to match, or edit the map. |
| Blackbaud | `BLACKBAUD_SUBSCRIPTION_KEY` + `BLACKBAUD_CLIENT_ID` + `BLACKBAUD_CLIENT_SECRET`, then **Connect Blackbaud** on `/pilot` | Subscription key from developer.blackbaud.com; client id/secret are the SKY app's Application ID and secret. Register `https://formation-pathways.vercel.app/auth/blackbaud/callback` as the app's redirect URI, and have a Blackbaud environment admin connect the app to the school. Connecting gives a 60-minute token kept only in that admin's browser (httpOnly cookie, never stored or logged). **Check connection** there takes your own staff user id and lists field names only, so the map can be verified before any student is pulled. The mapping in `mapBlackbaudUser` is a best guess until then. The import reads the **extended** user record (grade and class year) and each student's **class history** for the last four school years (`/academics/enrollments/{id}`: course title, code and offering type only, never grades). Class history needs the *Academic Group Manager* or *Schedule Manager* role, and lands in `course_history` (migration `20261003170000_course_history.sql`). |
| Canvas | `CANVAS_BASE_URL` + `CANVAS_API_TOKEN` + `CANVAS_PILOT_COURSE_IDS` | A personal teacher token sees only that teacher's courses, which is the right scope for a pilot. |

Each source stays on `fixtures/sample/*` until it's configured **and** the
gate is open.

## Known gaps

- No consent-form upload (evidence is a text pointer to where the paper form
  lives).
- Google sign-in isn't wired yet (waiting on the IT OAuth client).
- No session inactivity timeout: a lost, unlocked phone stays signed in.
  Supabase's time-boxed / inactivity sessions (paid plan) are the fix.
- The Blackbaud field mapping is unverified against a real SKY response.
- The Finalsite API isn't wired for per-student pilot imports; CSV export is the
  proof-of-concept path. (Whole-school admissions **counts** use the API: see
  `docs/admissions-season.md`.)
- Observation edit/delete UI, alumni stage transitions, and data-retention
  jobs are not built.
- Drive content scanning (see CLAUDE.md) still applies if Drive joins this
  pipeline.
