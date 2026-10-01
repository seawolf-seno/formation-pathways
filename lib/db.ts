import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import {
  seedApplicantsIfEmpty,
  seedInquiryDemoIfEmpty,
  seedClassesIfEmpty,
  seedCoursesIfEmpty,
  seedIfEmpty,
} from "./seed";

// The demo's SQLite file. Vercel's filesystem is read-only apart from /tmp,
// which is per-instance and wiped on cold start: the demo still works there
// (re-seeded on boot), but its writes don't persist. The system of record
// lives in Supabase and is unaffected.
const DATA_DIR = process.env.VERCEL ? "/tmp/formation-data" : path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, "formation.db");

declare global {
  var __formationDb: Database.Database | undefined;
}

/** A database serialized from a WAL-mode file says "WAL" in its header
 *  (bytes 18–19 = 2), and an in-memory copy can't open a WAL file. Mark the
 *  copy as a rollback-journal database (1) instead; the data is unchanged. */
function asRollbackJournal(snapshot: Buffer): Buffer {
  const copy = Buffer.from(snapshot);
  if (copy.length > 19 && copy[18] === 2) copy[18] = copy[19] = 1;
  return copy;
}

/** Opens the demo database: the local file, or (when `snapshot` is given) an
 *  in-memory copy of a serialized database restored from Supabase
 *  (lib/demo-persist.ts). Schema, column additions and seeding below are
 *  idempotent, so an older snapshot is brought up to date on load. */
function createDb(snapshot?: Buffer): Database.Database {
  const db = snapshot ? new Database(asRollbackJournal(snapshot)) : new Database(DB_PATH);
  if (!snapshot) db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      grade INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      author TEXT NOT NULL,
      raw_text TEXT NOT NULL,
      clean_text TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      discipline_flag TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS portraits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('family', 'admissions')),
      content TEXT NOT NULL,
      signed_by TEXT,
      signed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_observations_student ON observations(student_id);
    CREATE INDEX IF NOT EXISTS idx_portraits_student ON portraits(student_id);

    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS class_students (
      class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (class_id, student_id)
    );

    CREATE INDEX IF NOT EXISTS idx_class_students_student ON class_students(student_id);

    CREATE TABLE IF NOT EXISTS applicants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      grade INTEGER,
      slug TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      answers TEXT NOT NULL DEFAULT '[]',
      generated_pathways TEXT,
      status TEXT NOT NULL DEFAULT 'in_progress'
        CHECK (status IN ('in_progress', 'submitted', 'approved', 'enrolled')),
      approved_by TEXT,
      approved_at TEXT,
      converted_student_id INTEGER REFERENCES students(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_applicants_token ON applicants(token);

    -- Parent-curated public shares. content is a whitelisted snapshot (see
    -- lib/share.ts); nothing else about the applicant is ever public.
    CREATE TABLE IF NOT EXISTS pathway_shares (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      applicant_id INTEGER NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      revoked_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_pathway_shares_applicant ON pathway_shares(applicant_id);

    -- Inquiry stage: someone who has told us their prior school but has not
    -- applied. No essays, no answers, nothing sensitive.
    CREATE TABLE IF NOT EXISTS inquiries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      email TEXT NOT NULL,
      prior_school TEXT NOT NULL,
      interests TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Pacifica students/alumni whose story may be shown to families from the
    -- same prior school. consent_confirmed gates every read: nothing is shown
    -- unless someone has recorded consent for it.
    CREATE TABLE IF NOT EXISTS alumni_stories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      school_key TEXT NOT NULL,
      first_name TEXT NOT NULL,
      grad_year INTEGER NOT NULL,
      headline TEXT NOT NULL,
      story TEXT NOT NULL,
      pathway_name TEXT NOT NULL,
      where_now TEXT NOT NULL,
      is_fictional INTEGER NOT NULL DEFAULT 1,
      consent_confirmed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_alumni_school ON alumni_stories(school_key);

    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      teacher_name TEXT NOT NULL,
      canvas_course_id TEXT,
      drive_doc_name TEXT,
      drive_doc_content TEXT,
      last_synced_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS course_students (
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      PRIMARY KEY (course_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS course_skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS skill_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      skill_id INTEGER NOT NULL REFERENCES course_skills(id) ON DELETE CASCADE,
      narrative TEXT NOT NULL,
      evidence TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(student_id, skill_id)
    );

    CREATE INDEX IF NOT EXISTS idx_course_students_student ON course_students(student_id);
    CREATE INDEX IF NOT EXISTS idx_course_skills_course ON course_skills(course_id);
    CREATE INDEX IF NOT EXISTS idx_skill_snapshots_student ON skill_snapshots(student_id);
  `);

  // observations predates the "source" column — add it for existing dev DBs.
  try {
    db.exec(
      "ALTER TABLE observations ADD COLUMN source TEXT NOT NULL DEFAULT 'voice'"
    );
  } catch {
    // column already exists
  }

  // Spark: an interactive interest survey an applicant can fill any time
  // during their application, even before essays or an interview exist. See
  // docs/interest-survey.md. Added after applicants shipped — ALTER for
  // existing dev DBs, same pattern as observations.source above.
  for (const stmt of [
    "ALTER TABLE applicants ADD COLUMN spark_token TEXT",
    "ALTER TABLE applicants ADD COLUMN spark_response TEXT",
    "ALTER TABLE applicants ADD COLUMN spark_completed_at TEXT",
  ]) {
    try {
      db.exec(stmt);
    } catch {
      // column already exists
    }
  }
  try {
    db.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_applicants_spark_token ON applicants(spark_token)"
    );
  } catch {
    // index already exists
  }

  seedIfEmpty(db);
  seedClassesIfEmpty(db);
  seedApplicantsIfEmpty(db);
  seedInquiryDemoIfEmpty(db);
  seedCoursesIfEmpty(db);

  return db;
}

function current(): Database.Database {
  // One connection per server instance, cached on globalThis so it also
  // survives hot reloads in dev.
  return (global.__formationDb ??= createDb());
}

/** Replace this instance's demo database with a restored snapshot. The old
 *  connection isn't closed: a request still using it finishes normally. */
export function replaceDemoDb(snapshot: Buffer): void {
  global.__formationDb = createDb(snapshot);
}

/** The whole demo database as one buffer, for lib/demo-persist.ts. */
export function serializeDemoDb(): Buffer {
  return current().serialize();
}

// `db` always points at this instance's current connection, so code that
// imported it keeps working after replaceDemoDb().
export const db = new Proxy({} as Database.Database, {
  get(_target, prop) {
    const d = current();
    const v = Reflect.get(d, prop, d);
    return typeof v === "function" ? v.bind(d) : v;
  },
});
