import "server-only";
import { getSorClient } from "@/lib/sor/supabase-server";
import { masterySummary, type MasterySummary } from "./rules";
import { getMasteryConfig } from "./standard-sets";

/** A student's mastery courses in words, for their pilot page and their
 *  Pathway draft. RLS shows only courses the signed-in staff member teaches
 *  (or all, for an admin); [] before the hub's migration. No scores leave. */
export async function masteryForPerson(personId: string): Promise<MasterySummary[]> {
  const supabase = await getSorClient();
  const { data: rows, error } = await supabase
    .from("mastery_roster")
    .select("course_id, mastery_courses(title, config_key, is_sample)")
    .eq("person_id", personId);
  if (error || !rows?.length) return [];
  const { data: evidence } = await supabase
    .from("mastery_evidence")
    .select("course_id, standard_code, source, score, max_score, level, occurred_at, created_at")
    .eq("person_id", personId);
  const out: MasterySummary[] = [];
  for (const r of rows) {
    const c = (Array.isArray(r.mastery_courses) ? r.mastery_courses[0] : r.mastery_courses) as { title: string; config_key: string } | null;
    if (!c) continue;
    try {
      const config = await getMasteryConfig(c.config_key);
      const pieces = (evidence ?? [])
        .filter((e) => e.course_id === r.course_id)
        .map((e) => ({ ...e, score: e.score === null ? null : Number(e.score), max_score: e.max_score === null ? null : Number(e.max_score) }));
      out.push(masterySummary(config, c.title, pieces));
    } catch {
      // A broken standard set leaves that course out; its page says why.
    }
  }
  return out;
}
