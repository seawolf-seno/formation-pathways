"use server";

import { revalidatePath } from "next/cache";
import { requireStudent } from "@/lib/mastery/queries";
import { getSorClient } from "./supabase-server";
import { getStudentStudy } from "./student-study";
import { tableNotThereYet, validateClassReflections } from "./class-reflections";
import { validateResourceSuggestion } from "./class-resources";

// What a signed-in student saves on their own Study Hub (/study, Fizzy #32).
// Whose row it is always comes from the sign-in, never from the browser, and
// the database checks it again (20261024000000_student_study_hub.sql). Kept
// out of actions.ts, where every action is a staff action
// (tests/view-only.test.mjs); tests/student-study.test.mjs guards this file.

type Result = { ok: true } | { ok: false; error: string };

const NOT_YET = "This isn't switched on yet. Nothing on this screen is lost; try again in a few minutes.";

/** A plain sentence for whatever the database said. Its own refusals
 *  (P0001) are already written for the student, except the consent one. */
function refusal(error: { code?: string; message: string }): string {
  if (tableNotThereYet(error)) return NOT_YET;
  if (/student_voice/.test(error.message)) return "Your family hasn't agreed to this part yet, so it can't be saved. Ask your teacher about it.";
  if (error.code === "P0001") return error.message;
  console.error("a student's save failed:", error.code, error.message);
  return "That didn't save. Try again in a minute.";
}

const fail = (e: unknown): { ok: false; error: string } => {
  const message = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e);
  // requireStudent redirects a signed-out student to /login; inside an action
  // that surfaces as "NEXT_REDIRECT". Whatever's on screen is still in the tab.
  if (message === "NEXT_REDIRECT" || message.startsWith("NEXT_REDIRECT;")) {
    return { ok: false, error: "Your sign-in has expired. Sign in again in a new tab, then come back here and try again. Nothing on this screen is lost." };
  }
  console.error("a student's save failed:", message);
  return { ok: false, error: "That didn't save. Try again in a minute." };
};

/** Save which of their own classes the signed-in student enjoys, and why.
 *  Only classes on their schedule are kept, with the titles from it. */
export async function saveMyClassReflectionsAction(reflections: unknown): Promise<Result> {
  try {
    const student = await requireStudent();
    const { classes } = await getStudentStudy(student.personId);
    const checked = validateClassReflections(reflections, classes);
    if (!checked.ok) return { ok: false, error: checked.error };
    const supabase = await getSorClient();
    const { error } = await supabase
      .from("class_reflections")
      .insert({ person_id: student.personId, reflections: checked.reflections, created_by: null });
    if (error) return { ok: false, error: refusal(error) };
    revalidatePath("/study");
    revalidatePath(`/pilot/people/${student.personId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Save a link the signed-in student suggests for one of their own classes.
 *  It starts unreviewed: nobody else sees it until a teacher approves it. */
export async function suggestMyClassResourceAction(suggestion: unknown): Promise<Result> {
  try {
    const student = await requireStudent();
    const { classes } = await getStudentStudy(student.personId);
    const checked = validateResourceSuggestion(suggestion, classes);
    if (!checked.ok) return { ok: false, error: checked.error };
    const { classTitle, title, url, kind, note } = checked.suggestion;
    const supabase = await getSorClient();
    const { error } = await supabase
      .from("class_resources")
      .insert({ person_id: student.personId, class_title: classTitle, title, url, kind, note, created_by: null });
    if (error) return { ok: false, error: refusal(error) };
    revalidatePath("/study");
    revalidatePath("/pilot/resources");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
