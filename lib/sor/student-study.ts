import "server-only";
import { getSorClient } from "./supabase-server";
import {
  classesForReflection,
  latestReflections,
  tableNotThereYet,
  validateClassReflections,
  type ClassReflection,
  type ReflectionClass,
} from "./class-reflections";
import type { ClassResource } from "./class-resources";

// The Study Hub as a signed-in student sees it (/study, Fizzy #32). Every
// read runs as the student: RLS returns their own classes, reflections and
// suggestions, and approved links for their classes come from a database
// function that leaves out who suggested them
// (supabase/migrations/20261024000000_student_study_hub.sql).

export interface StudentStudy {
  /** False until the migration is applied: the Study Hub hides itself. */
  ready: boolean;
  classes: ReflectionClass[];
  /** What they said they enjoy, a class's most recent answer first. */
  reflections: ClassReflection[];
  /** Approved links for their classes, and their own still waiting. */
  resources: ClassResource[];
  /** Student-voice consent is on file, so reflections and links can be saved. */
  voice: boolean;
}

/** True when a database function isn't there yet (PostgREST: not in the
 *  schema cache; Postgres: undefined function). */
const functionNotThereYet = (error: { code?: string } | null | undefined) => error?.code === "PGRST202" || error?.code === "42883";

/** Whether the signed-in student's Study Hub is switched on. */
export async function studentStudyReady(): Promise<boolean> {
  const supabase = await getSorClient();
  const { error } = await supabase.rpc("student_voice_on");
  return !error;
}

export async function getStudentStudy(personId: string): Promise<StudentStudy> {
  const supabase = await getSorClient();
  const voice = await supabase.rpc("student_voice_on");
  if (voice.error) {
    if (!functionNotThereYet(voice.error)) console.error("student_voice_on failed:", voice.error.message);
    return { ready: false, classes: [], reflections: [], resources: [], voice: false };
  }
  const [history, courses, reflections, approved, waiting] = await Promise.all([
    supabase.from("course_history").select("source, section_id, school_year, course_title, offering_type").eq("person_id", personId).order("course_title"),
    supabase.from("course_enrollments").select("canvas_course_id, course_name").eq("person_id", personId),
    supabase.from("class_reflections").select("reflections, created_at").eq("person_id", personId).order("created_at", { ascending: false }).limit(20),
    supabase.rpc("class_links_for_student"),
    supabase.from("class_resources").select("*").eq("person_id", personId).eq("status", "pending").order("created_at", { ascending: true }),
  ]);
  for (const [name, r] of Object.entries({ course_history: history, course_enrollments: courses, class_reflections: reflections, class_links_for_student: approved, class_resources: waiting })) {
    if (r.error && !tableNotThereYet(r.error)) console.error(`${name} read failed for a student:`, r.error.message);
  }
  type Shared = Pick<ClassResource, "id" | "class_key" | "title" | "url" | "kind" | "note">;
  return {
    ready: true,
    classes: classesForReflection(courses.data ?? [], history.data ?? []),
    // Re-validated on read, as on the staff side: a stored row isn't trusted
    // to have the app's shape.
    reflections: latestReflections(
      (reflections.data ?? []).flatMap((row) => {
        const checked = validateClassReflections(row.reflections);
        return checked.ok ? [{ reflections: checked.reflections, created_at: row.created_at as string }] : [];
      })
    ),
    resources: [
      // The function returns the link only; whose it was, and who checked it
      // and when, never reach a student.
      ...((approved.data ?? []) as Shared[]).map((r) => ({
        ...r,
        person_id: "",
        class_title: "",
        status: "approved" as const,
        created_at: "",
        reviewed_by_name: null,
        reviewed_at: null,
      })),
      ...((waiting.data ?? []) as ClassResource[]),
    ],
    voice: voice.data === true,
  };
}
