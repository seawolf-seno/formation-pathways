import "server-only";
import { LiveCanvasSource } from "@/lib/integrations/canvas";
import type { CanvasOutcomeResult, CanvasSubmission } from "./canvas-map";

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
): Promise<{ submissions: CanvasSubmission[]; outcomeResults: CanvasOutcomeResult[] }> {
  if (!canvasUserIds.length) return { submissions: [], outcomeResults: [] };
  const client = new LiveCanvasSource(process.env.CANVAS_BASE_URL!, process.env.CANVAS_API_TOKEN!);
  const subs = await client.getAll<{
    user_id: number;
    assignment_id: number;
    score: number | null;
    graded_at: string | null;
    workflow_state: string;
    assignment?: { name: string; points_possible: number | null; external_tool_tag_attributes?: { url?: string } | null };
  }>(`/courses/${canvasCourseId}/students/submissions`, {
    "student_ids[]": canvasUserIds,
    "include[]": ["assignment"],
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

  return {
    submissions: subs.map((s) => ({
      user_id: String(s.user_id),
      assignment_id: String(s.assignment_id),
      assignment_name: s.assignment?.name ?? "Assignment",
      points_possible: s.assignment?.points_possible ?? null,
      score: s.score,
      graded_at: s.graded_at,
      workflow_state: s.workflow_state,
      tool_url: s.assignment?.external_tool_tag_attributes?.url ?? null,
    })),
    outcomeResults: outcomeResults.map((r) => ({ ...r, outcome_title: titles.get(r.outcome_id) ?? "" })),
  };
}
