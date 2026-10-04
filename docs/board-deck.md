# The board deck: "Ruakh 2.0: One Platform"

**Link (private; share from its Share menu):**
https://claude.ai/artifact/1LeuvMLhojka4TU3m82Qvj

A Slides-type artifact on claude.ai. It's not in this repo: its content lives in
the artifact's own files (`project/deck.json` plus one `project/slides/<id>.html`
per slide). To change it in a Claude Code session, ask Claude to revise the deck
at that link. Claude reads the files, edits copies, and republishes to the same
URL.

## Structure (version 9, 2026-10-04)

The flow seno chose: **an overview on slides, then the live demo in the
browser, then back to slides to wrap up.** No slides that just show a link.

| # | Slide id | What it does |
|---|---|---|
| 1 | `cover` | Ruakh 2.0: one record from first inquiry to alumni. The notes give the timing (about 18 min). |
| 2 | `problem` | "Every hand-off is a break in communication." The inquiry→alumni row, and **0 of 8** live connections between the school's systems (from the Systems Map). |
| 3 | `one-database` | What Ruakh 2.0 is: one record that travels with the student, and the three rules (humans author / compass, never dossier / consent first). |
| 4 | `proof` | What's real today (as of Oct 4): live site, Finalsite and Blackbaud connected, the student-voice pilot, AI on sample students only, consent enforced by the database. |
| 5 | `demo` | **"Let's see it."** The hand-off to the browser, with four beats (season · a family's first look · what lights them up · one student's story). **The full demo script is in its speaker notes**, matching `docs/oct-5-demo.md` section C. |
| 6 | `build-next` | What we build next: **one consented database** → **shared infrastructure** (school GitHub, ready-made dev environments, a live preview for every idea, AI tools with guardrails) → **teachers, students and offices build on it**. "Every new tool closes a break instead of becoming the next island." Ties Formation Pathways to the Phase 1–3 dev-platform roadmap. |
| 7 | `ask` | Five decisions: AI vendor terms · widen the pilot with one consent form · a school-owned home with budget caps · families see their own pathway · a teacher-and-student build pilot under an AI-use policy for minors. |
| 8 | `close` | How we'll measure (first yield read in April; no result claimed) and "One record. No more breaks. Every teen's Ruakh 2.0." |

**Placeholder left for seno:** slide 7's notes say "[give the monthly cap you
want, e.g. $__ per month]".

**Style:** Fraunces for headings, IBM Plex Sans and Mono for text; navy
`#0B1620`/`#0F2338`, teal `#146C7A`/`#5FC7D1`, gold `#C9A24B`/`#E0B968`, paper
`#F6F5F0`. New slides should reuse an existing slide's markup.

## Keep it consistent with

- `docs/oct-5-demo.md`: the run of show; slide 5's notes are the same script.
- The Pacifica Systems Map (https://claude.ai/artifact/GWGzrdfMSr8vfWsRycGM1T):
  the problem slide's hand-off count comes from it.
- The project's `CLAUDE.md` status: slide 4 ("what's real today") should change
  when the status does.

## Never on a slide or in the demo

- A real student's name or record. The demo uses Emma, Marcus and students
  marked Sample (Iris).
- A claim that pathways raised applications or yield. There's no data yet;
  the first read is in April.
