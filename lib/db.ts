import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import {
  seedApplicantsIfEmpty,
  seedClassesIfEmpty,
  seedCoursesIfEmpty,
  seedIfEmpty,
} from "./seed";

const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, "formation.db");

declare global {
  var __formationDb: Database.Database | undefined;
}

function createDb(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
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

  seedIfEmpty(db);
  seedClassesIfEmpty(db);
  seedApplicantsIfEmpty(db);
  seedCoursesIfEmpty(db);

  return db;
}

// Reuse a single connection across hot reloads in dev.
export const db = global.__formationDb ?? createDb();
if (process.env.NODE_ENV !== "production") {
  global.__formationDb = db;
}
