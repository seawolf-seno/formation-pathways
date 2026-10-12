# Mastery Hub (Fizzy #37)

Standards-based grading for one teacher's course. Evidence comes from Canvas, from
AP Classroom and Khan Academy reports, from oral exams, and from work students send in.
Students sign in and see where they are on each standard, every piece of evidence
behind it, and what to do next.

The first course is **AP Physics 1** (`fixtures/mastery/ap-physics-1.json`).

It shows small, specific paths toward mastery feeding the larger Formation Pathway:
a student's pilot page shows their mastery courses in words ("proficient or beyond on
9 of 46 standards; going further on rolling, torque"). The scores stay in the hub.

## Who sees what

Every course has an **address**: `/mastery/APPhysics1` for the teacher and `/me/APPhysics1` for
its students. A new class is just a new address (`APPhysics1-P3`, `Chemistry`, `Algebra2`), and
the standards file it uses sets the default. Addresses are letters, numbers and dashes, and
they're unique in any capitalization: `/mastery/apphysics1` redirects to `/mastery/APPhysics1`.
The teacher can rename one under **Course settings**.

| Route | Who | What |
|---|---|---|
| `/mastery` | teachers, admins | Every mastery course they teach, in any subject; start a course; load a fictional sample class |
| `/mastery/APPhysics1` | that course's teacher (or an admin) | Requests waiting, the class map (unit or topic view, and a **source switch**: all / Canvas / Khan Academy / AP Classroom / oral exams), course settings (address, Canvas id, **finished through Unit N**), the video shelf, sources with pause switches, roster and student sign-ins |
| `/mastery/APPhysics1/oral` | same | Phone-sized oral exam / observation updater: student → standard → tap a level → optional spoken note |
| `/mastery/APPhysics1/students/[id]` | same | The student's own page, plus removing evidence and adding evidence by hand |
| `/mastery/APPhysics1/log` | same | Every import and every change, newest first |
| `/me`, `/me/APPhysics1` | a signed-in **student** | Their own levels, evidence (scores included), next steps with links and videos, the video shelf, and "ask for an oral exam" / "send in my work" |

## Finished units and videos

**Course settings → "The class has finished through Unit N."** Finished units are what every
student should have by now:

- **Next steps** start there. First come standards in finished units that are started but not
  yet Proficient, then ones with no evidence at all. After that come the rest, as before.
  Each one is marked "Covered in class already".
- **The video shelf** (on the student's page and the teacher's course page) opens with the
  finished units, then "Coming up" (the next unit), then the rest, folded away.

**Videos** live in the standards file, on a unit (`groups[].videos`) or on one standard
(`standards[].videos`), as `{ "id": "<YouTube id or address>", "title", "channel", "topics" }`.
A standard's own videos come first in its next step, followed by its unit's. Cards show
YouTube's own thumbnail and open on youtube.com. Nothing is embedded, and the CSP allows only
`i.ytimg.com` for the images.

The AP Physics 1 shelf (2026-10-12) has 59 videos from widely used channels: Flipping Physics
(a full review for every unit of the 2024 course, plus topic videos), CrashCourse Physics, Khan
Academy, Professor Dave Explains and The Organic Chemistry Tutor. Each unit has a review and
topic videos, and every Unit 1 and 2 topic (vectors, motion graphs, relative and projectile
motion, center of mass, free-body diagrams, each of Newton's three laws, gravitation,
friction, springs, circular motion) has its own. Every id was checked against YouTube's
official oEmbed endpoint, and titles and channels are copied from it.

**They're not ranked by view count**, because that needs a YouTube Data API key. The two
"worked FRQ" videos under Science practices use the pre-2025 exam format. Swap any of them
freely.

## Decisions (seno, 2026-10-12)

- **Levels and raw scores.** This is the one place Formation Pathways holds scores.
  They live only in `mastery_evidence`: they never reach a Pathway page, a family, or an
  AI call. Pathways still show no numbers. Levels are words (Beginning, Developing,
  Proficient, Extending). There's no red and no "failing" state.
- **Real student sign-in.** Students use the same sign-in page (an emailed code, or
  Google once it's on) with their school address. A teacher or admin gives each student
  a sign-in on the course page. The address must be registered first; a registered
  address never becomes a staff account.
- **No scraping.** AP Classroom and Khan Academy have no teacher API we can use, so the
  hub reads the **CSV report the teacher downloads** (the "export drop-in"). There are no
  stored passwords, no headless browsers and no terms-of-service risk. It takes about a
  minute a week, and the teacher sees a preview before anything is saved.
- **AP Physics 1 first.** Another subject is one more standards file (below).

## Guardrails (Postgres, `20261019000000_mastery_hub.sql`)

- New consent scope **`mastery_records`** (label "Mastery Hub" on the pilot page). It's
  needed for a real student to be on a roster, to have evidence, to get a sign-in, or to
  send a request. Sample people are consented to everything, as everywhere else.
- Evidence only for students on that course's roster. A sample course holds only sample
  students, and a course can't switch between sample and real.
- A course is read and changed only by its teacher or an admin. Other teachers and
  admissions see nothing.
- A student sees only the courses they're on and their own evidence and requests, plus
  their own name. They can't see staff, observations, sparks, drafts or the log. They
  can't write evidence, and their requests are stamped as theirs.
- Evidence is never edited. A wrong piece is removed (logged), and a retake is new
  evidence. A request's words can't be changed by the teacher, only its status and reply.
- `mastery_log` is filled by triggers (evidence, roster, requests, sources, sign-ins)
  plus import summaries. Nobody can update or delete it.
- 51 cases in `supabase/tests/rls.test.mjs` (search "Mastery Hub").

## How a level is worked out (`lib/mastery/rules.ts`, no AI)

1. Each piece of evidence points to a level: its own level if it has one (an oral exam,
   a Khan mastery word), otherwise its score against the thresholds in the standards
   file (default: 90% Extending, 75% Proficient, 50% Developing).
2. If the **newest** piece is the teacher's own judgment (oral exam or observation), it
   stands.
3. Otherwise the newest 4 pieces are averaged on the level ladder. Each is weighted by
   source (oral 3; AP Classroom, Canvas and observation 2; everything else 1) and by
   recency (each older piece counts 0.6 as much).
4. A unit's level is the lower middle of its started standards.

**Next steps** are the standards already started but not yet Proficient, then the
not-yet-started standards in a unit the student is already in (later units wait). Each
has its study links. When the newest score already reaches Proficient, the student is
nudged to ask for an oral exam to confirm it.

All the numbers are in the standards file, so a teacher can change them without code.

## Sources

### Canvas (automatic)

- Uses the existing `CANVAS_BASE_URL` + `CANVAS_API_TOKEN` (the same narrow token as the
  pilot import, card #24). Each course stores its **Canvas course id**.
- Students are matched by their Canvas user id (`external_ids`, system `canvas`), which an
  admin sets on the pilot page. The import asks Canvas only about those ids.
- What counts: graded work whose **title names a standard** (`Unit 2 quiz [2.5, 2.7]`, or
  `Unit 4 Progress Check`, which counts on each topic in that unit), and Canvas **Outcome
  results** whose outcome title starts with a code. Anything else is skipped and counted
  in the summary, never guessed.
- **When it runs:** every three hours, automatically, once the scheduled import is switched on
  (below). It also runs when the teacher opens the course page (if the last check is over six
  hours old) and on **Check Canvas now**. A sample course adds one fictional quiz instead.
- What counts, in order: a standard code in the title (`[2.5]`), a unit (`Unit 2 Test` counts for
  each topic in the unit), or the standard's **name or alias** (`Newton's second law` → 2.5).
  Each standard in the standards file has `aliases` for Khan skill names and common headings.
  When one name sits inside a longer one, only the longer counts: "Rotational form of Newton's
  second law" is 5.6, not 2.5. A title that names more than three standards is too general and
  counts for none.

### Automatic imports (nobody signed in)

A Vercel Cron job calls `/api/cron/mastery` every three hours in production (`vercel.json`). It
connects as **`mastery_importer`** (`20261020000000_mastery_importer.sql`), a Postgres role made
for this one job. It is **not** the service-role key and not a staff account.

What the role can do:
- read real courses that have a Canvas course id, their rosters, and those students' Canvas ids;
- read which import keys a course already has;
- add Canvas and Khan evidence;
- record each run.

What it can't do: read a name, a score, a level, an observation or a draft; set a level; touch a
sample course; or change or delete anything. RLS, the consent trigger and the roster check apply
to every row it adds. Rows it adds have no person recorded and show as automatic, and the log
says "Canvas checked automatically" by "System". Guarded by the "automatic imports" cases in
`supabase/tests/rls.test.mjs`.

**Switching it on** (seno, staging first, then production):

1. Apply the migration. The role starts **without** a login.
2. In the SQL editor, generate a long random password (e.g. `openssl rand -base64 32`) and run:
   ```sql
   alter role mastery_importer with login password '<the password>';
   ```
   Keep the password out of chat, Fizzy and the repo.
3. Supabase → **Connect** → **Session pooler**. Copy the connection string and change its user
   from `postgres.<project-ref>` to `mastery_importer.<project-ref>`, with the new password.
4. Vercel → formation-pathways → Settings → Environment Variables, **Production** only:
   - `MASTERY_IMPORTER_DATABASE_URL`: that string (mark it Sensitive);
   - `CRON_SECRET`: another long random string;
   - optional `MASTERY_IMPORTER_CA_CERT`: the certificate from Supabase → Database settings →
     SSL. With it, the database's identity is verified as well as encrypted.
5. Redeploy. Vercel → **Cron Jobs** lists `/api/cron/mastery`; **Run** it once. Each course's
   Canvas card then says "Automatic: …" and the log shows the run.

Until those are set the job answers "not switched on" and does nothing. Pausing Canvas on a
course stops the automatic import for that course too.

### Khan Academy: through Canvas, no uploads

Khan Academy offers no API to individual teachers. Its official grade sync puts Khan
assignments and scores into **Canvas** automatically, usually within minutes. It needs a
**Khan Academy Districts** partnership with **Clever LMS Connect**
([Khan help](https://support.khanacademy.org/hc/en-us/articles/38767915838861)). Once that's on,
there's nothing to upload:
- Canvas assignments that launch Khan Academy (or whose title says "Khan Academy") are saved as
  **Khan Academy** evidence, not Canvas;
- Khan skill names map to standards through the standards file's `aliases`;
- the source switch on the class map shows what Khan alone says.

Without Districts, the free *Khan2Canvas* Google Sheets add-on copies Khan scores into Canvas
assignments, and the hub then reads them the same way. Student data passes through that third
party, so it needs a privacy review first. As a last resort, the drop-in still takes a Khan CSV.

### AP Classroom (export drop-in)

AP Classroom can't send scores anywhere, so this is the one source that comes in by hand. Download
each progress check's report as CSV, open the course and drop the files in together (up to 20 at
once). Each is read and previewed, and one Save keeps them all. The
reader (`lib/mastery/exports.ts`) accepts:

- **one row per assessment** (student, title, score / points possible / percent / level,
  optional standard and date), or
- **one row per student, a column per assessment or skill**, with cells like `8/10`,
  `80%`, or a mastery word (`Attempted`, `Familiar`, `Proficient`, `Mastered`, mapped by
  `rules.levelWords`).

Students match only **exactly**: school email, or first (or preferred) and last name.
Two students with the same name never match by name. Unmatched names and titles that name
no standard are listed in the preview. The teacher can pick one standard for the
unmapped titles. Re-uploading the same report adds nothing, while a changed score (a
retake) is new evidence. The file itself is never stored, and names in it stay on that
screen.

**Not verified yet:** the real column names in AP Classroom's and Khan's exports. The
reader is deliberately tolerant. Test it with one real export from each and add aliases
in `ALIASES` if needed.

### PhET, OpenStax, other free tools

These have no gradebook. The student sends in their work ("Send in my work", with a link
and what they did). The teacher accepts it at a level, or declines it. Only accepted work
becomes evidence (source "Sent in by the student").

### Oral exams and observations

`/mastery/[course]/oral` on a phone: pick the student, the standard, tap a level, and
optionally say a note (Chrome dictation). Opened from a student's request ("Give it
now"), it also marks the request done.

## Adding another subject (or another class)

**Another class in a subject that already has a file** (a second period, another teacher):
open `/mastery` → **Start a course**, pick the standards and give it its own address
(`APPhysics1-P3`).

**A new subject**: copy `fixtures/mastery/ap-physics-1.json` to `fixtures/mastery/<key>.json`
and change these fields:

- `key`, the default address (`slug`, e.g. `Chemistry`) and `title`;
- the `groups` (units): each has `standards` with codes and titles, an optional `unitNumber`
  so "Unit 3 …" titles map to it, `resources` links and `videos`;
- if you like, the `scale` meanings and the `rules`.

`parseMasteryConfig` refuses a broken file and says where (duplicate codes, a non-https link,
a link that isn't YouTube in `videos`, thresholds out of order, a bad address). The new file
appears in the **Start a course** picker, and nothing else changes.

The AP Physics 1 study links are deliberately course- or book-level: Khan's AP Physics 1
course, the OpenStax *College Physics for AP Courses 2e* book, the PhET simulation for each
unit, and AP Classroom. Replace them with exact pages as you find them. The codes and titles
follow the 2024 Course and Exam Description; check them against your copy.

## Trying it

Staging has the migration (2026-10-12, after #62's and #63's; the whole schema is
fingerprint-verified against the repo). On a preview deployment: `/mastery` → **Load a sample
AP Physics 1 class**, which opens at `/mastery/APPhysics1-Sample`, already finished through
Unit 2. To see the student side, give
a sample student a sign-in with an address you can receive at, then sign in with that
address in a private window.

## Standards edited in the hub

`/mastery/standards` lists every subject's standards: the built-in files (`fixtures/mastery/`)
and any made in the hub. `/mastery/standards/<key>` is the editor. In it you can change:
- the subject's name and default course address;
- what each level means, and the scoring rules;
- units: add, remove, reorder;
- standards, each with **other names** (Khan skill names, textbook headings);
- study links per unit;
- **YouTube videos** per unit or per standard. Paste a link and its title and channel come from
  YouTube's oEmbed, the same check the built-in list went through.

"Edit as JSON" shows everything else (source weights, level words).

Each save is checked by the same parser as the files, then stored in `mastery_standard_sets` and
kept in `mastery_standard_set_versions` (**Earlier versions → Put this version back**). The first
save of a built-in set makes the hub's copy, owned by whoever saved it. After that only that
teacher or an admin can change it, and everyone else can read it. Every course using a set
changes when it's saved, including the scheduled Canvas import, which reads the hub's copy too.
"standards" can't be a course address.

## Next steps from the teacher (AI drafts)

On a student's page (`/mastery/<course>/students/<id>`), **Draft next steps** writes up to three
steps for that student. The panel is labeled **Draft**, and only the teacher sees it until they
edit it and press **Share with <name>**. Then the student sees it at the top of their page as
"From <teacher>", signed from the teacher's own staff record. A shared one is read-only; draft
again for new ones.

- **With Claude** when allowed: a sample student, or `AI_REAL_STUDENTS=on` plus `ai_drafting`
  consent (also enforced by the database).
  - What's sent: the course name, the class's finished unit, a few candidate standards from the
    rules with their level **in words**, the newest evidence titles and sources (no scores, no
    teacher notes), and the course's own links, numbered.
  - Names are replaced (`lib/sor/anonymize.ts`), and nothing is sent if one slips through. The
    teacher sees the exact payload under "What the AI sees".
  - The answer is kept only if each step points at a real candidate and its own links.
    Invented standards and links are dropped (`lib/mastery/next-steps.ts`, tested).
  - Prompt: `prompts/mastery-next-steps.txt`.
- **Without AI** (no key, no consent, a failure): the rule-based steps in plain words, for the
  teacher to edit the same way.

The rule-based next steps on every student page stay as they are.

## Mastery in the Pathway

A student's pilot page shows their mastery courses in words ("Paths toward mastery"). Their
Pathway draft input (`lib/sor/ai-input.ts` → `masteryStrengths`) now includes the same words:
which standards they're solid on and which are still growing, per course. It never includes
scores, levels or counts. It's sent only with `ai_drafting` consent, through the anonymizer like
everything else, and only for courses the drafting staff member can see (an admin sees all).

`prompts/ruakh-today.txt` treats it as backdrop, like courses:
- a strength that lines up with a spark is evidence the student can already do what a pathway
  asks;
- "still growing" is never named, and a student is never called behind or weak;
- grades, levels and "mastery" never appear in a pathway.

**Consent wording changed** (2026-10-12). The Mastery Hub consent used to say "never used in a
Pathway or by AI". It now says that, with AI drafting consent too, strengths in words (never
scores) can inform a Pathway draft and the teacher's next steps. Anyone who consented under the
old wording should re-confirm before their mastery reaches a draft.

## Khan Academy (next)

Khan Academy's grade sync into Canvas needs Clever, which seno ruled out. Instead, a small Chrome
extension (planned) runs in the teacher's own browser while they're signed in to Khan. Every few
hours, and on "Send now", it reads their classes' assignment scores and skill mastery with their
own session and sends them to the course. There's no stored password, no server bot and no third
party. Khan's help center asks people not to use "scraping tools, bots, or other tech to copy or
extract data". seno has accepted that risk to his Khan account.

## Not built yet

- The Khan Academy extension (needs a look at Khan's teacher pages first).
- Students sending in a file (links only today), and a browser bookmarklet for PhET.
- Science-practice tagging inside Canvas items (only codes and names in titles count).
