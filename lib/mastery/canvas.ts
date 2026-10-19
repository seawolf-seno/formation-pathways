import "server-only";
import { LiveCanvasSource } from "@/lib/integrations/canvas";
import type { CanvasOutcomeResult, CanvasRollupScore, CanvasSubmission } from "./canvas-map";
import type { CanvasAssignmentGroup, CanvasOutcomeLink } from "./canvas-outcomes";

/**
 * Reads one Canvas course's graded work and Outcome results for the students
 * on a mastery roster, through the official Canvas API with the school's
 * token (CANVAS_BASE_URL + CANVAS_API_TOKEN, same as the pilot import). Asks
 * only about the roster's Canvas ids (student_ids[] / user_ids[]), so other
 * students' data is never requested. Reuses the Bearer/pagination client
 * built on Levi Gibbons' canvasnotifications.
 */
export function isLiveCanvasConfigured(): boolean {
  return Boolean(process.env.CANVAS_BASE_URL && process.env.CANVAS_API_TOKEN);
}

export async function fetchCanvasMastery(
  canvasCourseId: string,
  canvasUserIds: string[],
): Promise<{
  submissions: CanvasSubmission[];
  outcomeResults: CanvasOutcomeResult[];
  rollups: CanvasRollupScore[];
  outcomes: Map<string, { ratings?: { description?: string | null; points?: number | null }[] | null; points_possible?: number | null }>;
}> {
  if (!canvasUserIds.length) return { submissions: [], outcomeResults: [], rollups: [], outcomes: new Map() };
  const client = new LiveCanvasSource(process.env.CANVAS_BASE_URL!, process.env.CANVAS_API_TOKEN!);
  const subs = await client.getAll<{
    user_id: number;
    assignment_id: number;
    score: number | null;
    graded_at: string | null;
    workflow_state: string;
    grade?: string | null;
    rubric_assessment?: Record<string, { points?: number | null }> | null;
    assignment?: {
      name: string;
      points_possible: number | null;
      external_tool_tag_attributes?: { url?: string } | null;
      rubric?: { id: string; points: number | null; description?: string | null; outcome_id?: number | null }[] | null;
    };
  }>(`/courses/${canvasCourseId}/students/submissions`, {
    "student_ids[]": canvasUserIds,
    "include[]": ["assignment", "rubric_assessment"],
    workflow_state: "graded",
  });

  // Outcome results come wrapped ({ outcome_results, linked }), not as a bare
  // list, so page through them by hand. A course without Outcomes returns none.
  const outcomeResults: CanvasOutcomeResult[] = [];
  const titles = new Map<string, string>();
  try {
    let page = await client.request<{
      outcome_results: { score: number | null; possible: number | null; submitted_or_assessed_at: string | null; links: { user: string; learning_outcome: string } }[];
      linked?: { outcomes?: { id: number; title: string }[] };
    }>(`/courses/${canvasCourseId}/outcome_results`, { "user_ids[]": canvasUserIds, "include[]": "outcomes", per_page: 100 });
    for (let pages = 0; pages < 20; pages++) {
      for (const o of page.data.linked?.outcomes ?? []) titles.set(String(o.id), o.title);
      for (const r of page.data.outcome_results ?? [])
        outcomeResults.push({
          user_id: String(r.links.user),
          outcome_id: String(r.links.learning_outcome),
          outcome_title: "",
          score: r.score,
          possible: r.possible,
          submitted_or_assessed_at: r.submitted_or_assessed_at,
        });
      if (!page.next) break;
      page = await client.request(page.next);
    }
  } catch {
    // Outcomes not enabled for this course, or the token can't read them:
    // graded assignments still count.
  }

  // Each student's current score on each objective: Canvas's own rollup.
  const rollups: CanvasRollupScore[] = [];
  const outcomes = new Map<string, { ratings?: { description?: string | null; points?: number | null }[] | null; points_possible?: number | null }>();
  try {
    let page = await client.request<{
      rollups: { scores: { score: number | null; links: { outcome: string } }[]; links: { user: string } }[];
      linked?: { outcomes?: { id: number; ratings?: { description?: string; points?: number }[]; points_possible?: number }[] };
    }>(`/courses/${canvasCourseId}/outcome_rollups`, { "user_ids[]": canvasUserIds, "include[]": "outcomes", per_page: 100 });
    for (let pages = 0; pages < 20; pages++) {
      for (const o of page.data.linked?.outcomes ?? []) outcomes.set(String(o.id), { ratings: o.ratings, points_possible: o.points_possible });
      for (const r of page.data.rollups ?? [])
        for (const sc of r.scores ?? [])
          if (typeof sc.score === "number") rollups.push({ user_id: String(r.links.user), outcome_id: String(sc.links.outcome), score: sc.score });
      if (!page.next) break;
      page = await client.request(page.next);
    }
  } catch {
    // No outcomes in this course, or the token can't read rollups.
  }

  return {
    rollups,
    outcomes,
    submissions: subs.map((s) => ({
      user_id: String(s.user_id),
      assignment_id: String(s.assignment_id),
      assignment_name: s.assignment?.name ?? "Assignment",
      points_possible: s.assignment?.points_possible ?? null,
      score: s.score,
      graded_at: s.graded_at,
      workflow_state: s.workflow_state,
      tool_url: s.assignment?.external_tool_tag_attributes?.url ?? null,
      rubric: (s.assignment?.rubric ?? []).map((c) => ({ id: String(c.id), points: c.points, description: c.description ?? null, outcome_id: c.outcome_id ?? null })),
      rubric_assessment: s.rubric_assessment ?? null,
      grade: s.grade ?? null,
    })),
    outcomeResults: outcomeResults.map((r) => ({ ...r, outcome_title: titles.get(r.outcome_id) ?? "" })),
  };
}

/** A course's learning objectives as the teacher set them up in Canvas
 *  (Outcomes, with the group each sits in), and the course's name. */
export async function fetchCanvasOutcomes(canvasCourseId: string): Promise<{ courseName: string; links: CanvasOutcomeLink[] }> {
  const client = new LiveCanvasSource(process.env.CANVAS_BASE_URL!, process.env.CANVAS_API_TOKEN!);
  const { data: course } = await client.request<{ name: string }>(`/courses/${canvasCourseId}`);
  const links = await client.getAll<CanvasOutcomeLink>(`/courses/${canvasCourseId}/outcome_group_links`, { outcome_style: "full" });
  return { courseName: course.name, links };
}

/** A course's assignments by assignment group, names and points only (no
 *  student data), for picking which are learning objectives. */
export async function fetchCanvasAssignmentGroups(canvasCourseId: string): Promise<CanvasAssignmentGroup[]> {
  const client = new LiveCanvasSource(process.env.CANVAS_BASE_URL!, process.env.CANVAS_API_TOKEN!);
  return client.getAll<CanvasAssignmentGroup>(`/courses/${canvasCourseId}/assignment_groups`, { "include[]": "assignments" });
}
