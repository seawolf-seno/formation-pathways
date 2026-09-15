import { db } from "./db";
import { daysSince } from "./format";
import type {
  ClassWithStats,
  FormationTag,
  Observation,
  Portrait,
  SchoolClass,
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
  created_at: string;
}

function parseObservation(row: ObservationRow): Observation {
  return {
    ...row,
    tags: JSON.parse(row.tags) as FormationTag[],
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

export function getPortraitsForStudent(id: number): Portrait[] {
  return db
    .prepare(
      "SELECT * FROM portraits WHERE student_id = ? ORDER BY created_at DESC"
    )
    .all(id) as Portrait[];
}

export function getPortrait(id: number): Portrait | undefined {
  return db.prepare("SELECT * FROM portraits WHERE id = ?").get(id) as
    | Portrait
    | undefined;
}
