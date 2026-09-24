"use server";

import fs from "fs";
import path from "path";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { draftObservation, draftRuakhPathways, type RuakhInput } from "@/lib/claude";
import { FORMATION_TAGS, type FormationTag } from "@/lib/types";
import { getSorClient } from "./supabase-server";
import { getCaptureRoster, getPersonProfile, logAccess, requireStaff } from "./queries";
import { matchPeople } from "./match";
import { runImport, type ImportOutcome } from "./importers/run";
import {
  displayName,
  type ConsentScope,
  type LifecycleStage,
  type PersonProfile,
  type SourceSystem,
  type StaffMember,
} from "./types";

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const fail = (e: unknown): { ok: false; error: string } => ({
  ok: false,
  error:
    e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e),
});

async function requireRole(...roles: StaffMember["role"][]): Promise<StaffMember> {
  const staff = await requireStaff();
  if (!roles.includes(staff.role)) throw new Error(`This needs the ${roles.join(" or ")} role.`);
  return staff;
}

function hasConsent(profile: PersonProfile, scope: ConsentScope): boolean {
  return profile.person.is_sample || profile.consents.some((c) => c.scope === scope && !c.revoked_at);
}

// ---------------------------------------------------------------- auth

export async function sendSignInLinkAction(formData: FormData): Promise<Result> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = String(formData.get("next") ?? "/capture");
  if (!email.endsWith("@pacificachristian.org")) {
    return { ok: false, error: "Use your @pacificachristian.org address." };
  }
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const supabase = await getSorClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  return error ? fail(error) : { ok: true };
}

export async function signOutAction() {
  const supabase = await getSorClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// ---------------------------------------------------------------- pilot admin

export async function setGateAction(formData: FormData): Promise<Result> {
  try {
    const staff = await requireRole("admin");
    const open = formData.get("open") === "true";
    const approvedBy = String(formData.get("approved_by") ?? "").trim();
    const reference = String(formData.get("approval_reference") ?? "").trim();
    if (open && (!approvedBy || !reference)) {
      return { ok: false, error: "Enter who approved the pilot and where that approval lives." };
    }
    const supabase = await getSorClient();
    const { error } = await supabase
      .from("pilot_settings")
      .update(
        open
          ? { real_data_enabled: true, approved_by: approvedBy, approval_reference: reference, approved_at: new Date().toISOString() }
          : { real_data_enabled: false }
      )
      .eq("id", true);
    if (error) return fail(error);
    await logAccess(staff, open ? "gate_open" : "gate_close", null, open ? { approvedBy, reference } : {});
    revalidatePath("/pilot");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function loadSamplePilotAction(): Promise<Result<{ added: number }>> {
  try {
    const staff = await requireRole("admin");
    const supabase = await getSorClient();
    const file = path.join(process.cwd(), "fixtures/sample/pilot-roster.json");
    const { people } = JSON.parse(fs.readFileSync(file, "utf-8")) as {
      people: {
        first_name: string;
        last_name: string;
        preferred_name?: string;
        stage: LifecycleStage;
        grad_year?: number;
        current_grade?: number;
        ids: Partial<Record<SourceSystem, string>>;
      }[];
    };
    let added = 0;
    for (const { ids, ...person } of people) {
      const [system, externalId] = Object.entries(ids)[0];
      const { data: existing } = await supabase
        .from("external_ids")
        .select("person_id")
        .eq("system", system)
        .eq("external_id", externalId)
        .maybeSingle();
      if (existing) continue;
      const { data: created, error } = await supabase
        .from("people")
        .insert({ ...person, is_sample: true })
        .select("id")
        .single();
      if (error) return fail(error);
      const { error: idError } = await supabase.from("external_ids").insert(
        Object.entries(ids).map(([sys, ext]) => ({ person_id: created.id, system: sys, external_id: ext }))
      );
      if (idError) return fail(idError);
      added++;
    }
    await logAccess(staff, "load_sample_pilot", null, { added });
    revalidatePath("/pilot");
    return { ok: true, added };
  } catch (e) {
    return fail(e);
  }
}

export async function addParticipantAction(formData: FormData): Promise<Result<{ id: string }>> {
  try {
    const staff = await requireRole("admin");
    const supabase = await getSorClient();
    const str = (k: string) => String(formData.get(k) ?? "").trim() || null;
    const gradYear = str("grad_year");
    const { data: person, error } = await supabase
      .from("people")
      .insert({
        first_name: str("first_name"),
        last_name: str("last_name"),
        preferred_name: str("preferred_name"),
        stage: str("stage") ?? "applicant",
        grad_year: gradYear ? Number(gradYear) : null,
        is_sample: false,
      })
      .select("id")
      .single();
    if (error) return fail(error);

    const ids = (["finalsite", "blackbaud", "canvas"] as const)
      .map((system) => ({ person_id: person.id, system, external_id: str(`${system}_id`) }))
      .filter((r) => r.external_id);
    if (ids.length) {
      const { error: idError } = await supabase.from("external_ids").insert(ids);
      if (idError) {
        await supabase.from("people").delete().eq("id", person.id);
        return fail(idError);
      }
    }
    await logAccess(staff, "add_participant", person.id);
    revalidatePath("/pilot");
    return { ok: true, id: person.id };
  } catch (e) {
    return fail(e);
  }
}

export async function recordConsentAction(formData: FormData): Promise<Result> {
  try {
    const staff = await requireRole("admin");
    const personId = String(formData.get("person_id"));
    const scopes = formData.getAll("scope").map(String) as ConsentScope[];
    const grantedBy = String(formData.get("granted_by") ?? "").trim();
    const grantedOn = String(formData.get("granted_on") ?? "");
    const evidence = String(formData.get("evidence") ?? "").trim();
    if (!scopes.length || !grantedBy || !grantedOn || !evidence) {
      return { ok: false, error: "Pick at least one scope and fill in guardian, date, and where the signed form lives." };
    }
    const supabase = await getSorClient();
    const { error } = await supabase.from("consents").insert(
      scopes.map((scope) => ({
        person_id: personId,
        scope,
        granted_by: grantedBy,
        granted_on: grantedOn,
        evidence,
        recorded_by: staff.user_id,
      }))
    );
    if (error) return fail(error);
    await logAccess(staff, "record_consent", personId, { scopes });
    revalidatePath("/pilot");
    revalidatePath(`/pilot/people/${personId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function revokeConsentAction(consentId: string, personId: string): Promise<Result> {
  try {
    const staff = await requireRole("admin");
    const supabase = await getSorClient();
    const { error } = await supabase
      .from("consents")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", consentId);
    if (error) return fail(error);
    await logAccess(staff, "revoke_consent", personId, { consentId });
    revalidatePath(`/pilot/people/${personId}`);
    revalidatePath("/pilot");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Removes a participant and everything held about them. The access log
 *  keeps the (now dangling) person id so the withdrawal itself is auditable. */
export async function withdrawParticipantAction(personId: string): Promise<Result> {
  try {
    const staff = await requireRole("admin");
    const supabase = await getSorClient();
    const { error } = await supabase.from("people").delete().eq("id", personId);
    if (error) return fail(error);
    await logAccess(staff, "withdraw_participant", personId);
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/pilot");
  redirect("/pilot");
}

export async function runImportAction(system: SourceSystem, formData?: FormData): Promise<Result<{ outcome: ImportOutcome }>> {
  try {
    const staff = await requireRole("admin");
    const file = formData?.get("file");
    const finalsiteCsv = file instanceof File && file.size > 0 ? await file.text() : undefined;
    const supabase = await getSorClient();
    const outcome = await runImport(supabase, staff, system, { finalsiteCsv });
    await logAccess(staff, "import", null, { system, mode: outcome.mode, matched: outcome.matched });
    revalidatePath("/pilot");
    return { ok: true, outcome };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- capture (#3)

export async function matchCaptureAction(
  transcript: string
): Promise<Result<{ candidates: { id: string; name: string; stage: string }[] }>> {
  try {
    await requireStaff();
    const roster = await getCaptureRoster();
    const candidates = matchPeople(transcript, roster).map((m) => ({
      id: m.person.id,
      name: displayName(m.person),
      stage: m.person.stage,
    }));
    return { ok: true, candidates };
  } catch (e) {
    return fail(e);
  }
}

export async function draftCaptureAction(
  personId: string,
  transcript: string
): Promise<
  Result<{ cleanText: string; tags: FormationTag[]; disciplineFlag: string | null; aiUsed: boolean; aiNote: string | null }>
> {
  try {
    await requireStaff();
    const profile = await getPersonProfile(personId);
    if (!profile) return { ok: false, error: "Student not found." };
    if (!hasConsent(profile, "ai_drafting")) {
      return {
        ok: true,
        cleanText: transcript.trim(),
        tags: [],
        disciplineFlag: null,
        aiUsed: false,
        aiNote: "No AI-drafting consent for this student. Saving your words as spoken.",
      };
    }
    const draft = await draftObservation(transcript);
    return {
      ok: true,
      cleanText: draft.cleanText,
      tags: draft.suggestedTags.map((t) => t.tag),
      disciplineFlag: draft.disciplineFlag,
      aiUsed: !draft.usedFallback,
      aiNote: draft.usedFallback ? "AI assist is offline. Lightly tidied, not rewritten." : null,
    };
  } catch (e) {
    return fail(e);
  }
}

export async function saveCaptureAction(input: {
  personId: string;
  rawText: string;
  body: string;
  tags: string[];
  source: "voice" | "text";
  disciplineFlag: string | null;
}): Promise<Result> {
  try {
    const staff = await requireStaff();
    const tags = input.tags.filter((t): t is FormationTag => (FORMATION_TAGS as readonly string[]).includes(t));
    const supabase = await getSorClient();
    const { error } = await supabase.from("observations").insert({
      person_id: input.personId,
      author_id: staff.user_id,
      author_name: staff.display_name,
      source: input.source,
      raw_text: input.rawText,
      body: input.body.trim() || input.rawText,
      tags,
      discipline_flag: input.disciplineFlag,
    });
    if (error) return fail(error);
    await logAccess(staff, "capture_observation", input.personId, { source: input.source });
    revalidatePath(`/pilot/people/${input.personId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- who they are today (#2)

function toRuakhInput(profile: PersonProfile): RuakhInput {
  const { person, admissions, enrollment, courses, evidence, observations } = profile;
  const courseName = new Map(courses.map((c) => [c.canvas_course_id, c.course_name]));
  return {
    firstName: person.preferred_name || person.first_name,
    stage: person.stage,
    grade: enrollment?.grade ?? person.current_grade,
    previousSchool: admissions?.previous_school ?? null,
    interests: admissions?.interests ?? [],
    activities: admissions?.activities ?? [],
    applicationResponses: admissions?.responses ?? [],
    courses: courses.map((c) => ({ name: c.course_name, teacher: c.teacher_name })),
    teacherComments: evidence
      .filter((e) => e.teacher_comment)
      .map((e) => ({
        course: courseName.get(e.canvas_course_id) ?? "a course",
        assignment: e.assignment_name,
        comment: e.teacher_comment!,
      })),
    observations: observations.map((o) => ({
      author: o.author_name,
      text: o.body,
      tags: o.tags,
      date: o.created_at.slice(0, 10),
    })),
  };
}

export async function draftPathwaysAction(personId: string): Promise<Result> {
  try {
    const staff = await requireRole("admin", "admissions");
    const profile = await getPersonProfile(personId);
    if (!profile) return { ok: false, error: "Student not found." };
    if (!hasConsent(profile, "ai_drafting")) {
      return { ok: false, error: "No AI-drafting consent on file for this student." };
    }
    const input = toRuakhInput(profile);
    const draft = await draftRuakhPathways(input);
    const sources = [
      profile.admissions && "finalsite",
      profile.enrollment && "blackbaud",
      profile.courses.length && "canvas",
      profile.observations.length && "observations",
    ].filter(Boolean) as string[];
    const supabase = await getSorClient();
    const { error } = await supabase.from("pathway_drafts").insert({
      person_id: personId,
      portrait: draft.portrait,
      pathways: draft.pathways,
      sources_used: sources,
      used_fallback: draft.usedFallback,
      generated_by: staff.user_id,
    });
    if (error) return fail(error);
    await logAccess(staff, "draft_pathways", personId, { usedFallback: draft.usedFallback, sources });
    revalidatePath(`/pilot/people/${personId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function approveDraftAction(draftId: string, personId: string): Promise<Result> {
  try {
    const staff = await requireRole("admin", "admissions");
    const supabase = await getSorClient();
    const { error } = await supabase
      .from("pathway_drafts")
      .update({ status: "approved", approved_by: staff.display_name, approved_at: new Date().toISOString() })
      .eq("id", draftId);
    if (error) return fail(error);
    await logAccess(staff, "approve_draft", personId, { draftId });
    revalidatePath(`/pilot/people/${personId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
