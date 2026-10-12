"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSorClient } from "@/lib/sor/supabase-server";
import { parseCsv } from "@/lib/sor/importers/csv";
import { COURSE_SLUG, EVIDENCE_SOURCES, LEVELS, findStandard, type EvidenceSource, type Level } from "./config";
import { exportEvidence, parseExport, type RosterPerson } from "./exports";
import { sampleEvidence } from "./sample";
import { getMasteryConfig } from "./standard-sets";
import { fallbackDraftSteps, parseDraftSteps, readSavedSteps, type DraftStep } from "./next-steps";
import { nextStepsPayload } from "./next-steps-server";
import { draftMasteryNextSteps } from "@/lib/claude";
import { tidyPhrasing } from "@/lib/draft-style";
import { insertEvidence, recordRun, runCanvasSync } from "./sync";
import { getCourseBundle, requireMasteryTeacher, requireStudent, type CourseBundle, type MasteryCourse } from "./queries";

// Mastery Hub writes (Fizzy #37). Server Actions only, as the signed-in user;
// RLS and the triggers in 20261019000000_mastery_hub.sql decide what's
// allowed and log every change. Nothing here calls an AI.

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const fail = (e: unknown): { ok: false; error: string } => {
  const message = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e);
  if (message === "NEXT_REDIRECT" || message.startsWith("NEXT_REDIRECT;"))
    return { ok: false, error: "Your sign-in has expired. Sign in again in a new tab, then try again. Nothing on this screen is lost." };
  if (/mastery_records/.test(message))
    return { ok: false, error: "This student's family hasn't given the Mastery Hub consent yet. An admin records it on their pilot page." };
  return { ok: false, error: message };
};

const str = (v: FormDataEntryValue | null, max = 2000) => String(v ?? "").trim().slice(0, max);

/** Every hub page shows course data, so refresh them all after a write. */
function refresh() {
  revalidatePath("/mastery", "layout");
  revalidatePath("/me", "layout");
}

const slugTaken = (message: string) => /mastery_courses_slug|duplicate key/.test(message);
const isLevel = (v: unknown): v is Level => LEVELS.includes(v as Level);

function httpsLink(raw: string): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password) throw new Error();
    return u.toString().slice(0, 500);
  } catch {
    throw new Error("Links need to start with https:// (no sign-in details in them).");
  }
}

async function bundleOrThrow(courseId: string): Promise<CourseBundle> {
  const supabase = await getSorClient();
  const { data: course } = await supabase.from("mastery_courses").select("*").eq("id", courseId).maybeSingle();
  const bundle = course ? await getCourseBundle(course as MasteryCourse) : null;
  if (!bundle) throw new Error("That course isn't yours, or it's gone.");
  return bundle;
}

// ---------------------------------------------------------------- courses

export async function createCourseAction(formData: FormData): Promise<Result> {
  let slug: string;
  try {
    await requireMasteryTeacher();
    const title = str(formData.get("title"), 120);
    const key = str(formData.get("config_key"), 60);
    const canvas = str(formData.get("canvas_course_id"), 20);
    if (!title) return { ok: false, error: "Give the course a name." };
    const config = await getMasteryConfig(key);
    slug = str(formData.get("slug"), 40) || config.slug;
    if (!COURSE_SLUG.test(slug)) return { ok: false, error: "The address is letters, numbers and dashes, starting with a letter (e.g. APPhysics1 or APPhysics1-P3)." };
    if (canvas && !/^\d+$/.test(canvas)) return { ok: false, error: "The Canvas course id is the number in the course's Canvas address." };
    const supabase = await getSorClient();
    const { error } = await supabase.from("mastery_courses").insert({ title, slug, config_key: key, canvas_course_id: canvas || null });
    if (error) throw new Error(slugTaken(error.message) ? `/mastery/${slug} is already taken. Try ${slug}-P1, or add your initials.` : error.message);
  } catch (e) {
    return fail(e);
  }
  redirect(`/mastery/${slug}`);
}

/** The course page's settings: its address, Canvas course id, and the last
 *  unit the class has finished. Returns the (possibly new) address. */
export async function updateCourseSettingsAction(courseId: string, formData: FormData): Promise<Result<{ slug: string }>> {
  try {
    await requireMasteryTeacher();
    const slug = str(formData.get("slug"), 40);
    const canvas = str(formData.get("canvas_course_id"), 20);
    const finished = str(formData.get("finished_through"), 3);
    if (!COURSE_SLUG.test(slug)) return { ok: false, error: "The address is letters, numbers and dashes, starting with a letter." };
    if (canvas && !/^\d{1,20}$/.test(canvas)) return { ok: false, error: "The Canvas course id is the number in the course's Canvas address." };
    if (finished && !/^\d{1,2}$/.test(finished)) return { ok: false, error: "Pick a unit." };
    const supabase = await getSorClient();
    const { error } = await supabase
      .from("mastery_courses")
      .update({ slug, canvas_course_id: canvas || null, finished_through: finished === "" ? null : Number(finished) })
      .eq("id", courseId);
    if (error) throw new Error(slugTaken(error.message) ? `/mastery/${slug} is already taken.` : error.message);
    refresh();
    return { ok: true, slug };
  } catch (e) {
    return fail(e);
  }
}

/** A fictional AP Physics 1 class from the sample students, with seven
 *  weeks of made-up evidence, so the whole hub can be tried with no real
 *  student. */
export async function loadSampleCourseAction(): Promise<Result> {
  let slug = "";
  try {
    await requireMasteryTeacher();
    const supabase = await getSorClient();
    const { data: people } = await supabase.from("people").select("id").eq("is_sample", true).eq("stage", "enrolled").order("last_name");
    if (!people?.length) return { ok: false, error: "There are no fictional sample students yet. Load them on the pilot page first." };
    const config = await getMasteryConfig("ap-physics-1");
    // Each teacher can have their own sample: APPhysics1-Sample, -Sample2, …
    let id = "";
    for (let n = 1; n <= 20 && !id; n++) {
      slug = `${config.slug}-Sample${n === 1 ? "" : n}`;
      const { data, error } = await supabase
        .from("mastery_courses")
        .insert({ title: `${config.title} (sample)`, slug, config_key: config.key, is_sample: true, finished_through: 2 })
        .select("id")
        .single();
      if (data) id = data.id;
      else if (error && !slugTaken(error.message)) throw new Error(error.message);
    }
    if (!id) return { ok: false, error: "Too many sample courses already. Delete one first." };
    const { error: rosterError } = await supabase.from("mastery_roster").insert(people.map((p) => ({ course_id: id, person_id: p.id })));
    if (rosterError) throw new Error(rosterError.message);
    await insertEvidence(id, sampleEvidence(config, people.map((p) => p.id), new Date()));
  } catch (e) {
    return fail(e);
  }
  redirect(`/mastery/${slug}`);
}

export async function deleteSampleCourseAction(courseId: string): Promise<Result> {
  try {
    await requireMasteryTeacher();
    const supabase = await getSorClient();
    const { data, error } = await supabase.from("mastery_courses").delete().eq("id", courseId).eq("is_sample", true).select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) return { ok: false, error: "Only a sample course can be deleted here." };
  } catch (e) {
    return fail(e);
  }
  redirect("/mastery");
}

// ---------------------------------------------------------------- roster

export async function addToRosterAction(courseId: string, personIds: string[]): Promise<Result<{ added: number }>> {
  try {
    await requireMasteryTeacher();
    const ids = [...new Set(personIds)].filter((x) => /^[0-9a-f-]{36}$/.test(x)).slice(0, 200);
    if (!ids.length) return { ok: true, added: 0 };
    const supabase = await getSorClient();
    const { data, error } = await supabase
      .from("mastery_roster")
      .upsert(ids.map((person_id) => ({ course_id: courseId, person_id })), { onConflict: "course_id,person_id", ignoreDuplicates: true })
      .select("person_id");
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true, added: data?.length ?? 0 };
  } catch (e) {
    return fail(e);
  }
}

export async function removeFromRosterAction(courseId: string, personId: string): Promise<Result> {
  try {
    await requireMasteryTeacher();
    const supabase = await getSorClient();
    const { error } = await supabase.from("mastery_roster").delete().eq("course_id", courseId).eq("person_id", personId);
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Gives a student a sign-in with their school address, changes it, or
 *  turns it off (empty address). */
export async function setStudentAccountAction(courseId: string, personId: string, email: string): Promise<Result> {
  try {
    await requireMasteryTeacher();
    const supabase = await getSorClient();
    const address = email.trim().toLowerCase();
    if (!address) {
      const { error } = await supabase.from("student_accounts").update({ active: false }).eq("person_id", personId);
      if (error) throw new Error(error.message);
    } else {
      if (!/^[^\s@]+@pacificachristian\.org$/.test(address)) return { ok: false, error: "Use the student's @pacificachristian.org address." };
      const { error } = await supabase
        .from("student_accounts")
        .upsert({ person_id: personId, email: address, active: true }, { onConflict: "person_id" });
      if (error) throw new Error(/duplicate key/.test(error.message) ? "That address is already another student's sign-in." : error.message);
    }
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- evidence

/** The oral exam / observation updater: one level on one standard. */
export async function recordLevelAction(input: {
  courseId: string;
  personId: string;
  standardCode: string;
  level: string;
  source: string;
  note: string;
}): Promise<Result> {
  try {
    await requireMasteryTeacher();
    const bundle = await bundleOrThrow(input.courseId);
    const standard = findStandard(bundle.config, input.standardCode);
    if (!standard) return { ok: false, error: "Pick a standard." };
    if (!isLevel(input.level)) return { ok: false, error: "Pick a level." };
    if (input.source !== "oral" && input.source !== "observation") return { ok: false, error: "Oral exam or observation?" };
    const supabase = await getSorClient();
    const { error } = await supabase.from("mastery_evidence").insert({
      course_id: input.courseId,
      person_id: input.personId,
      standard_code: standard.code,
      source: input.source,
      title: `${input.source === "oral" ? "Oral exam" : "Observation"}: ${standard.title}`.slice(0, 200),
      level: input.level,
      note: input.note.trim().slice(0, 2000) || null,
    });
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Any other single piece of evidence, typed in by the teacher. */
export async function addEvidenceAction(courseId: string, personId: string, formData: FormData): Promise<Result> {
  try {
    await requireMasteryTeacher();
    const bundle = await bundleOrThrow(courseId);
    const standard = findStandard(bundle.config, str(formData.get("standard"), 20));
    if (!standard) return { ok: false, error: "Pick a standard." };
    const source = str(formData.get("source"), 20) as EvidenceSource;
    if (!EVIDENCE_SOURCES.includes(source)) return { ok: false, error: "Pick where it came from." };
    const title = str(formData.get("title"), 200);
    if (!title) return { ok: false, error: "What was it? Give it a name." };
    const score = str(formData.get("score"), 20);
    const max = str(formData.get("max"), 20);
    const level = str(formData.get("level"), 20);
    const hasScore = score !== "" && max !== "";
    if (!hasScore && !isLevel(level)) return { ok: false, error: "Give a score out of a total, or a level." };
    if (hasScore && !(Number(score) >= 0 && Number(max) > 0)) return { ok: false, error: "The score needs to be a number out of a total above zero." };
    const supabase = await getSorClient();
    const { error } = await supabase.from("mastery_evidence").insert({
      course_id: courseId,
      person_id: personId,
      standard_code: standard.code,
      source,
      title,
      score: hasScore ? Number(score) : null,
      max_score: hasScore ? Number(max) : null,
      level: isLevel(level) ? level : null,
      note: str(formData.get("note")) || null,
      link: httpsLink(str(formData.get("link"), 500)),
    });
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteEvidenceAction(courseId: string, evidenceId: string): Promise<Result> {
  try {
    await requireMasteryTeacher();
    const supabase = await getSorClient();
    const { data, error } = await supabase.from("mastery_evidence").delete().eq("id", evidenceId).eq("course_id", courseId).select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) return { ok: false, error: "That piece of evidence is already gone." };
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- sources

function rosterPeople(bundle: CourseBundle): RosterPerson[] {
  return bundle.roster.map((s) => ({ person_id: s.id, first_name: s.first_name, last_name: s.last_name, preferred_name: s.preferred_name, email: s.email }));
}

export interface ExportPreview {
  layout: "long" | "wide";
  rows: number;
  evidence: number;
  students: number;
  unmatched: string[];
  unmappedTitles: string[];
  skipped: string[];
  sampleRows: { student: string; title: string; standards: string; result: string }[];
}

const EXPORT_SOURCES = ["ap_classroom", "khan", "other"] as const;
const MAX_EXPORT = 900_000; // under the 1 MB Server Action body limit

function readExport(bundle: CourseBundle, csvText: string, source: string, fallback: string) {
  if (!EXPORT_SOURCES.includes(source as (typeof EXPORT_SOURCES)[number])) throw new Error("Pick where the report is from.");
  if (csvText.length > MAX_EXPORT) throw new Error("That file is too big (900 KB at most). Export one class at a time.");
  const parsed = parseExport(parseCsv(csvText), bundle.config);
  if (!parsed.rows.length) throw new Error("No scores or mastery levels found. Is it the CSV export, with a student column?");
  const fallbackCode = fallback && findStandard(bundle.config, fallback) ? fallback : null;
  const { evidence, unmatched } = exportEvidence(parsed, rosterPeople(bundle), source as EvidenceSource, fallbackCode, new Date().toISOString());
  return { parsed, evidence, unmatched };
}

/** Step 1 of the drop-in: read the report and show what would be saved.
 *  Nothing is written. Names in the report stay on this screen. */
export async function previewExportAction(courseId: string, source: string, csvText: string, fallback: string): Promise<Result<{ preview: ExportPreview }>> {
  try {
    await requireMasteryTeacher();
    const bundle = await bundleOrThrow(courseId);
    const { parsed, evidence, unmatched } = readExport(bundle, csvText, source, fallback);
    const names = new Map(bundle.roster.map((s) => [s.id, `${s.preferred_name || s.first_name} ${s.last_name}`]));
    return {
      ok: true,
      preview: {
        layout: parsed.layout,
        rows: parsed.rows.length,
        evidence: evidence.length,
        students: new Set(evidence.map((e) => e.person_id)).size,
        unmatched: unmatched.slice(0, 30),
        unmappedTitles: parsed.unmappedTitles.slice(0, 30),
        skipped: parsed.skipped,
        sampleRows: evidence.slice(0, 8).map((e) => ({
          student: names.get(e.person_id) ?? "",
          title: e.title,
          standards: e.standard_code,
          result: e.level ?? `${e.score}/${e.max_score}`,
        })),
      },
    };
  } catch (e) {
    return fail(e);
  }
}

/** Step 2: save it. Re-reads the same text, so what's saved is what was
 *  previewed. */
export async function saveExportAction(courseId: string, source: string, csvText: string, fallback: string): Promise<Result<{ saved: number }>> {
  try {
    const staff = await requireMasteryTeacher();
    const bundle = await bundleOrThrow(courseId);
    if (bundle.sources.find((s) => s.source === source)?.paused) return { ok: false, error: "This source is paused. Turn it back on first." };
    const { evidence, unmatched } = readExport(bundle, csvText, source, fallback);
    const saved = await insertEvidence(courseId, evidence);
    const summary = `${saved} new piece${saved === 1 ? "" : "s"} of evidence from a ${source === "khan" ? "Khan Academy" : source === "ap_classroom" ? "AP Classroom" : "gradebook"} report${unmatched.length ? `; ${unmatched.length} row name${unmatched.length === 1 ? "" : "s"} not on the roster` : ""}.`;
    if (source === "ap_classroom" || source === "khan") await recordRun(courseId, source, summary, staff.user_id);
    refresh();
    return { ok: true, saved };
  } catch (e) {
    return fail(e);
  }
}

/** Pulls graded work and Outcome results from Canvas. A sample course adds
 *  one fictional quiz instead, so the demo shows the hub reacting. */
export async function syncCanvasAction(courseId: string): Promise<Result<{ summary: string }>> {
  try {
    const staff = await requireMasteryTeacher();
    const bundle = await bundleOrThrow(courseId);
    const summary = await runCanvasSync(bundle, staff.user_id);
    refresh();
    return { ok: true, summary };
  } catch (e) {
    return fail(e);
  }
}

export async function setSourcePausedAction(courseId: string, source: string, paused: boolean): Promise<Result> {
  try {
    await requireMasteryTeacher();
    if (!["canvas", "ap_classroom", "khan"].includes(source)) return { ok: false, error: "Unknown source." };
    const supabase = await getSorClient();
    const { error } = await supabase.from("mastery_sources").upsert({ course_id: courseId, source, paused }, { onConflict: "course_id,source" });
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- requests

/** The teacher answers a student's request. Accepting sent-in work saves it
 *  as evidence at the level the teacher picks. */
export async function answerRequestAction(input: { courseId: string; requestId: string; status: string; response: string; level?: string }): Promise<Result> {
  try {
    await requireMasteryTeacher();
    if (!["scheduled", "accepted", "declined", "done"].includes(input.status)) return { ok: false, error: "Unknown answer." };
    const supabase = await getSorClient();
    const { data: req } = await supabase.from("mastery_requests").select("*").eq("id", input.requestId).eq("course_id", input.courseId).maybeSingle();
    if (!req) return { ok: false, error: "That request is gone." };
    if (input.status === "accepted") {
      if (req.kind !== "evidence") return { ok: false, error: "Only sent-in work is accepted as evidence." };
      if (!isLevel(input.level)) return { ok: false, error: "Pick the level this work shows." };
      const bundle = await bundleOrThrow(input.courseId);
      const standard = findStandard(bundle.config, req.standard_code);
      const { error } = await supabase.from("mastery_evidence").insert({
        course_id: input.courseId,
        person_id: req.person_id,
        standard_code: req.standard_code,
        source: "student",
        title: `Sent in: ${(req.message as string).slice(0, 80) || standard?.title || req.standard_code}`.slice(0, 200),
        level: input.level,
        note: input.response.trim().slice(0, 2000) || null,
        link: req.link,
        external_key: `request:${req.id}`,
      });
      if (error) throw new Error(error.message);
    }
    const { error } = await supabase
      .from("mastery_requests")
      .update({ status: input.status, response: input.response.trim().slice(0, 1000) || null })
      .eq("id", input.requestId);
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** A signed-in student asks for an oral exam, or sends in work. */
export async function studentRequestAction(courseId: string, formData: FormData): Promise<Result> {
  try {
    const student = await requireStudent();
    const kind = str(formData.get("kind"), 20);
    if (kind !== "oral_exam" && kind !== "evidence") return { ok: false, error: "Unknown request." };
    const supabase = await getSorClient();
    const { data: course } = await supabase.from("mastery_courses").select("config_key").eq("id", courseId).maybeSingle();
    if (!course) return { ok: false, error: "That course isn't one of yours." };
    const standard = findStandard(await getMasteryConfig(course.config_key), str(formData.get("standard"), 20));
    if (!standard) return { ok: false, error: "Pick which standard it's for." };
    const message = str(formData.get("message"), 1000);
    const link = httpsLink(str(formData.get("link"), 500));
    if (kind === "evidence" && !message && !link) return { ok: false, error: "Say what you did, or add a link to it." };
    const { error } = await supabase.from("mastery_requests").insert({
      course_id: courseId,
      person_id: student.personId,
      standard_code: standard.code,
      kind,
      message,
      link,
    });
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- next steps

/** Draft next steps for one student: with Claude when allowed (a sample
 *  student, or AI_REAL_STUDENTS=on with ai_drafting consent), otherwise the
 *  rule-based steps in plain words. Always saved as a draft the teacher
 *  edits and shares. */
export async function draftNextStepsAction(courseId: string, personId: string): Promise<Result<{ usedAi: boolean }>> {
  try {
    const staff = await requireMasteryTeacher();
    const bundle = await bundleOrThrow(courseId);
    const student = bundle.roster.find((s) => s.id === personId);
    if (!student) return { ok: false, error: "That student isn't on this course's roster." };
    const supabase = await getSorClient();
    const { data: consents } = await supabase.from("consents").select("scope, revoked_at").eq("person_id", personId);
    const aiAllowed =
      student.is_sample ||
      (process.env.AI_REAL_STUDENTS?.trim() === "on" && (consents ?? []).some((c) => c.scope === "ai_drafting" && !c.revoked_at));
    const { input, links, anon, text } = nextStepsPayload(bundle, personId, staff.display_name);
    let steps: DraftStep[] = [];
    let usedAi = false;
    if (aiAllowed && input.candidates.length) {
      anon.assertNoNames(text);
      const { parsed, usedFallback } = await draftMasteryNextSteps(JSON.stringify(input));
      if (!usedFallback) {
        steps = parseDraftSteps(parsed, input, links).map((s) => ({ ...s, text: tidyPhrasing(anon.restore(s.text)) }));
        usedAi = steps.length > 0;
      }
    }
    if (!steps.length) steps = fallbackDraftSteps(input, links);
    if (!steps.length) return { ok: false, error: "Nothing to suggest yet: there's no evidence in a unit the class has reached." };
    const { error } = await supabase.from("mastery_next_steps").insert({ course_id: courseId, person_id: personId, steps, used_ai: usedAi });
    if (error) throw new Error(/ai_drafting/.test(error.message) ? "This student's family hasn't given AI drafting consent." : error.message);
    refresh();
    return { ok: true, usedAi };
  } catch (e) {
    return fail(e);
  }
}

export async function saveNextStepsAction(id: string, steps: unknown): Promise<Result> {
  try {
    await requireMasteryTeacher();
    const clean = readSavedSteps(steps).filter((s) => s.text.trim());
    if (!clean.length) return { ok: false, error: "Keep at least one step, or discard the draft." };
    const supabase = await getSorClient();
    const { data, error } = await supabase.from("mastery_next_steps").update({ steps: clean }).eq("id", id).eq("status", "draft").select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) return { ok: false, error: "That draft is already shared or gone." };
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Share a draft with the student, signed with the teacher's own name. */
export async function shareNextStepsAction(id: string): Promise<Result> {
  try {
    await requireMasteryTeacher();
    const supabase = await getSorClient();
    const { data, error } = await supabase.from("mastery_next_steps").update({ status: "shared" }).eq("id", id).eq("status", "draft").select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) return { ok: false, error: "That draft is already shared or gone." };
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function discardNextStepsAction(id: string): Promise<Result> {
  try {
    await requireMasteryTeacher();
    const supabase = await getSorClient();
    const { error } = await supabase.from("mastery_next_steps").delete().eq("id", id).eq("status", "draft");
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
