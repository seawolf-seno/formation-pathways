"use server";

import { randomBytes } from "crypto";
import fs from "fs";
import path from "path";
import { revalidatePath } from "next/cache";
import { db } from "./db";
import { getSupabase, isSupabaseConfigured } from "./supabase";
import {
  draftAdmissionsPathways,
  draftAdmissionsStory,
  draftFamilyPortrait,
  draftObservation,
  draftSkillSnapshots,
} from "./claude";
import {
  ensureMockWorld,
  getCanvasSource,
  isLiveCanvasConfigured,
  pseudonymizeToRoster,
  simulateCanvasActivity,
} from "./integrations/canvas";
import { getDriveSource, type DriveDoc } from "./integrations/drive";
import { buildPublicShareContent, type ShareSelection } from "./share";
import {
  formatSparkContext,
  parseChoiceLines,
  parseVocabLines,
  validateSparkResponse,
} from "./spark";
import {
  getApplicant,
  getApplicantByToken,
  getApplicantBySparkToken,
  getCourse,
  getCourseRoster,
  getCourseSkills,
  getObservationsForStudent,
  getPortrait,
  getSkillSnapshotsForCourse,
  getStudent,
} from "./queries";
import type {
  Applicant,
  ApplicantAnswer,
  Course,
  CourseSkill,
  DraftObservationResult,
  FormationTag,
  Observation,
  Portrait,
  SkillSnapshot,
  PortraitType,
  SchoolClass,
  Student,
} from "./types";
import { demoWrite, syncDemoDb } from "./demo-persist";

const ADMISSIONS_QUESTIONS = fs
  .readFileSync(
    path.join(process.cwd(), "prompts", "admissions-questions.txt"),
    "utf-8"
  )
  .split("\n")
  .map((q) => q.trim())
  .filter(Boolean);

function loadSparkInterestOptions() {
  return parseVocabLines(
    fs.readFileSync(path.join(process.cwd(), "prompts", "spark-interests.txt"), "utf-8")
  );
}

function loadSparkChoicePairs() {
  return parseChoiceLines(
    fs.readFileSync(path.join(process.cwd(), "prompts", "spark-choices.txt"), "utf-8")
  );
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  if (base.length === 0) return "applicant";
  if (base.length === 1) return base[0];
  return `${base[0]}-${base[base.length - 1][0]}`;
}

function newToken(): string {
  return randomBytes(4).toString("hex");
}

function applicantRow(id: number): Applicant {
  const applicant = getApplicant(id);
  if (!applicant) throw new Error("Applicant not found");
  return applicant;
}

export async function draftObservationAction(
  rawText: string
): Promise<DraftObservationResult> {
  await syncDemoDb();
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
  await demoWrite();
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
    source: Observation["source"];
    created_at: string;
  };

  return { ...row, tags: JSON.parse(row.tags) as FormationTag[] };
}

export async function draftPortraitAction(
  studentId: number,
  type: PortraitType
): Promise<Portrait> {
  await demoWrite();
  const student = getStudent(studentId);
  if (!student) throw new Error("Student not found");
  if (type === "admissions" && !isSupabaseConfigured()) {
    throw new Error(
      "Admissions stories need Supabase configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local) — not set up in this environment."
    );
  }
  const observations = getObservationsForStudent(studentId);

  const { content } =
    type === "family"
      ? await draftFamilyPortrait(student.name, student.grade, observations)
      : await draftAdmissionsStory(student.grade, observations);

  revalidatePath(`/students/${studentId}`);

  if (type === "admissions") {
    const { data, error } = await getSupabase()
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
  await demoWrite();
  const existing = await getPortrait(portraitId);
  if (!existing) throw new Error("Portrait not found");
  if (existing.signed_by) {
    throw new Error("Cannot edit a signed portrait");
  }

  if (typeof portraitId === "string") {
    const { error } = await getSupabase()
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
  await demoWrite();
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
  await demoWrite();
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
  await demoWrite();
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
  await demoWrite();
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
  await demoWrite();
  if (!signedBy || !signedBy.trim()) {
    throw new Error("A name is required to sign a Pathway Portrait");
  }
  const existing = await getPortrait(portraitId);
  if (!existing) throw new Error("Portrait not found");

  const trimmedSignedBy = signedBy.trim();

  if (typeof portraitId === "string") {
    const { error } = await getSupabase()
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

export async function startApplicantAction(name: string): Promise<Applicant> {
  await demoWrite();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("A name is required to start an application");

  const answers: ApplicantAnswer[] = ADMISSIONS_QUESTIONS.map((question) => ({
    question,
    answer: "",
  }));

  const info = db
    .prepare(
      `INSERT INTO applicants (name, slug, token, answers, spark_token) VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      trimmed,
      slugify(trimmed),
      newToken(),
      JSON.stringify(answers),
      randomBytes(16).toString("base64url")
    );

  return applicantRow(info.lastInsertRowid as number);
}

export async function saveApplicantAnswerAction(
  applicantId: number,
  questionIndex: number,
  answerText: string
): Promise<void> {
  await demoWrite();
  const applicant = applicantRow(applicantId);
  if (applicant.status !== "in_progress") return;

  const answers = applicant.answers.map((a, i) =>
    i === questionIndex ? { ...a, answer: answerText } : a
  );

  db.prepare("UPDATE applicants SET answers = ? WHERE id = ?").run(
    JSON.stringify(answers),
    applicantId
  );
}

export async function submitApplicantAction(
  applicantId: number
): Promise<Applicant> {
  await demoWrite();
  const applicant = applicantRow(applicantId);

  const { result } = await draftAdmissionsPathways(applicant.answers);

  db.prepare(
    `UPDATE applicants SET generated_pathways = ?, status = 'submitted' WHERE id = ?`
  ).run(JSON.stringify(result), applicantId);

  revalidatePath("/admissions");

  return applicantRow(applicantId);
}

export async function regenerateApplicantPathwaysAction(
  applicantId: number
): Promise<Applicant> {
  await demoWrite();
  const applicant = applicantRow(applicantId);
  const sparkContext = applicant.spark_response
    ? formatSparkContext(applicant.spark_response, loadSparkChoicePairs())
    : null;
  const { result } = await draftAdmissionsPathways(applicant.answers, sparkContext);

  db.prepare(`UPDATE applicants SET generated_pathways = ? WHERE id = ?`).run(
    JSON.stringify(result),
    applicantId
  );

  revalidatePath(`/admissions/${applicantId}`);

  return applicantRow(applicantId);
}

export async function approveApplicantAction(
  applicantId: number,
  approvedBy: string
): Promise<Applicant> {
  await demoWrite();
  const trimmed = approvedBy.trim();
  if (!trimmed) throw new Error("A staff name is required to approve a Pathway page");
  const applicant = applicantRow(applicantId);
  if (!applicant.generated) {
    throw new Error("Generate Pathways before approving");
  }

  db.prepare(
    `UPDATE applicants SET status = 'approved', approved_by = ?, approved_at = datetime('now') WHERE id = ?`
  ).run(trimmed, applicantId);

  revalidatePath(`/admissions/${applicantId}`);
  revalidatePath(`/applicant/${applicant.slug}-${applicant.token}`);

  return applicantRow(applicantId);
}

export async function convertApplicantToStudentAction(
  applicantId: number
): Promise<Student> {
  await demoWrite();
  const applicant = applicantRow(applicantId);
  if (!applicant.generated) {
    throw new Error("Generate Pathways before enrolling this applicant");
  }
  if (applicant.converted_student_id) {
    return getStudent(applicant.converted_student_id) as Student;
  }

  const grade = applicant.grade ?? 9;

  const studentInfo = db
    .prepare("INSERT INTO students (name, grade) VALUES (?, ?)")
    .run(applicant.name, grade);
  const studentId = studentInfo.lastInsertRowid as number;

  const insertObservation = db.prepare(
    `INSERT INTO observations (student_id, author, raw_text, clean_text, tags, discipline_flag, source)
     VALUES (?, ?, ?, ?, ?, NULL, 'admissions')`
  );
  const seedTx = db.transaction(() => {
    for (const obs of applicant.generated!.seedObservations) {
      insertObservation.run(
        studentId,
        "Admissions (from application)",
        obs.text,
        obs.text,
        JSON.stringify(obs.tags)
      );
    }
    db.prepare(
      `UPDATE applicants SET status = 'enrolled', converted_student_id = ? WHERE id = ?`
    ).run(studentId, applicantId);
  });
  seedTx();

  revalidatePath(`/admissions/${applicantId}`);
  revalidatePath("/");
  revalidatePath(`/students/${studentId}`);

  return getStudent(studentId) as Student;
}

export async function createCourseAction(
  name: string,
  teacherName: string,
  studentIds: number[]
): Promise<Course> {
  await demoWrite();
  const trimmedName = name.trim();
  const trimmedTeacher = teacherName.trim();
  if (!trimmedName) throw new Error("A course name is required");
  if (!trimmedTeacher) throw new Error("A teacher name is required");

  const info = db
    .prepare("INSERT INTO courses (name, teacher_name) VALUES (?, ?)")
    .run(trimmedName, trimmedTeacher);
  const courseId = info.lastInsertRowid as number;

  const enroll = db.prepare(
    "INSERT OR IGNORE INTO course_students (course_id, student_id) VALUES (?, ?)"
  );
  const tx = db.transaction(() => {
    for (const studentId of studentIds) enroll.run(courseId, studentId);
  });
  tx();

  revalidatePath("/courses");

  return getCourse(courseId) as Course;
}

export async function addCourseSkillAction(
  courseId: number,
  name: string,
  description: string
): Promise<CourseSkill> {
  await demoWrite();
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("A skill name is required");

  const info = db
    .prepare(
      "INSERT INTO course_skills (course_id, name, description) VALUES (?, ?, ?)"
    )
    .run(courseId, trimmedName, description.trim());

  revalidatePath(`/courses/${courseId}`);

  return db
    .prepare("SELECT * FROM course_skills WHERE id = ?")
    .get(info.lastInsertRowid) as CourseSkill;
}

export async function updateCourseCanvasIdAction(
  courseId: number,
  canvasCourseId: string
): Promise<Course> {
  await demoWrite();
  const trimmed = canvasCourseId.trim();

  db.prepare("UPDATE courses SET canvas_course_id = ? WHERE id = ?").run(
    trimmed || null,
    courseId
  );

  revalidatePath(`/courses/${courseId}`);

  return getCourse(courseId) as Course;
}

export async function listAvailableDriveDocsAction(): Promise<DriveDoc[]> {
  await syncDemoDb();
  return getDriveSource().listAvailableDocs();
}

export async function linkDriveDocAction(
  courseId: number,
  fileId: string
): Promise<Course> {
  await demoWrite();
  const doc = await getDriveSource().fetchDoc(fileId);

  db.prepare(
    "UPDATE courses SET drive_doc_name = ?, drive_doc_content = ? WHERE id = ?"
  ).run(doc.name, doc.content, courseId);

  revalidatePath(`/courses/${courseId}`);

  return getCourse(courseId) as Course;
}

export interface PendingSkillObservation {
  studentId: number;
  studentName: string;
  text: string;
  tags: FormationTag[];
}

async function runCourseSync(courseId: number): Promise<{
  course: Course;
  snapshots: SkillSnapshot[];
  pendingObservations: PendingSkillObservation[];
}> {
  const course = getCourse(courseId);
  if (!course) throw new Error("Course not found");

  const skills = getCourseSkills(courseId);
  if (skills.length === 0) throw new Error("Add at least one skill before syncing");

  const roster = getCourseRoster(courseId);
  const rosterNames = roster.map((s) => s.name);
  const worldKey = course.canvas_course_id ?? `local-${course.id}`;

  const rawCanvasData = await getCanvasSource().fetchCourseData(
    worldKey,
    rosterNames,
    course.name
  );
  // Live Canvas returns real student names — rename onto the local fictional
  // roster immediately, before this data touches storage or Claude. See
  // pseudonymizeToRoster's doc comment in lib/integrations/canvas.ts.
  const canvasData = isLiveCanvasConfigured()
    ? pseudonymizeToRoster(rawCanvasData, rosterNames)
    : rawCanvasData;

  const { drafts } = await draftSkillSnapshots(
    course.name,
    skills,
    course.drive_doc_content,
    canvasData
  );

  const skillByName = new Map(skills.map((s) => [s.name, s]));
  const studentByName = new Map(roster.map((s) => [s.name, s]));

  const upsert = db.prepare(
    `INSERT INTO skill_snapshots (student_id, skill_id, narrative, evidence, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(student_id, skill_id)
     DO UPDATE SET narrative = excluded.narrative, evidence = excluded.evidence, updated_at = datetime('now')`
  );

  const pendingObservations: PendingSkillObservation[] = [];
  const tx = db.transaction(() => {
    for (const draft of drafts) {
      const student = studentByName.get(draft.studentName);
      const skill = skillByName.get(draft.skillName);
      if (!student || !skill) continue;
      upsert.run(student.id, skill.id, draft.narrative, JSON.stringify(draft.evidence));
      if (draft.proposedObservation) {
        pendingObservations.push({
          studentId: student.id,
          studentName: student.name,
          text: draft.proposedObservation.text,
          tags: draft.proposedObservation.tags,
        });
      }
    }
    db.prepare("UPDATE courses SET last_synced_at = datetime('now') WHERE id = ?").run(
      courseId
    );
  });
  tx();

  revalidatePath(`/courses/${courseId}`);
  revalidatePath("/");

  return {
    course: getCourse(courseId) as Course,
    snapshots: getSkillSnapshotsForCourse(courseId),
    pendingObservations,
  };
}

export async function syncCourseAction(courseId: number): Promise<{
  course: Course;
  snapshots: SkillSnapshot[];
  pendingObservations: PendingSkillObservation[];
}> {
  await demoWrite();
  return runCourseSync(courseId);
}

export async function simulateCanvasActivityAction(courseId: number): Promise<{
  message: string;
  course: Course;
  snapshots: SkillSnapshot[];
  pendingObservations: PendingSkillObservation[];
}> {
  await demoWrite();
  if (isLiveCanvasConfigured()) {
    throw new Error("Simulate only works against the mock Canvas — live Canvas is configured.");
  }
  const course = getCourse(courseId);
  if (!course) throw new Error("Course not found");
  const roster = getCourseRoster(courseId);
  const worldKey = course.canvas_course_id ?? `local-${course.id}`;

  ensureMockWorld(worldKey, course.name, roster.map((s) => s.name));
  const message = simulateCanvasActivity(worldKey);
  if (!message) throw new Error("Nothing to simulate yet");

  const syncResult = await runCourseSync(courseId);
  return { message, ...syncResult };
}

export async function approveSkillSignalObservationAction(input: {
  studentId: number;
  text: string;
  tags: FormationTag[];
}): Promise<Observation> {
  await demoWrite();
  const { studentId, text, tags } = input;

  const info = db
    .prepare(
      `INSERT INTO observations (student_id, author, raw_text, clean_text, tags, discipline_flag, source)
       VALUES (?, 'Canvas skill signal (teacher-approved)', ?, ?, ?, NULL, 'canvas')`
    )
    .run(studentId, text, text, JSON.stringify(tags));

  revalidatePath(`/students/${studentId}`);
  revalidatePath("/");

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
    source: Observation["source"];
    created_at: string;
  };

  return { ...row, tags: JSON.parse(row.tags) as FormationTag[] };
}

// ---- Public pathway shares -------------------------------------------------
// The family's applicant token is the proof of access, same as the page it is
// used from. Shares are only possible after staff have approved the page.

function approvedApplicantByToken(applicantToken: string): Applicant {
  const applicant = getApplicantByToken(applicantToken);
  if (!applicant || !applicant.generated) throw new Error("Page not found");
  if (applicant.status !== "approved" && applicant.status !== "enrolled") {
    throw new Error("Sharing opens after Pacifica has approved this page");
  }
  return applicant;
}

export async function createPathwayShareAction(
  applicantToken: string,
  selection: ShareSelection
): Promise<{ token: string }> {
  await demoWrite();
  const applicant = approvedApplicantByToken(applicantToken);
  const content = buildPublicShareContent(
    applicant.name,
    applicant.generated!.pathways,
    selection
  );
  const token = randomBytes(16).toString("base64url");
  db.prepare(
    "INSERT INTO pathway_shares (applicant_id, token, content) VALUES (?, ?, ?)"
  ).run(applicant.id, token, JSON.stringify(content));
  revalidatePath(`/applicant/${applicant.slug}-${applicant.token}`);
  return { token };
}

export async function revokePathwayShareAction(
  applicantToken: string,
  shareToken: string
): Promise<void> {
  await demoWrite();
  const applicant = approvedApplicantByToken(applicantToken);
  db.prepare(
    `UPDATE pathway_shares SET revoked_at = datetime('now')
     WHERE token = ? AND applicant_id = ? AND revoked_at IS NULL`
  ).run(shareToken, applicant.id);
  revalidatePath(`/applicant/${applicant.slug}-${applicant.token}`);
  revalidatePath(`/share/${shareToken}`);
}

// ---- Spark: pre-essay interest survey --------------------------------------
// The only public write in this app. Deliberately narrow: it can only ever
// set an applicant's spark_response, never their answers, status, or
// generated pathways. See docs/interest-survey.md.

export async function ensureSparkLinkAction(applicantId: number): Promise<string> {
  await demoWrite();
  const applicant = applicantRow(applicantId);
  if (applicant.spark_token) return applicant.spark_token;
  const token = randomBytes(16).toString("base64url");
  db.prepare("UPDATE applicants SET spark_token = ? WHERE id = ?").run(token, applicantId);
  revalidatePath(`/admissions/${applicantId}`);
  return token;
}

export async function submitSparkResponseAction(
  sparkToken: string,
  raw: unknown
): Promise<{ ok: true }> {
  await demoWrite();
  const applicant = getApplicantBySparkToken(sparkToken);
  if (!applicant) throw new Error("This survey link isn't valid. Ask admissions for a new one.");
  if (applicant.status === "approved" || applicant.status === "enrolled") {
    throw new Error("This application has already been decided, so the survey is closed.");
  }

  const response = validateSparkResponse(
    raw,
    loadSparkInterestOptions(),
    loadSparkChoicePairs()
  );

  db.prepare(
    "UPDATE applicants SET spark_response = ?, spark_completed_at = datetime('now') WHERE id = ?"
  ).run(JSON.stringify(response), applicant.id);

  revalidatePath(`/admissions/${applicant.id}`);
  return { ok: true };
}
