import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { seedClassesIfEmpty, seedIfEmpty } from "./seed";

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
  `);

  seedIfEmpty(db);
  seedClassesIfEmpty(db);

  return db;
}

// Reuse a single connection across hot reloads in dev.
export const db = global.__formationDb ?? createDb();
if (process.env.NODE_ENV !== "production") {
  global.__formationDb = db;
}
