# Formation Pathways

A platform for Pacifica Christian High School. Teachers capture short voice/text
observations of student formation moments; AI synthesizes them into a
forward-looking "Pathway" per student. Governing principle: AI works for the
adults behind the scenes; students stay present, in person, with people.

## Stack
- Next.js (App Router) + Tailwind, SQLite via better-sqlite3, Anthropic SDK
  (model: claude-sonnet-4-6). Single repo, runs with `npm run dev`. No auth yet.
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
