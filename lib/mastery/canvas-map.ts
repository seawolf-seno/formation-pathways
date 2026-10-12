// Canvas → mastery evidence, the pure part. Two kinds of Canvas data count:
// - Outcome results (Canvas's own mastery gradebook): an outcome whose title
//   names a standard code ("2.5 Newton's second law") is evidence on it.
// - Graded assignments: an assignment whose name names a code or a unit
//   ("Unit 2 quiz [2.5, 2.7]") is evidence on those standards.
// Anything that names no standard is skipped and counted, never guessed.
// Tested in tests/mastery.test.mjs.

import type { MasteryConfig } from "./config.ts";
import type { EvidenceDraft } from "./exports.ts";
import { standardsInTitle } from "./exports.ts";

export interface CanvasSubmission {
  user_id: string;
  assignment_id: string;
  assignment_name: string;
  points_possible: number | null;
  score: number | null;
  graded_at: string | null;
  workflow_state?: string;
}

export interface CanvasOutcomeResult {
  user_id: string;
  outcome_id: string;
  outcome_title: string;
  score: number | null;
  possible: number | null;
  submitted_or_assessed_at: string | null;
}

export function canvasEvidence(
  submissions: CanvasSubmission[],
  outcomeResults: CanvasOutcomeResult[],
  personByCanvasId: Map<string, string>,
  config: MasteryConfig,
  now: string,
): { evidence: EvidenceDraft[]; unmapped: string[] } {
  const evidence: EvidenceDraft[] = [];
  const unmapped = new Set<string>();
  for (const s of submissions) {
    const person = personByCanvasId.get(s.user_id);
    if (!person || s.score === null || !s.points_possible || s.points_possible <= 0) continue;
    if (s.workflow_state && s.workflow_state !== "graded") continue;
    const codes = standardsInTitle(s.assignment_name, config);
    if (!codes.length) {
      unmapped.add(s.assignment_name);
      continue;
    }
    for (const code of codes)
      evidence.push({
        person_id: person,
        standard_code: code,
        source: "canvas",
        title: s.assignment_name.slice(0, 200),
        score: s.score,
        max_score: s.points_possible,
        level: null,
        occurred_at: s.graded_at ?? now,
        // A regrade is new evidence; the same grade read twice is not.
        external_key: `canvas:assignment:${s.assignment_id}:${s.score}`,
      });
  }
  for (const r of outcomeResults) {
    const person = personByCanvasId.get(r.user_id);
    if (!person || r.score === null || !r.possible || r.possible <= 0) continue;
    const codes = standardsInTitle(r.outcome_title, config);
    if (!codes.length) {
      unmapped.add(r.outcome_title);
      continue;
    }
    for (const code of codes)
      evidence.push({
        person_id: person,
        standard_code: code,
        source: "canvas",
        title: `Canvas outcome: ${r.outcome_title}`.slice(0, 200),
        score: r.score,
        max_score: r.possible,
        level: null,
        occurred_at: r.submitted_or_assessed_at ?? now,
        external_key: `canvas:outcome:${r.outcome_id}:${r.submitted_or_assessed_at ?? ""}:${r.score}`,
      });
  }
  return { evidence, unmapped: [...unmapped].slice(0, 20) };
}
