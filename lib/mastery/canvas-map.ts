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
import { ratingLabel } from "./canvas-outcomes.ts";

export interface CanvasSubmission {
  user_id: string;
  assignment_id: string;
  assignment_name: string;
  points_possible: number | null;
  score: number | null;
  graded_at: string | null;
  workflow_state?: string;
  /** The external tool's launch address, when the assignment is one (Khan
   *  Academy via Clever LMS Connect or LTI). */
  tool_url?: string | null;
  /** The assignment's rubric: criteria aligned to Canvas outcomes. */
  rubric?: { id: string; points: number | null; description?: string | null; outcome_id?: string | number | null }[] | null;
  /** This student's rubric scores, by criterion id. */
  rubric_assessment?: Record<string, { points?: number | null } | undefined> | null;
}

/** Work that came from Khan Academy into Canvas (an official sync, or a
 *  score copied over): counted as Khan evidence, not Canvas. */
export function isKhanAssignment(s: Pick<CanvasSubmission, "tool_url" | "assignment_name">): boolean {
  let host = "";
  try {
    host = s.tool_url ? new URL(s.tool_url).hostname : "";
  } catch {}
  return /(^|\.)khanacademy\.org$/.test(host) || /\bkhan academy\b/i.test(s.assignment_name);
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
  /** Canvas outcome id → objective code, when the course's objectives come
   *  from Canvas (canvas-outcomes.ts). */
  outcomeCodes: Map<string, string> = new Map(),
): { evidence: EvidenceDraft[]; unmapped: string[] } {
  const evidence: EvidenceDraft[] = [];
  const unmapped = new Set<string>();
  for (const s of submissions) {
    const person = personByCanvasId.get(s.user_id);
    if (!person) continue;
    if (s.workflow_state && s.workflow_state !== "graded") continue;
    // Work aligned to objectives through its rubric: each aligned criterion
    // is evidence for its own objective, at its own score.
    const aligned = (s.rubric ?? []).filter((c) => c.outcome_id != null && outcomeCodes.has(String(c.outcome_id)) && (c.points ?? 0) > 0);
    if (aligned.length) {
      let scored = false;
      for (const c of aligned) {
        const got = s.rubric_assessment?.[c.id]?.points;
        if (typeof got !== "number") continue;
        scored = true;
        evidence.push({
          person_id: person,
          standard_code: outcomeCodes.get(String(c.outcome_id))!,
          source: isKhanAssignment(s) ? "khan" : "canvas",
          title: `${s.assignment_name}${c.description ? `: ${c.description}` : ""}`.slice(0, 200),
          score: got,
          max_score: c.points!,
          level: null,
          occurred_at: s.graded_at ?? now,
          external_key: `canvas:rubric:${s.assignment_id}:${c.id}:${got}`,
        });
      }
      // Aligned but graded without the rubric: the whole score counts for
      // each objective it's aligned to.
      if (!scored && s.score !== null && s.points_possible && s.points_possible > 0)
        for (const code of new Set(aligned.map((c) => outcomeCodes.get(String(c.outcome_id))!)))
          evidence.push({
            person_id: person,
            standard_code: code,
            source: isKhanAssignment(s) ? "khan" : "canvas",
            title: s.assignment_name.slice(0, 200),
            score: s.score,
            max_score: s.points_possible,
            level: null,
            occurred_at: s.graded_at ?? now,
            external_key: `canvas:assignment:${s.assignment_id}:${s.score}`,
          });
      continue;
    }
    if (s.score === null || !s.points_possible || s.points_possible <= 0) continue;
    const codes = standardsInTitle(s.assignment_name, config);
    if (!codes.length) {
      unmapped.add(s.assignment_name);
      continue;
    }
    for (const code of codes)
      evidence.push({
        person_id: person,
        standard_code: code,
        source: isKhanAssignment(s) ? "khan" : "canvas",
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
    const direct = outcomeCodes.get(String(r.outcome_id));
    const codes = direct ? [direct] : standardsInTitle(r.outcome_title, config);
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

export interface CanvasRollupScore {
  user_id: string;
  outcome_id: string;
  score: number;
}

export interface ObjectiveGrade {
  person_id: string;
  standard_code: string;
  score: number;
  max_score: number | null;
  label: string | null;
}

/** Canvas's own current score per student per objective (outcome rollups),
 *  with the outcome's rating words ("Meets Mastery"). */
export function rollupGrades(
  scores: CanvasRollupScore[],
  outcomes: Map<string, { ratings?: { description?: string | null; points?: number | null }[] | null; points_possible?: number | null }>,
  personByCanvasId: Map<string, string>,
  outcomeCodes: Map<string, string>,
): ObjectiveGrade[] {
  const out: ObjectiveGrade[] = [];
  for (const s of scores) {
    const person = personByCanvasId.get(s.user_id);
    const code = outcomeCodes.get(String(s.outcome_id));
    if (!person || !code || typeof s.score !== "number" || !Number.isFinite(s.score)) continue;
    const o = outcomes.get(String(s.outcome_id));
    const top = Math.max(0, ...(o?.ratings ?? []).map((r) => r.points ?? 0), o?.points_possible ?? 0);
    out.push({ person_id: person, standard_code: code, score: s.score, max_score: top > 0 ? top : null, label: ratingLabel(s.score, o?.ratings) });
  }
  return out;
}
