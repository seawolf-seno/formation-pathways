"use server";

import { revalidatePath } from "next/cache";
import { db } from "./db";
import { supabase } from "./supabase";
import {
  draftAdmissionsStory,
  draftFamilyPortrait,
  draftObservation,
} from "./claude";
import {
  getObservationsForStudent,
  getPortrait,
  getStudent,
} from "./queries";
import type {
  DraftObservationResult,
  FormationTag,
  Observation,
  Portrait,
  PortraitType,
  SchoolClass,
  Student,
} from "./types";

export async function draftObservationAction(
  rawText: string
): Promise<DraftObservationResult> {
  if (!rawText || !rawText.trim()) {
    return {
      cleanText: "",
      suggestedTags: [],
      disciplineFlag: null,
      usedFallback: true,
    };
  }
  return draftObservation(rawText);
}

export async function saveObservationAction(input: {
  studentId: number;
  author: string;
  rawText: string;
  cleanText: string;
  tags: FormationTag[];
  disciplineFlag: string | null;
}): Promise<Observation> {
  const { studentId, author, rawText, cleanText, tags, disciplineFlag } =
    input;

  const info = db
    .prepare(
      `INSERT INTO observations (student_id, author, raw_text, clean_text, tags, discipline_flag)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      studentId,
      author.trim() || "Unnamed teacher",
      rawText,
      cleanText,
      JSON.stringify(tags),
      disciplineFlag
    );

  revalidatePath("/");
  revalidatePath(`/students/${studentId}`);

  const row = db
    .prepare("SELECT * FROM observations WHERE id = ?")
    .get(info.lastInsertRowid) as {
    id: number;
    student_id: number;
    author: string;
    raw_text: string;
    clean_text: string;
    tags: string;
    discipline_flag: string | null;
    created_at: string;
  };

  return { ...row, tags: JSON.parse(row.tags) as FormationTag[] };
}

export async function draftPortraitAction(
  studentId: number,
  type: PortraitType
): Promise<Portrait> {
  const student = getStudent(studentId);
  if (!student) throw new Error("Student not found");
  const observations = getObservationsForStudent(studentId);

  const { content } =
    type === "family"
      ? await draftFamilyPortrait(student.name, student.grade, observations)
      : await draftAdmissionsStory(student.grade, observations);

  revalidatePath(`/students/${studentId}`);

  if (type === "admissions") {
    const { data, error } = await supabase
      .from("admissions_stories")
      .insert({ student_id: studentId, content })
      .select()
      .single();
    if (error) throw error;
    return { ...data, type: "admissions" } as Portrait;
  }

  const info = db
    .prepare(
      `INSERT INTO portraits (student_id, type, content) VALUES (?, ?, ?)`
    )
    .run(studentId, type, content);

  return db
    .prepare("SELECT * FROM portraits WHERE id = ?")
    .get(info.lastInsertRowid) as Portrait;
}

export async function updatePortraitContentAction(
  portraitId: number | string,
  content: string
): Promise<Portrait> {
  const existing = await getPortrait(portraitId);
  if (!existing) throw new Error("Portrait not found");
  if (existing.signed_by) {
    throw new Error("Cannot edit a signed portrait");
  }

  if (typeof portraitId === "string") {
    const { error } = await supabase
      .from("admissions_stories")
      .update({ content })
      .eq("id", portraitId);
    if (error) throw error;
  } else {
    db.prepare("UPDATE portraits SET content = ? WHERE id = ?").run(
      content,
      portraitId
    );
  }

  revalidatePath(`/students/${existing.student_id}`);

  return (await getPortrait(portraitId)) as Portrait;
}

export async function createClassAction(name: string): Promise<SchoolClass> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("A class name is required");

  const info = db
    .prepare("INSERT INTO classes (name) VALUES (?)")
    .run(trimmed);

  revalidatePath("/classes");

  return db
    .prepare("SELECT * FROM classes WHERE id = ?")
    .get(info.lastInsertRowid) as SchoolClass;
}

export async function createStudentAction(
  name: string,
  grade: number
): Promise<Student> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("A student name is required");
  if (!Number.isInteger(grade) || grade < 6 || grade > 12) {
    throw new Error("Grade must be between 6 and 12");
  }

  const info = db
    .prepare("INSERT INTO students (name, grade) VALUES (?, ?)")
    .run(trimmed, grade);

  revalidatePath("/classes");
  revalidatePath("/");

  return db
    .prepare("SELECT * FROM students WHERE id = ?")
    .get(info.lastInsertRowid) as Student;
}

export async function enrollStudentAction(
  classId: number,
  studentId: number
): Promise<void> {
  db.prepare(
    "INSERT OR IGNORE INTO class_students (class_id, student_id) VALUES (?, ?)"
  ).run(classId, studentId);

  revalidatePath(`/classes/${classId}`);
  revalidatePath(`/students/${studentId}`);
}

export async function unenrollStudentAction(
  classId: number,
  studentId: number
): Promise<void> {
  db.prepare(
    "DELETE FROM class_students WHERE class_id = ? AND student_id = ?"
  ).run(classId, studentId);

  revalidatePath(`/classes/${classId}`);
  revalidatePath(`/students/${studentId}`);
}

export async function signPortraitAction(
  portraitId: number | string,
  signedBy: string
): Promise<Portrait> {
  if (!signedBy || !signedBy.trim()) {
    throw new Error("A name is required to sign a Pathway Portrait");
  }
  const existing = await getPortrait(portraitId);
  if (!existing) throw new Error("Portrait not found");

  const trimmedSignedBy = signedBy.trim();

  if (typeof portraitId === "string") {
    const { error } = await supabase
      .from("admissions_stories")
      .update({ signed_by: trimmedSignedBy, signed_at: new Date().toISOString() })
      .eq("id", portraitId);
    if (error) throw error;
  } else {
    db.prepare(
      "UPDATE portraits SET signed_by = ?, signed_at = datetime('now') WHERE id = ?"
    ).run(trimmedSignedBy, portraitId);
  }

  revalidatePath(`/students/${existing.student_id}`);

  return (await getPortrait(portraitId)) as Portrait;
}
