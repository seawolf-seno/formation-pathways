import { db } from "./db";
import { getSupabase, isSupabaseConfigured } from "./supabase";
import { daysSince } from "./format";
import type {
  Applicant,
  ApplicantAnswer,
  ClassWithStats,
  Course,
  CourseSkill,
  CourseWithStats,
  FormationTag,
  GeneratedPathwaysResult,
  Observation,
  Portrait,
  SchoolClass,
  SkillEvidenceItem,
  SkillSnapshot,
  Student,
  StudentWithStats,
} from "./types";

const ATTENTION_THRESHOLD_DAYS = 45;

interface ObservationRow {
  id: number;
  student_id: number;
  author: string;
  raw_text: string;
  clean_text: string;
  tags: string;
  discipline_flag: string | null;
  source: string | null;
  created_at: string;
}

function parseObservation(row: ObservationRow): Observation {
  return {
    ...row,
    tags: JSON.parse(row.tags) as FormationTag[],
    source: (row.source as Observation["source"]) ?? "voice",
  };
}

function attachStats(students: Student[]): StudentWithStats[] {
  const lastObservedStmt = db.prepare(
    "SELECT MAX(created_at) as last FROM observations WHERE student_id = ?"
  );
  const countStmt = db.prepare(
    "SELECT COUNT(*) as count FROM observations WHERE student_id = ?"
  );

  const withStats: StudentWithStats[] = students.map((s) => {
    const { last } = lastObservedStmt.get(s.id) as { last: string | null };
    const { count } = countStmt.get(s.id) as { count: number };
    const days_since_observed = last ? daysSince(last) : null;
    return {
      ...s,
      observation_count: count,
      last_observed_at: last,
      days_since_observed,
      needs_attention:
        days_since_observed === null ||
        days_since_observed >= ATTENTION_THRESHOLD_DAYS,
    };
  });

  // Most-stale first: never-observed and long-stale students float to the top.
  withStats.sort((a, b) => {
    const aDays = a.days_since_observed ?? Number.POSITIVE_INFINITY;
    const bDays = b.days_since_observed ?? Number.POSITIVE_INFINITY;
    return bDays - aDays;
  });

  return withStats;
}

export function getStudentsWithStats(): StudentWithStats[] {
  const students = db.prepare("SELECT * FROM students").all() as Student[];
  return attachStats(students);
}

export function getClasses(): ClassWithStats[] {
  return db
    .prepare(
      `SELECT c.*, COUNT(cs.student_id) as student_count
       FROM classes c
       LEFT JOIN class_students cs ON cs.class_id = c.id
       GROUP BY c.id
       ORDER BY c.name`
    )
    .all() as ClassWithStats[];
}

export function getClass(id: number): SchoolClass | undefined {
  return db.prepare("SELECT * FROM classes WHERE id = ?").get(id) as
    | SchoolClass
    | undefined;
}

export function getClassRoster(classId: number): StudentWithStats[] {
  const students = db
    .prepare(
      `SELECT s.* FROM students s
       JOIN class_students cs ON cs.student_id = s.id
       WHERE cs.class_id = ?`
    )
    .all(classId) as Student[];
  return attachStats(students);
}

export function getClassesForStudent(studentId: number): SchoolClass[] {
  return db
    .prepare(
      `SELECT c.* FROM classes c
       JOIN class_students cs ON cs.class_id = c.id
       WHERE cs.student_id = ?
       ORDER BY c.name`
    )
    .all(studentId) as SchoolClass[];
}

export function getStudent(id: number): Student | undefined {
  return db.prepare("SELECT * FROM students WHERE id = ?").get(id) as
    | Student
    | undefined;
}

export function getObservationsForStudent(id: number): Observation[] {
  const rows = db
    .prepare(
      "SELECT * FROM observations WHERE student_id = ? ORDER BY created_at DESC"
    )
    .all(id) as ObservationRow[];
  return rows.map(parseObservation);
}

export function getTagCounts(observations: Observation[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const obs of observations) {
    for (const tag of obs.tags) {
      counts[tag] = (counts[tag] ?? 0) + 1;
    }
  }
  return counts;
}

interface AdmissionsStoryRow {
  id: string;
  student_id: number;
  content: string;
  signed_by: string | null;
  signed_at: string | null;
  created_at: string;
}

function admissionsStoryToPortrait(row: AdmissionsStoryRow): Portrait {
  return { ...row, type: "admissions" };
}

export async function getPortraitsForStudent(id: number): Promise<Portrait[]> {
  const familyPortraits = db
    .prepare(
      "SELECT * FROM portraits WHERE student_id = ? AND type = 'family' ORDER BY created_at DESC"
    )
    .all(id) as Portrait[];

  // Admissions stories live in Supabase (see lib/actions.ts); when it isn't
  // configured, degrade to family portraits only rather than blocking the
  // whole Student page, matching every Claude call's offline-fallback contract.
  if (!isSupabaseConfigured()) return familyPortraits;

  const { data, error } = await getSupabase()
    .from("admissions_stories")
    .select("*")
    .eq("student_id", id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const admissionsStories = (data as AdmissionsStoryRow[]).map(
    admissionsStoryToPortrait
  );

  return [...familyPortraits, ...admissionsStories].sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  );
}

export async function getPortrait(
  id: number | string
): Promise<Portrait | undefined> {
  if (typeof id === "string") {
    if (!isSupabaseConfigured()) return undefined;
    const { data, error } = await getSupabase()
      .from("admissions_stories")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? admissionsStoryToPortrait(data as AdmissionsStoryRow) : undefined;
  }

  return db.prepare("SELECT * FROM portraits WHERE id = ?").get(id) as
    | Portrait
    | undefined;
}

interface ApplicantRow {
  id: number;
  name: string;
  grade: number | null;
  slug: string;
  token: string;
  answers: string;
  generated_pathways: string | null;
  status: Applicant["status"];
  approved_by: string | null;
  approved_at: string | null;
  converted_student_id: number | null;
  created_at: string;
}

function parseApplicant(row: ApplicantRow): Applicant {
  return {
    ...row,
    answers: JSON.parse(row.answers) as ApplicantAnswer[],
    generated: row.generated_pathways
      ? (JSON.parse(row.generated_pathways) as GeneratedPathwaysResult)
      : null,
  };
}

export function getApplicants(): Applicant[] {
  const rows = db
    .prepare("SELECT * FROM applicants ORDER BY created_at DESC")
    .all() as ApplicantRow[];
  return rows.map(parseApplicant);
}

export function getApplicant(id: number): Applicant | undefined {
  const row = db.prepare("SELECT * FROM applicants WHERE id = ?").get(id) as
    | ApplicantRow
    | undefined;
  return row ? parseApplicant(row) : undefined;
}

export function getApplicantByToken(token: string): Applicant | undefined {
  const row = db
    .prepare("SELECT * FROM applicants WHERE token = ?")
    .get(token) as ApplicantRow | undefined;
  return row ? parseApplicant(row) : undefined;
}

export function getCourses(): CourseWithStats[] {
  return db
    .prepare(
      `SELECT c.*,
              (SELECT COUNT(*) FROM course_students cs WHERE cs.course_id = c.id) as student_count,
              (SELECT COUNT(*) FROM course_skills sk WHERE sk.course_id = c.id) as skill_count
       FROM courses c
       ORDER BY c.name`
    )
    .all() as CourseWithStats[];
}

export function getCourse(id: number): Course | undefined {
  return db.prepare("SELECT * FROM courses WHERE id = ?").get(id) as
    | Course
    | undefined;
}

export function getCourseSkills(courseId: number): CourseSkill[] {
  return db
    .prepare("SELECT * FROM course_skills WHERE course_id = ? ORDER BY id")
    .all(courseId) as CourseSkill[];
}

export function getCourseRoster(courseId: number): Student[] {
  return db
    .prepare(
      `SELECT s.* FROM students s
       JOIN course_students cs ON cs.student_id = s.id
       WHERE cs.course_id = ?
       ORDER BY s.name`
    )
    .all(courseId) as Student[];
}

interface SkillSnapshotRow {
  id: number;
  student_id: number;
  skill_id: number;
  narrative: string;
  evidence: string;
  updated_at: string;
}

function parseSkillSnapshot(row: SkillSnapshotRow): SkillSnapshot {
  return { ...row, evidence: JSON.parse(row.evidence) as SkillEvidenceItem[] };
}

export function getSkillSnapshotsForCourse(courseId: number): SkillSnapshot[] {
  const rows = db
    .prepare(
      `SELECT sn.* FROM skill_snapshots sn
       JOIN course_skills sk ON sk.id = sn.skill_id
       WHERE sk.course_id = ?`
    )
    .all(courseId) as SkillSnapshotRow[];
  return rows.map(parseSkillSnapshot);
}

export function getSkillSnapshotsForStudent(studentId: number): SkillSnapshot[] {
  const rows = db
    .prepare("SELECT * FROM skill_snapshots WHERE student_id = ?")
    .all(studentId) as SkillSnapshotRow[];
  return rows.map(parseSkillSnapshot);
}

export function getCoursesForStudent(studentId: number): Course[] {
  return db
    .prepare(
      `SELECT c.* FROM courses c
       JOIN course_students cs ON cs.course_id = c.id
       WHERE cs.student_id = ?
       ORDER BY c.name`
    )
    .all(studentId) as Course[];
}
