# STEM Scholars Hub · Fizzy #34

The staff hub is `/stem`; students use a private `/scholars/[token]` link. A read-only fictional preview at `/stem-demo` works locally without credentials (active staff sign-in in production). It includes invented students, a mentor, a project and an example opportunity, and never saves data.

## Setup

1. The repository owner applies `supabase/migrations/20261012000000_stem_scholars.sql` to the school database using the SQL editor or `supabase db push`. Agents must not apply live migrations or read real student tables. Before this, `/stem` shows a setup message and existing profiles continue to work.
2. Sign in as an active admin, open **The distinction**, replace the suggested requirements with the school's official wording, save, then approve. The four starting requirements are suggestions, not school policy. There are no student scores, ranks or badges. An optional application deadline is enforced on submission.
3. Add checked mentor/alumni entries and opportunities. Mentor contact details are staff-only. Opportunities stay drafts until published; expired opportunities disappear from student pages.
4. Add an existing consented student to the hub. An admin manages student voice consent on the student's Formation Pathways profile. Meetings additionally need staff observations consent. The leadership pilot gate must be open for real students. No new student identities are created here.

## Application and project workflow

**Students & projects → Start an application** selects an existing person, optionally with a student email for prepared email updates. Sit with the student to fill in curiosity, project goal and availability, or create a private student link. The link is generated from 32 random bytes; only its SHA-256 hash is stored. It lasts up to 30 days. Copy it immediately; its original token cannot be recovered later.

The student submits once; a coordinator returns the application to draft for revisions, accepts it, or pauses participation. After acceptance, students and staff can add and update project narratives, evidence links, next steps and deadlines. Staff can add private meeting notes and track introductions as requested, introduced or complete. Students can request a mentor/alumni introduction; coordinators arrange the actual contact. Requesting an introduction does not email a mentor automatically.

For each distinction requirement, add meaningful evidence, then **Review and confirm this evidence**. Signing stores the actual staff member's name and makes the evidence read-only. Only an active scholar with reviewed evidence for every current requirement can receive a distinction under an approved rubric. The final decision stores the requirement wording and named reviewer; subsequent rubric edits clear program approval but preserve prior decisions.

Use **Student access → End my student links** to revoke links you created (admins can revoke all). A revoked or expired link, withdrawn participant, closed real-data gate, withdrawn student voice consent, or inactive link creator stops both reads and writes. Student pages reveal their own projects/evidence, approved updates, published opportunities and available mentor biographies. They do not reveal staff meeting bodies, mentor contact information, staff IDs, other students, or draft updates. Treat a student link as private access to that student's work.

## Biweekly assistant

The assistant builds a deterministic draft from that student's project updates, shareable next steps, outstanding requirement evidence, and open opportunities. It sends no data to an AI vendor. Each period is 14 days anchored to the membership's creation date; a unique database index prevents duplicates. Missed periods are prepared sequentially, one per student per run, so staff can review any backlog.

When Supabase Cron (`pg_cron`) is already enabled, the migration registers `stem-scholars-biweekly`, which checks daily at 13:00 UTC. If Cron is enabled later, the owner can run this in the SQL editor:

```sql
select cron.schedule(
  'stem-scholars-biweekly',
  '0 13 * * *',
  'select private.stem_prepare_due_summaries()'
);
```

The scheduled job creates unsigned drafts attributed to an active membership coordinator. It skips inactive coordinators and missing consent. It does not use a service-role API key. Without Cron, **Biweekly updates → Prepare due biweekly updates** runs the same database function as the signed-in coordinator.

A coordinator edits and signs each draft. Signing releases the update to the student's private page immediately. **Prepare email** opens the school's mail app with the signed update; **Confirm I delivered this update** records actual delivery after staff send it. This release is consistent with the repository's human-review rule. An unattended outbound email or SMS provider is not configured by this change; do not describe prepared emails as automatically sent.

## Formation Pathways integration

STEM membership and contributions use the existing `people.id`. Saving STEM work immediately changes the STEM section of `/pilot/people/[id]`; there is no second student profile to reconcile. Future pathway drafts can incorporate STEM projects, evidence and mentor conversations through `lib/sor/ai-input.ts`, with known mentor/reviewer names added to the pseudonymizer. Existing AI consent, `AI_REAL_STUDENTS`, name checks and staff sign-off still apply. Previously signed pathways remain immutable.

All staff queries use the signed-in Supabase client under RLS. New per-student tables have consent/leadership guards and explicit Data API grants. Writes are audited. No live student data is included in fixtures or tests.

## Verification

Run the existing CI checks: lint, TypeScript, `npm run test:db`, `npm run test:share`, and `npm run build`. The database suite executes the real migration in isolated PGlite and covers roles, consent, anonymous token access, private notes, coordinator identity, rubric sign-off, immutable evidence/awards, duplicate periods and delivery sign-off. Pure tests cover two-week dates, summary privacy and link/date validation.

For a school sandbox after setup: start an application, create a link, submit through a private browser window, accept the student, add a project and meeting note, request an introduction, add/review every requirement's evidence, approve the rubric and confirm the distinction. Prepare a due summary, edit/sign it, verify only the signed copy appears on the private student page, then revoke the link and confirm access stops.
