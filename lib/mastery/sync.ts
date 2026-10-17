import "server-only";
import { getSorClient } from "@/lib/sor/supabase-server";
import type { EvidenceDraft } from "./exports";
import { assignmentGrades, canvasEvidence, rollupGrades } from "./canvas-map";
import { assignmentCodes, outcomeCodes } from "./canvas-outcomes";
import { fetchCanvasMastery, isLiveCanvasConfigured } from "./canvas";
import { sampleCanvasRun } from "./sample";
import type { CourseBundle } from "./queries";

// Saving imported evidence and running a course's Canvas import. Not a
// "use server" file on purpose: these take arguments a browser must never
// choose, so only Server Actions and pages call them.

/** Inserts evidence, skipping rows whose import key is already saved. */
export async function insertEvidence(courseId: string, rows: EvidenceDraft[]): Promise<number> {
  if (!rows.length) return 0;
  const supabase = await getSorClient();
  const { data: existing } = await supabase
    .from("mastery_evidence")
    .select("person_id, standard_code, external_key")
    .eq("course_id", courseId)
    .not("external_key", "is", null)
    .limit(20000);
  const seen = new Set((existing ?? []).map((e) => `${e.person_id}|${e.standard_code}|${e.external_key}`));
  const fresh = rows.filter((r) => {
    const k = `${r.person_id}|${r.standard_code}|${r.external_key}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  for (let i = 0; i < fresh.length; i += 500) {
    const { error } = await supabase.from("mastery_evidence").insert(fresh.slice(i, i + 500).map((r) => ({ ...r, course_id: courseId })));
    if (error) throw new Error(error.message);
  }
  return fresh.length;
}

export async function recordRun(courseId: string, source: "canvas" | "ap_classroom" | "khan", summary: string, actor: string) {
  const supabase = await getSorClient();
  await supabase
    .from("mastery_sources")
    .upsert({ course_id: courseId, source, last_run_at: new Date().toISOString(), last_summary: summary.slice(0, 500) }, { onConflict: "course_id,source" });
  await supabase.from("mastery_log").insert({ course_id: courseId, actor, action: `import_${source}`, detail: { summary: summary.slice(0, 500) } });
}

/** Shared by the button and the course page's "check when opened". */
export async function runCanvasSync(bundle: CourseBundle, actor: string): Promise<string> {
  const { course } = bundle;
  if (bundle.sources.find((s) => s.source === "canvas")?.paused) throw new Error("Canvas is paused for this course.");
  let summary: string;
  if (course.is_sample) {
    const runs = bundle.evidence.filter((e) => e.source === "canvas" && /\(\d{4}-\d{2}-\d{2}\)$/.test(e.title)).length;
    const saved = await insertEvidence(course.id, sampleCanvasRun(bundle.roster.map((s) => s.id), new Date(), runs));
    summary = saved ? `Sample: ${saved} new fictional quiz grades.` : "Sample: today's fictional quiz is already in.";
  } else {
    if (!isLiveCanvasConfigured()) throw new Error("Canvas isn't connected yet (CANVAS_BASE_URL and CANVAS_API_TOKEN). See docs/mastery-hub.md.");
    if (!course.canvas_course_id) throw new Error("Add this course's Canvas course id first.");
    const supabase = await getSorClient();
    const { data: ids } = await supabase
      .from("external_ids")
      .select("person_id, external_id")
      .eq("system", "canvas")
      .in("person_id", bundle.roster.map((s) => s.id));
    const personByCanvasId = new Map((ids ?? []).map((r) => [String(r.external_id), r.person_id as string]));
    const codes = outcomeCodes(bundle.config);
    const objectiveAssignments = assignmentCodes(bundle.config);
    const { submissions, outcomeResults, rollups, outcomes } = await fetchCanvasMastery(course.canvas_course_id, [...personByCanvasId.keys()]);
    const { evidence, unmapped } = canvasEvidence(submissions, outcomeResults, personByCanvasId, bundle.config, new Date().toISOString(), codes, objectiveAssignments);
    const saved = await insertEvidence(course.id, evidence);
    const grades = [...rollupGrades(rollups, outcomes, personByCanvasId, codes), ...assignmentGrades(submissions, personByCanvasId, objectiveAssignments)];
    if (grades.length) {
      const { error } = await supabase
        .from("mastery_objective_grades")
        .upsert(grades.map((g) => ({ ...g, course_id: course.id, updated_at: new Date().toISOString() })), { onConflict: "course_id,person_id,standard_code" });
      if (error && !/does not exist|schema cache/.test(error.message)) throw new Error(error.message);
    }
    const missing = bundle.roster.length - personByCanvasId.size;
    summary =
      `${saved} new piece${saved === 1 ? "" : "s"} of evidence.` +
      (unmapped.length ? ` ${unmapped.length} Canvas item${unmapped.length === 1 ? "" : "s"} name no standard (put a code like [2.5] in the title).` : "") +
      (missing > 0 ? ` ${missing} student${missing === 1 ? " has" : "s have"} no Canvas id yet.` : "");
  }
  await recordRun(course.id, "canvas", summary, actor);
  return summary;
}


/** Canvas is checked when a course is opened, at most this often. */
const CANVAS_EVERY_MS = 6 * 60 * 60 * 1000;

/** Near-zero effort: a real course with Canvas connected checks Canvas when
 *  its page opens, if the last check is older than six hours and Canvas
 *  isn't paused. Returns what happened (or why it couldn't), or null when
 *  no check was due. Never throws: the page still opens. */
export async function syncCanvasIfDue(bundle: CourseBundle, actor: string): Promise<string | null> {
  const canvas = bundle.sources.find((s) => s.source === "canvas");
  const due =
    !bundle.course.is_sample &&
    Boolean(bundle.course.canvas_course_id) &&
    isLiveCanvasConfigured() &&
    !canvas?.paused &&
    (!canvas?.last_run_at || Date.now() - new Date(canvas.last_run_at).getTime() > CANVAS_EVERY_MS);
  if (!due) return null;
  try {
    return await runCanvasSync(bundle, actor);
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
