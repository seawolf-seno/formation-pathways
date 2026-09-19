# Formation Pathways — Agent Onboarding Context

Paste this entire document into Claude Code (or drop it in as `CONTEXT.md` in the project root and tell the agent to read it first) at the start of a session in the existing **Formation Pathways** project. It replaces having to explain the backstory — everything the agent needs to build consistently with prior work is below.

If a `CLAUDE.md` already exists in the project from earlier sessions, tell the agent: *"Read CLAUDE.md first, then this file. Where they overlap, CLAUDE.md wins for anything already built; this file governs new work."* Otherwise, tell it to create `CLAUDE.md` from Part 2 below.

---

## Part 1 — The Story So Far (context, not instructions)

Pacifica Christian High School (pacificachristian.org) hires only staff who meet five requirements — loves God, loves teens, loves their content, is expert at teaching, loves the mission — and this produces teenager transformation ("Ruakh 2.0") at an unusually high rate. The problem: that transformation is invisible to prospective families, hard to name for current families, and unguided by data.

**Formation Pathways** is the platform being built to fix this. One governing principle underlies every feature: **AI works for the adults, behind the scenes. Students stay present, in person, with people.** Screen time goes down, not up. A student "Pathway" is a forward-looking compass built from hundreds of witnessed formation moments — never a backward-looking record, never used to rank, gatekeep, or punish. The word "record" is banned from the UI; say "Pathway."

The wider vision (for context, not all buildable now): a Pathways Engine matching students to non-traditional launch routes (Thiel Fellowship, Y Combinator, apprenticeships, service academies, conservatories, research tracks, ministry, alongside selective colleges); Lost Canyon (the school's existing phone-free retreat) and new "Pathway Expeditions" (small-group academic road trips) as keystone formation experiences; an enduring-wisdom-plus-frontier-tools curriculum; and **The Forge** — school-hosted infrastructure letting students and teachers ship their own software (an "Advanced AI Agents" class already does this) from laptop to a dev server to production, replacing commodity ed-tech with better, student-built alternatives, on a "solid core, open edges" architecture: Pacifica owns the Pathway core, permissioned APIs let student apps extend the edges. A published timeline targets Fall 2026 (Agents class live, capture pilot, Lost Canyon harvest), Winter 2026–27 (admissions Pathways go live, AI Lab hardware live), and Spring 2027 (pilots complete, platform v1 foundation done). An "AI Lab" budget (~$26K one-time: Mac mini agent nodes, dev server, production server, an on-campus LLM inference server, student dev stations) has been scoped for the board.

**The immediate task** (this session onward) is a three-feature executive-demo prototype, detailed fully in Part 3.

---

## Part 2 — CLAUDE.md (create this file if it doesn't exist; merge in if it does)

```markdown
# Formation Pathways

A platform for Pacifica Christian High School. One central database holds
everything the school witnesses about a student's growth — admissions
answers, class-skill snapshots, and teacher/staff voice observations — and
AI synthesizes it into a forward-looking "Pathway" per student. Governing
principle: AI works for the adults behind the scenes; students stay present,
in person, with people.

## Stack
- Next.js (App Router) + Tailwind. Database: SQLite via better-sqlite3 for
  local dev, behind a clean data-access layer so a Turso/Postgres swap at
  deploy time touches one file. Anthropic SDK, model claude-sonnet-4-6.
- Voice capture: Web Speech API for live dictation (Chrome), textarea
  fallback. Canvas/Google Drive integrations run behind a MOCK_INTEGRATIONS
  flag with realistic seeded payloads — demos must never depend on live
  credentials or network access.

## Product principles — enforce in UI copy and logic, every session, every feature
1. Humans author, AI drafts. Every AI output is labeled "Draft" until a named
   adult reviews and signs/approves it. No unsupervised send to a family.
2. Compass, never dossier. No numeric scores, grades, or "points" language
   anywhere in student-facing or teacher-facing summaries. No red/failure
   states on a student profile. Never say "record" — say "Pathway."
3. Grace in the architecture. AI prompts must frame struggle as
   growth-in-progress and actively surface pattern-breaking positives (a
   quiet student's unexpected leadership moment, etc.) — never let a student
   get typecast by early observations.
4. Warm, not clinical. AI writes about teenagers the way a teacher who loves
   them would. Never diagnose, label, or score a student's character.
5. FICTIONAL DATA ONLY in every environment until the school's privacy and
   theology review is complete. Seed people are invented. Never suggest
   entering a real student's name, even for testing. Real Canvas/Drive syncs
   only ever point at a sandbox course with fictional rosters.
6. Applicant and student pages are sensitive from the first write. Applicant
   pages use an unguessable slug + token in the URL. No feature ships without
   a human-approval gate before anything reaches a family.
7. No gamification, ever. No points, badges, streaks, leaderboards.
8. Credit student-built code. Where a feature is built on a Pacifica
   student's own project, name them in the UI (e.g. a footer credit) — this
   is core to the platform's "students build what forms them" thesis.

## Formation Framework (tag vocabulary — faculty owns this; keep editable in /prompts)
Spiritual Depth · Intellectual Courage · Character Under Pressure ·
Love of Neighbor · Emerging Superpowers · Sense of Calling

## Design
Deep navy #16324F dominant, Pacific blue #8FB3D9 and gold #C9A24B accents,
white surfaces, serif display headings (e.g. Source Serif / Freight-style),
humanist sans body. Define as CSS variables (official Pacifica codes will be
swapped in later — ask before assuming these are final). Every screen should
pass: "would a parent trust this with their child's story?"

## Conventions
- All Claude system prompts live in /prompts as .txt files, loaded at
  runtime, and are meant to be human-editable by non-engineers later.
- Every Claude call has a canned-fallback path so demos never break offline
  or without an API key.
- Keep it boring: no extra services, no Docker, no new cloud dependency
  unless asked.
- A visible "DEMO DATA" badge appears anywhere fictional seed data is shown.
```

---

## Part 3 — The Build: Three Features on One Central Database

Tell the agent: *"We're building the exec-demo prototype described below inside this existing project. Check what's already scaffolded before creating new schema or pages — extend, don't duplicate."*

### The Central Platform (build/confirm this first — everything else is a door into it)

**Core schema ("Pathways Core"):**
- `people` — id, role (applicant | student | teacher | staff | parent), name, grade, email
- `applicants` — person_id, answers (JSON: five short-answer responses), generated_pathways (JSON), page_slug, access_token, status, created_at
- `observations` — id, student_id, author_id, source (voice | text | canvas | drive | edge_app | admissions), body, tags (Formation Framework dimensions), created_at — **the heart of the platform: every feature writes here**
- `courses` — id, name, teacher_id, canvas_course_id
- `course_skills` — id, course_id, name, description (teacher-authored: 5–8 key skills the course actually builds)
- `skill_snapshots` — id, student_id, skill_id, narrative (no numbers), evidence (JSON of cited artifacts), updated_at
- `integrations` — provider (canvas | google_drive), config/tokens, sync log

**Demo seed:** 12 fictional students, 2 fictional teachers with one course each (e.g. "Honors Physics," "American Literature") with 6 skills apiece, 25–40 observations spread across students (one student deliberately under-observed), 2 fictional completed applicants. All fictional; DEMO DATA badge everywhere.

**Navigation:** one top bar — Admissions · Classes · Capture — plus a Student page showing everything the platform knows about one kid in one place (observations timeline, skill snapshots, tags, a "Draft Pathway Portrait" button). The Student page is the "one database" proof — the demo ends there.

---

### Feature 1 — Admissions Personalized Pathways

**Questionnaire:** five short-answer questions, one visible at a time, generous serif type, autosave — feels like the start of being known, not a form. No multiple choice. Store in /prompts/admissions-questions.txt so they're editable:

1. Tell us about a time you lost track of time doing something. What were you doing, and what pulled you in?
2. Who is someone you admire — famous or not — and what is it about the way they live that you want for your own life?
3. Tell us about something hard you've faced. What did it teach you about who you are?
4. If you could spend a whole year getting really good at one thing, what would you choose, and why that?
5. When you imagine yourself at high school graduation, what do you hope is true about you that isn't true yet?

**Generation:** on submit, Claude reads the five answers plus /prompts/pacifica-context.txt (courses, arts, athletics, ministry, Lost Canyon, Pathway Expeditions, the Forge/Agents class, Formation Framework) and generates **three distinct, named pathways** — plausible four-year stories, not tracks. Each includes: a name echoing the applicant's own words; a "your first semester" paragraph naming real Pacifica experiences; a mentor archetype; one stretch challenge; a four-year horizon naming 2–3 launch routes (Thiel/YC-class fellowships, apprenticeships, academies, conservatories, research, ministry, colleges). The three must differ meaningfully in emphasis and each must quote the applicant's actual words at least once.

**The page:** custom shareable page at `/applicant/[slug]-[token]` (e.g. `/applicant/emma-r-8f3k2`) — unguessable token, full navy/gold brand, applicant's name in serif display, three pathways as elegant sections, closing line: *"These aren't predictions. They're invitations. The real pathway will be written by you — witnessed, one moment at a time."* Print stylesheet. Admissions-staff view lists applicants, answers, generated pathways, a regenerate button, and a **mandatory approval gate** before any link goes to a family.

**Writes to the core:** answers stored; Claude also distills 3–5 seed observations (source: `admissions`, tagged with Formation Framework dimensions) so an enrolled student's Pathway is already begun.

### Feature 2 — Teacher Skills Page (Canvas + Google Drive → skills, not points)

**Reuse a student's existing code first.** A Pacifica student built a Canvas-connected notifications app. Ask for the GitHub repo link and tell the agent: *"Read through [repo URL] and reuse its Canvas API authentication and data-fetching approach as the basis for our Canvas integration module."* Credit them in the UI footer (e.g. "Canvas integration built on work by [name], Pacifica '2X") — this is the Forge thesis (students build what forms them) proven live in the demo.

**Teacher defines skills once**: 5–8 plain-language skills per course (e.g. "Builds and defends a physical model").

**Sync:** "Sync from Canvas" (assignments, submissions, scores, rubrics via Canvas REST API, per-teacher token for the prototype) and "Sync from Drive" (Google Drive API, read-only, teacher-designated folder). Claude maps artifacts to skills and writes `skill_snapshots`: for every student × skill, a two-sentence narrative — where they are, where they're headed — citing specific evidence, never a number or letter grade. **`MOCK_INTEGRATIONS=true` is mandatory** for the demo: realistic seeded Canvas/Drive payloads so nothing depends on live credentials. Live sync, when tested, only ever points at a sandbox course with fictional students.

**Two views:** *Teacher* — class as a skills matrix (students × skills, narrative on tap, an AI-drafted "who needs what this week" note). *Student* — "Where you are in [Class]": skill narratives, what's next, one strength to lean on. Goal: a five-minute student-teacher conversation about learning with no number spoken. Formation-relevant skill signals (perseverance, helping a peer) propose observations into the core, one-tap teacher approval.

### Feature 3 — Voice Capture into the Central Database

30-second flow: mic button (Web Speech API, textarea fallback) → Claude cleans transcription, suggests 1–2 Formation Framework tags with rationale, gently flags anything reading as discipline rather than formation → teacher confirms/edits → saved to `observations`. Add: a "My advisees" quick-pick row; capture reachable from any student page and the top bar; a toast after save — *"Added to Jordan's Pathway — 14 adults have now witnessed his semester."* The Student page's "Draft Pathway Portrait" must draw on **all three sources** — admissions seeds, skill snapshots, voice observations — into one combined narrative. That combined portrait is the platform's proof of concept.

---

## Part 4 — Demo Script (10 minutes) and Build Order

**Demo order:** (1) open on a finished `/applicant/…` page, show it quoting the applicant's own words — "every family experiences this before they enroll"; (2) teacher skills matrix, click into student view, zero numbers visible — "the Canvas integration underneath this was built by one of our own students"; (3) live 20-second voice capture on stage, watch it land tagged on a Student page; (4) finale — same Student page, click "Draft Pathway Portrait," show admissions + skills + voice woven into one story — "Canvas gives sixty data points a year; this gives hundreds, authored by people who love the kid."

**Build order:** (1) confirm/extend core schema + seed + Student page → (2) admissions flow + applicant pages → (3) skills page with MOCK_INTEGRATIONS, importing the student's repo first → (4) voice capture + the combined portrait → (5) polish, two full dry runs, deploy to Vercel behind a password, pre-generate every AI output used on stage so nothing generates live without a rendered fallback.

**Non-negotiables:** fictional data everywhere, including any sandbox Canvas course; applicant pages tokenized and unlisted; the student's code used with permission and named credit; nothing AI-written reaches a real family. This is a demo of a *governed* system — the governance is part of the pitch.
