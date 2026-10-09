"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireStaff, logAccess } from "./queries";
import { getSorClient } from "./supabase-server";
import { requestOrigin } from "../origin";
import { safeStemUrl, stemDate, STEM_KINDS, STEM_STATUSES } from "../stem";

export type StemActionResult = { ok: true; message: string; link?: string } | { ok: false; error: string };

function text(form: FormData, key: string, max: number, required = false): string {
  const value = String(form.get(key) ?? "").trim();
  if (value.length > max || (required && !value)) throw new Error(`${key.replaceAll("_", " ")} ${required ? "is required and " : ""}must be at most ${max} characters.`);
  return value;
}
function uuid(form: FormData, key: string): string {
  const value = text(form, key, 36, true);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error("Choose a valid student or item.");
  return value;
}
function errorResult(error: unknown): StemActionResult {
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : "Unable to save. Try again.";
  return { ok: false, error: message.includes("NEXT_REDIRECT") ? "Your sign-in has expired. Sign in again, then return to this page." : message };
}

export async function stemAction(_previous: StemActionResult | null, form: FormData): Promise<StemActionResult> {
  try {
    const staff = await requireStaff();
    if (!["admin", "admissions", "teacher"].includes(staff.role)) throw new Error("A STEM coordinator, teacher or admissions staff member is needed.");
    const db = await getSorClient();
    const operation = text(form, "operation", 30, true);
    const write = async (query: PromiseLike<{ error: { message: string } | null; data?: unknown }>) => {
      const { error, data } = await query;
      if (error) throw error;
      if (Array.isArray(data) && data.length === 0) throw new Error("This item is unavailable or your access has changed.");
    };
    const adminOnly = () => { if (staff.role !== "admin") throw new Error("An admin manages the program, mentors and opportunities."); };
    if (operation === "program") {
      adminOnly();
      const requirements = text(form, "requirements", 10000, true).split("\n").map(s => s.trim()).filter(Boolean);
      if (!requirements.length || requirements.length > 20 || new Set(requirements).size !== requirements.length || requirements.some(r => r.length > 500)) throw new Error("Use 1 to 20 distinct requirements, one per line, at most 500 characters each.");
      await write(db.from("stem_program").update({ introduction: text(form, "introduction", 3000, true), requirements, application_deadline: stemDate(form.get("application_deadline")) }).eq("id", true).select("id"));
    } else if (operation === "approve_program") {
      adminOnly();
      await write(db.from("stem_program").update({ approved_at: new Date().toISOString(), approved_by: staff.display_name }).eq("id", true).select("id"));
    } else if (operation === "enroll") {
      const student_email = text(form, "student_email", 254);
      if (student_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(student_email)) throw new Error("Use a valid student email address.");
      await write(db.from("stem_memberships").insert({ person_id: uuid(form, "person_id"), student_email, created_by: staff.user_id }).select("id"));
    } else if (operation === "application") {
      await write(db.from("stem_memberships").update({ interest: text(form, "interest", 3000, true), goal: text(form, "goal", 3000, true), availability: text(form, "availability", 1000, true), status: "submitted" }).eq("person_id", uuid(form, "person_id")).eq("status", "draft").select("id"));
    } else if (operation === "review") {
      const status = text(form, "status", 30, true);
      if (!STEM_STATUSES.includes(status as typeof STEM_STATUSES[number]) || status === "submitted") throw new Error("Choose an application review outcome.");
      await write(db.from("stem_memberships").update({ status, review_note: text(form, "review_note", 3000) }).eq("person_id", uuid(form, "person_id")).select("id"));
    } else if (operation === "work") {
      const kind = text(form, "kind", 30, true);
      if (!STEM_KINDS.includes(kind as typeof STEM_KINDS[number]) || kind === "summary") throw new Error("Choose a project, meeting, introduction or requirement evidence.");
      const values = {
        title: text(form, "title", 200, true), body: text(form, "body", 12000), next_step: text(form, "next_step", 2000),
        due_date: stemDate(form.get("due_date")), url: safeStemUrl(form.get("url")),
        status: text(form, "status", 20) || "planned", mentor_id: kind === "mentor" ? uuid(form, "mentor_id") : null,
        requirement: kind === "evidence" ? text(form, "requirement", 500, true) : "",
      };
      if (form.get("id")) await write(db.from("stem_work").update(values).eq("id", uuid(form, "id")).eq("person_id", uuid(form, "person_id")).eq("kind", kind).select("id"));
      else await write(db.from("stem_work").insert({ ...values, person_id: uuid(form, "person_id"), kind, created_by: staff.user_id }).select("id"));
    } else if (operation === "approve_work") {
      await write(db.from("stem_work").update({ approved_at: new Date().toISOString(), approved_by: staff.display_name }).eq("id", uuid(form, "id")).in("kind", ["evidence", "summary"]).select("id"));
    } else if (operation === "edit_summary") {
      await write(db.from("stem_work").update({ body: text(form, "body", 12000, true) }).eq("id", uuid(form, "id")).eq("kind", "summary").is("approved_at", null).select("id"));
    } else if (operation === "delivered") {
      await write(db.from("stem_work").update({ delivered_at: new Date().toISOString() }).eq("id", uuid(form, "id")).eq("kind", "summary").not("approved_at", "is", null).select("id"));
    } else if (operation === "mentor") {
      adminOnly();
      const values = { name: text(form, "name", 150, true), kind: text(form, "kind", 20, true), expertise: text(form, "expertise", 1000, true), contact: text(form, "contact", 300), active: form.get("active") === "on" };
      if (form.get("id")) await write(db.from("stem_mentors").update(values).eq("id", uuid(form, "id")).select("id"));
      else await write(db.from("stem_mentors").insert(values).select("id"));
    } else if (operation === "opportunity") {
      adminOnly();
      const values = { title: text(form, "title", 200, true), kind: text(form, "kind", 20, true), organization: text(form, "organization", 200, true), description: text(form, "description", 3000, true), url: safeStemUrl(form.get("url")), deadline: stemDate(form.get("deadline")), published: form.get("published") === "on" };
      if (!values.url) throw new Error("Add an opportunity link.");
      if (form.get("id")) await write(db.from("stem_opportunities").update(values).eq("id", uuid(form, "id")).select("id"));
      else await write(db.from("stem_opportunities").insert(values).select("id"));
    } else if (operation === "link") {
      const token = randomBytes(32).toString("hex");
      await write(db.from("stem_links").insert({ person_id: uuid(form, "person_id"), token_hash: createHash("sha256").update(token).digest("hex"), created_by: staff.user_id }).select("id"));
      await logAccess(staff, "stem_student_link_created", uuid(form, "person_id"));
      revalidatePath("/stem");
      return { ok: true, message: "Private student link created. It expires in 30 days. Copy it now; only its hash is saved.", link: `${await requestOrigin()}/scholars/${token}` };
    } else if (operation === "revoke_links") {
      await write(db.from("stem_links").delete().eq("person_id", uuid(form, "person_id")).select("id"));
    } else if (operation === "summaries") {
      const { data: count, error } = await db.rpc("stem_prepare_due_summaries");
      if (error) throw error;
      revalidatePath("/stem");
      return { ok: true, message: `${count} biweekly draft${count === 1 ? "" : "s"} ready for review. Approved summaries appear on each student's private page.` };
    } else throw new Error("Unknown STEM Scholars action.");
    revalidatePath("/stem");
    revalidatePath("/pilot/people/[id]", "page");
    return { ok: true, message: "Saved." };
  } catch (error) { return errorResult(error); }
}

export async function stemStudentAction(_previous: StemActionResult | null, form: FormData): Promise<StemActionResult> {
  try {
    const token = text(form, "token", 64, true);
    if (!/^[0-9a-f]{64}$/.test(token)) throw new Error("This link is unavailable.");
    const kind = text(form, "kind", 20, true);
    if (!["application", "project", "evidence", "mentor"].includes(kind)) throw new Error("Choose a valid update.");
    let payload: Record<string, unknown>;
    if (kind === "application") payload = { interest: text(form, "interest", 3000, true), goal: text(form, "goal", 3000, true), availability: text(form, "availability", 1000, true) };
    else if (kind === "mentor") payload = { mentor_id: uuid(form, "mentor_id") };
    else {
      payload = { title: text(form, "title", 200, true), body: text(form, "body", 12000, kind === "evidence"), next_step: text(form, "next_step", 2000), due_date: stemDate(form.get("due_date")), url: safeStemUrl(form.get("url")), status: text(form, "status", 20) || "planned" };
      if (kind === "evidence") payload.requirement = text(form, "requirement", 500, true);
      if (kind === "project" && form.get("id")) payload.id = uuid(form, "id");
    }
    const db = await getSorClient();
    const { data, error } = await db.rpc("stem_student_submit", { p_token: token, p_kind: kind, p_data: payload });
    if (error || !data) throw new Error("Unable to save. Your link may have expired, your application may already be submitted, or consent may have changed. Ask your coordinator.");
    revalidatePath(`/scholars/${token}`);
    revalidatePath("/stem");
    return { ok: true, message: kind === "application" ? "Application submitted. Your coordinator will review it." : "Saved. Your coordinator can see your update." };
  } catch (error) { return errorResult(error); }
}
