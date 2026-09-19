# Formation Pathways — Executive Demo Prototype Spec

Three features, one central platform, demo-ready for the executive team. This extends the Day-1 brief and the same CLAUDE.md principles (compass never dossier, humans author / AI drafts, fictional data until consent, no gamification, navy/gold brand). Paste Part 2 into Claude Code session by session; Part 1 is the architecture it must follow; Part 3 is the demo plan.

---

## Part 1 — The Central Platform (build this first; everything else is a door into it)

One database is the whole point of the demo: admissions, academics, and formation observations all landing in the same student core, so every feature makes every other feature smarter.

**Stack:** Next.js App Router + Tailwind + Anthropic SDK (claude-sonnet-4-6). Database: SQLite locally via better-sqlite3, with a clean data-access layer so the Turso/Postgres swap at deploy time is one file. All Claude system prompts in `/prompts` as editable text files. Every AI call has a canned-fallback path so the demo never breaks offline.

**Core schema (the "Pathways Core"):**

- `people` — id, role (applicant | student | teacher | staff | parent), name, grade, email
- `applicants` — person_id, answers (JSON: the five responses), generated_pathways (JSON), page_slug, access_token, status, created_at
- `observations` — id, student_id, author_id, source (voice | text | canvas | drive | edge_app | admissions), body, tags (Formation Framework dimensions), created_at. **This is the heart of the platform: every feature writes here.**
- `courses` — id, name, teacher_id, canvas_course_id
- `course_skills` — id, course_id, name, description (teacher-authored: the 5–8 key skills the course actually builds)
- `skill_snapshots` — id, student_id, skill_id, narrative (no numbers), evidence (JSON of cited artifacts/assignments), updated_at
- `integrations` — provider (canvas | google_drive), config/tokens, sync log

**Demo seed:** 12 fictional students, 2 fictional teachers with one course each ("Honors Physics," "American Literature") with 6 skills apiece, 25–40 observations spread across students, and 2 fictional applicants with completed questionnaires. One student under-observed (the radar). All names invented; a visible "DEMO DATA" badge in the footer of every page.

**Navigation:** one top bar with three doors — Admissions · Classes · Capture — plus a Student page that shows everything the platform knows about one kid in one place (observations timeline, skill snapshots, tags, portrait button). The Student page is the proof of "one database": end the demo there.

---

## Part 2 — The Three Features

### Feature 1: Admissions Personalized Pathways (Session 1–2)

**The questionnaire.** Five short-answer questions on a beautiful, calm, single-page form — one question visible at a time, generous type, autosaving, feels like the beginning of being known rather than a form. No multiple choice anywhere. The five questions (editable in /prompts/admissions-questions.txt):

1. *Tell us about a time you lost track of time doing something. What were you doing, and what pulled you in?*
2. *Who is someone you admire — famous or not — and what is it about the way they live that you want for your own life?*
3. *Tell us about something hard you've faced. What did it teach you about who you are?*
4. *If you could spend a whole year getting really good at one thing, what would you choose, and why that?*
5. *When you imagine yourself at high school graduation, what do you hope is true about you that isn't true yet?*

**The generation.** On submit, Claude receives the five answers plus a Pacifica knowledge file (/prompts/pacifica-context.txt — courses, arts, athletics, ministry, Lost Canyon, Pathway Expeditions, the Forge / Advanced AI Agents class, Formation Framework) and generates **three distinct, named pathways** — not tracks, but three plausible stories of this specific kid's four years. Each pathway must contain: a name that quotes or echoes the applicant's own words; a "your first semester" paragraph naming real Pacifica experiences; a mentor archetype ("a teacher who will…"); one stretch challenge; and a four-year horizon that names 2–3 launch routes from the Pathways Engine catalog (Thiel/YC-class fellowships, apprenticeships, academies, conservatories, research, ministry, selective colleges). The three pathways must be genuinely different in emphasis (e.g., builder / servant-leader / scholar-artist as fits the answers), never generic, and each must quote the applicant's actual answers at least once — being quoted back is the "they truly read this" moment.

**The page.** Generated as a custom shareable webpage at `/applicant/[slug]-[token]` (e.g., `/applicant/emma-r-8f3k2`) — slug from the name, plus a short random token so pages are unguessable; applicant data is sensitive from day one. Full navy/gold brand, the student's name in serif display type, the three pathways as elegant sections with a closing line: *"These aren't predictions. They're invitations. The real pathway will be written by you — witnessed, one moment at a time."* Print stylesheet included so admissions can hand a family a physical copy. An admissions-staff view lists all applicants, their answers, generated pathways, a regenerate button, and an **approval gate: no page link goes to a family until a named staff member reviews and approves it** (humans author, AI drafts — same rule as portraits).

**Writes to the core:** each answer is stored, and Claude also distills the questionnaire into 3–5 seed observations tagged with Formation Framework dimensions, source `admissions` — so if the student enrolls, their Pathway is already begun. Say this out loud in the demo.

### Feature 2: Teacher Skills Page — Canvas + Drive → skills, not points (Session 3)

**Start from the student's app.** A Pacifica student already built a Canvas-connected app (Canvas Notifications). Get the GitHub repo from the student and give Claude Code access: `Read through [repo] and reuse its Canvas API authentication and data-fetching patterns as the basis for our Canvas integration module.` Credit the student in the UI footer ("Canvas integration built on work by [student name], Pacifica '2X") — in the exec demo this is the Forge thesis proven live: student software becoming school infrastructure.

**The teacher defines skills, once.** For each course, the teacher lists 5–8 key skills in plain language ("Builds and defends a physical model," "Writes a claim and supports it with evidence"). This 10-minute setup is what makes everything non-generic.

**The sync.** A "Sync from Canvas" action pulls assignments, submissions, scores, and rubric data via the Canvas REST API (per-teacher API token for the prototype; OAuth later). A "Sync from Drive" action (Google Drive API, read-only scope) pulls the text of student work in a teacher-designated folder. Claude then maps each artifact to the course skills and writes/updates `skill_snapshots`: for every student × skill, a two-sentence narrative of where they are and where they're headed, citing specific artifacts as evidence — never a number, never a letter, never "points." **Demo mode is mandatory:** a `MOCK_INTEGRATIONS=true` flag serves realistic seeded Canvas/Drive payloads so the exec demo runs flawlessly with zero live credentials; live sync is tested separately against a sandbox Canvas course with fictional students, never a real roster, until privacy sign-off.

**Two views.** *Teacher view:* the class as a skills matrix — students × skills, each cell a short narrative on hover/tap, with an AI-drafted "who needs what this week" note per skill. *Student view:* "Where you are in Physics" — their skill narratives, what growth would look like next, and one strength to lean on. The explicit design goal: a student and teacher can have a five-minute conversation about learning without either of them saying a number. Skill snapshots with formation-relevant signal (perseverance on a hard problem, helping a peer) also propose observations into the core — teacher approves each with one tap.

### Feature 3: Voice Capture (Session 4 — mostly built in the Day-1 brief; now pointed at the core)

The 30-second capture flow from the Day-1 brief, wired to the central `observations` table: mic button (Web Speech API dictation, textarea fallback), Claude cleans + suggests Formation Framework tags + gently flags anything reading as discipline rather than formation, teacher confirms, saved. Additions for the exec demo: a "My advisees" quick-pick row; capture works from any student's page and from the top bar anywhere; and after saving, a subtle toast — *"Added to Jordan's Pathway — 14 adults have now witnessed his semester"* — which quietly demonstrates the dataset compounding. The Student page portrait button ("Draft Pathway Portrait") now draws on *everything*: voice observations, admissions seeds, and skill snapshots. That combined portrait is the finale of the demo.

---

## Part 3 — The Executive Demo (10 minutes, in this order)

Pre-generate everything the morning of; never generate live on stage without a fallback already rendered.

1. **Open on the applicant page** (2 min). Don't explain the platform — just show a finished `/applicant/emma-r-…` page and let them read a pathway that quotes "Emma's" own words. Then show the five questions she answered. Land: "Every family that applies experiences this before they enroll."
2. **The teacher skills page** (3 min). Show the class matrix, click one student, show the student view with zero numbers on it. Then the line: *"The Canvas integration underneath this was built by one of our students — this feature is the Forge thesis, already true."*
3. **Live voice capture** (2 min). On stage, capture a 20-second observation about a fictional student. Show it land, tagged, on their Student page.
4. **The finale — one database** (3 min). On that same Student page, click "Draft Pathway Portrait" and show a narrative that weaves the admissions seeds, the skill snapshots, and the voice observations into one story of becoming. Close: *"Three doors. One platform. Canvas gives us sixty data points a year; this gives us hundreds — authored by people who love the kid."* Then the timeline slide and the ~$26K Lab ask.

**Build order this week:** Session 1 core schema + seed + Student page → Session 2 admissions flow + applicant pages → Session 3 skills page with MOCK_INTEGRATIONS (import the student's repo first) → Session 4 capture + combined portrait → Session 5 polish, demo data pass, dry run twice, deploy to Vercel behind a password.

**Hard rules for the week:** fictional data only, everywhere, including the sandbox Canvas course; applicant pages tokenized and unlisted; the student's code used with their permission and named credit; and nothing AI-written reaches a real family — this is a demo of a governed system, and the governance is part of what you're selling.
