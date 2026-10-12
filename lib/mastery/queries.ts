import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getSorClient, isSorConfigured } from "@/lib/sor/supabase-server";
import { requireStaff } from "@/lib/sor/queries";
import { tableNotThereYet } from "@/lib/sor/class-reflections";
import type { Person, StaffMember } from "@/lib/sor/types";
import { COURSE_SLUG, type EvidenceSource, type Level, type MasteryConfig } from "./config";
import { getMasteryConfig, listStandardSets } from "./standard-sets";

// Mastery Hub reads (Fizzy #37). All through the signed-in user's session:
// RLS gives a teacher only their own courses and a student only their own
// evidence (supabase/migrations/20261019000000_mastery_hub.sql).

export interface MasteryCourse {
  id: string;
  title: string;
  /** Its address: /mastery/<slug>, /me/<slug>. */
  slug: string;
  finished_through: number | null;
  config_key: string;
  teacher_id: string;
  canvas_course_id: string | null;
  is_sample: boolean;
  created_at: string;
}

export interface Evidence {
  id: string;
  course_id: string;
  person_id: string;
  standard_code: string;
  source: EvidenceSource;
  title: string;
  score: number | null;
  max_score: number | null;
  level: Level | null;
  note: string | null;
  link: string | null;
  occurred_at: string;
  created_at: string;
}

export interface MasteryRequest {
  id: string;
  course_id: string;
  person_id: string;
  standard_code: string;
  kind: "oral_exam" | "evidence";
  message: string;
  link: string | null;
  status: "open" | "scheduled" | "accepted" | "declined" | "done";
  response: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface SourceState {
  source: "canvas" | "ap_classroom" | "khan";
  paused: boolean;
  last_run_at: string | null;
  last_summary: string | null;
}

export interface RosterStudent extends Pick<Person, "id" | "first_name" | "last_name" | "preferred_name" | "is_sample"> {
  email: string | null;
  account_active: boolean;
}

export interface LogEntry {
  id: number;
  person_id: string | null;
  actor: string | null;
  action: string;
  detail: Record<string, unknown>;
  at: string;
}

/** Evidence numbers come back from PostgREST as strings (numeric). */
const toEvidence = (e: Record<string, unknown>): Evidence => ({
  ...(e as unknown as Evidence),
  score: e.score === null ? null : Number(e.score),
  max_score: e.max_score === null ? null : Number(e.max_score),
});

/** The standard sets a new course can use (built-in files and the hub's own). */
export async function masteryConfigs(): Promise<{ key: string; title: string; slug: string }[]> {
  return (await listStandardSets()).filter((s) => !s.problem).map(({ key, title, slug }) => ({ key, title, slug }));
}

/** Teachers and admins run mastery courses. */
export async function requireMasteryTeacher(): Promise<StaffMember> {
  const staff = await requireStaff();
  if (staff.role !== "admin" && staff.role !== "teacher") redirect("/capture");
  return staff;
}

/** null when the hub's migration isn't applied yet (the page says so). */
export async function getMyCourses(): Promise<(MasteryCourse & { students: number; waiting: number })[] | null> {
  const supabase = await getSorClient();
  const { data, error } = await supabase
    .from("mastery_courses")
    .select("*, mastery_roster(count), mastery_requests(status)")
    .order("created_at");
  if (tableNotThereYet(error)) return null;
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => {
    const { mastery_roster, mastery_requests, ...course } = c as MasteryCourse & {
      mastery_roster: { count: number }[];
      mastery_requests: { status: string }[];
    };
    return {
      ...course,
      students: mastery_roster?.[0]?.count ?? 0,
      waiting: (mastery_requests ?? []).filter((r) => r.status === "open").length,
    };
  });
}

export interface CourseBundle {
  course: MasteryCourse;
  config: MasteryConfig;
  roster: RosterStudent[];
  evidence: Evidence[];
  requests: MasteryRequest[];
  sources: SourceState[];
}

/** A course by its address, in any capitalization (RLS: only courses the
 *  signed-in user may see). Pages redirect to the canonical spelling. */
export async function findCourse(slug: string): Promise<MasteryCourse | null> {
  const s = decodeURIComponent(slug);
  if (!COURSE_SLUG.test(s)) return null;
  const supabase = await getSorClient();
  // ilike is a case-insensitive exact match here: the address rule allows no % or _.
  const { data } = await supabase.from("mastery_courses").select("*").ilike("slug", s).maybeSingle();
  return (data as MasteryCourse) ?? null;
}

export async function getCourseBundle(slugOrCourse: string | MasteryCourse): Promise<CourseBundle | null> {
  const supabase = await getSorClient();
  const course = typeof slugOrCourse === "string" ? await findCourse(slugOrCourse) : slugOrCourse;
  if (!course) return null;
  const courseId = course.id;
  const [roster, evidence, requests, sources] = await Promise.all([
    supabase
      .from("mastery_roster")
      .select("person_id, people(id, first_name, last_name, preferred_name, is_sample, student_accounts(email, active))")
      .eq("course_id", courseId),
    supabase.from("mastery_evidence").select("*").eq("course_id", courseId).order("occurred_at", { ascending: false }).limit(10000),
    supabase.from("mastery_requests").select("*").eq("course_id", courseId).order("created_at", { ascending: false }).limit(500),
    supabase.from("mastery_sources").select("source, paused, last_run_at, last_summary").eq("course_id", courseId),
  ]);
  type Row = { people: Pick<Person, "id" | "first_name" | "last_name" | "preferred_name" | "is_sample"> & { student_accounts: { email: string; active: boolean } | { email: string; active: boolean }[] | null } };
  const students = ((roster.data ?? []) as unknown as Row[])
    .filter((r) => r.people)
    .map(({ people: p }) => {
      const account = Array.isArray(p.student_accounts) ? p.student_accounts[0] : p.student_accounts;
      return {
        id: p.id,
        first_name: p.first_name,
        last_name: p.last_name,
        preferred_name: p.preferred_name,
        is_sample: p.is_sample,
        email: account?.email ?? null,
        account_active: account?.active ?? false,
      };
    })
    .sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name));
  return {
    course: course as MasteryCourse,
    config: await getMasteryConfig((course as MasteryCourse).config_key),
    roster: students,
    evidence: (evidence.data ?? []).map(toEvidence),
    requests: (requests.data ?? []) as MasteryRequest[],
    sources: (sources.data ?? []) as SourceState[],
  };
}

export async function getCourseLog(courseId: string, limit = 300): Promise<LogEntry[]> {
  const supabase = await getSorClient();
  const { data } = await supabase
    .from("mastery_log")
    .select("id, person_id, actor, action, detail, at")
    .eq("course_id", courseId)
    .order("at", { ascending: false })
    .limit(limit);
  return (data ?? []) as LogEntry[];
}

/** Staff names for the log (admins read every staff row; a teacher reads
 *  their own, so other names show as "Another staff member"). */
export async function staffNames(): Promise<Map<string, string>> {
  const supabase = await getSorClient();
  const { data } = await supabase.from("staff").select("user_id, display_name");
  return new Map((data ?? []).map((s) => [s.user_id as string, s.display_name as string]));
}

/** People a teacher can add to a roster: everyone in the pilot they can see
 *  (sample courses: sample people only). */
export async function addablePeople(sampleOnly: boolean): Promise<Pick<Person, "id" | "first_name" | "last_name" | "preferred_name" | "is_sample">[]> {
  const supabase = await getSorClient();
  let q = supabase.from("people").select("id, first_name, last_name, preferred_name, is_sample").in("stage", ["enrolled", "admitted"]);
  if (sampleOnly) q = q.eq("is_sample", true);
  const { data } = await q.order("last_name");
  return data ?? [];
}

// ---------------------------------------------------------------- students

export interface SignedInStudent {
  personId: string;
  firstName: string;
  lastName: string;
  email: string;
  isSample: boolean;
}

/** The signed-in student, or the right redirect: staff go to their own
 *  pages, anyone else back to sign-in with a plain message. */
export async function requireStudent(): Promise<SignedInStudent> {
  await connection();
  if (!isSorConfigured()) redirect("/login");
  const supabase = await getSorClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/me");
  const { data: account, error } = await supabase
    .from("student_accounts")
    .select("person_id, email, active, people(first_name, last_name, preferred_name, is_sample)")
    .eq("email", (user.email ?? "").toLowerCase())
    .maybeSingle();
  if (!account || error) {
    const { data: staff } = await supabase.from("staff").select("active").eq("user_id", user.id).maybeSingle();
    if (staff?.active) redirect("/mastery");
    redirect("/login?error=no-student-account");
  }
  const p = (Array.isArray(account.people) ? account.people[0] : account.people) as Pick<Person, "first_name" | "last_name" | "preferred_name" | "is_sample">;
  return {
    personId: account.person_id as string,
    firstName: p?.preferred_name || p?.first_name || "",
    lastName: p?.last_name ?? "",
    email: account.email as string,
    isSample: Boolean(p?.is_sample),
  };
}

export async function getStudentCourses(personId: string): Promise<MasteryCourse[]> {
  const supabase = await getSorClient();
  const { data } = await supabase.from("mastery_roster").select("mastery_courses(*)").eq("person_id", personId);
  return (data ?? [])
    .map((r) => (Array.isArray(r.mastery_courses) ? r.mastery_courses[0] : r.mastery_courses) as MasteryCourse | null)
    .filter((c): c is MasteryCourse => Boolean(c));
}

export async function getStudentCourse(slug: string, personId: string) {
  const supabase = await getSorClient();
  const course = await findCourse(slug);
  if (!course) return null;
  const courseId = course.id;
  const [evidence, requests] = await Promise.all([
    supabase.from("mastery_evidence").select("*").eq("course_id", courseId).eq("person_id", personId).order("occurred_at", { ascending: false }),
    supabase.from("mastery_requests").select("*").eq("course_id", courseId).eq("person_id", personId).order("created_at", { ascending: false }).limit(50),
  ]);
  return {
    course: course as MasteryCourse,
    config: await getMasteryConfig((course as MasteryCourse).config_key),
    evidence: (evidence.data ?? []).map(toEvidence),
    requests: (requests.data ?? []) as MasteryRequest[],
  };
}

/** For the person page: their mastery courses as level counts only. */
export async function masterySummaryFor(personId: string) {
  const supabase = await getSorClient();
  const { data: rows, error } = await supabase.from("mastery_roster").select("course_id, mastery_courses(*)").eq("person_id", personId);
  if (error || !rows?.length) return [];
  const { data: evidence } = await supabase.from("mastery_evidence").select("*").eq("person_id", personId);
  const out: { course: MasteryCourse; config: MasteryConfig; evidence: Evidence[] }[] = [];
  for (const r of rows) {
    const course = (Array.isArray(r.mastery_courses) ? r.mastery_courses[0] : r.mastery_courses) as MasteryCourse | null;
    if (!course) continue;
    try {
      out.push({ course, config: await getMasteryConfig(course.config_key), evidence: (evidence ?? []).filter((e) => e.course_id === course.id).map(toEvidence) });
    } catch {
      // A broken standard set hides that course here; its own page says why.
    }
  }
  return out;
}

export interface SavedNextSteps {
  id: string;
  steps: import("./next-steps").DraftStep[];
  used_ai: boolean;
  status: "draft" | "shared";
  shared_by_name: string | null;
  shared_at: string | null;
  created_at: string;
}

/** The newest next steps for a student in a course: any status for their
 *  teacher; for the student, RLS returns only shared ones. null before the
 *  migration or when there are none. */
export async function latestNextSteps(courseId: string, personId: string, sharedOnly = false): Promise<SavedNextSteps | null> {
  const supabase = await getSorClient();
  let q = supabase
    .from("mastery_next_steps")
    .select("id, steps, used_ai, status, shared_by_name, shared_at, created_at")
    .eq("course_id", courseId)
    .eq("person_id", personId);
  if (sharedOnly) q = q.eq("status", "shared");
  const { data, error } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  const { readSavedSteps } = await import("./next-steps");
  return { ...(data as SavedNextSteps), steps: readSavedSteps(data.steps) };
}
