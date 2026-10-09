"use server";

import fs from "fs";
import { createHash, randomBytes } from "crypto";
import path from "path";
import { requestOrigin } from "@/lib/origin";
import { safeNext } from "@/lib/safe-next";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { draftAdmissionsPathways, draftObservation, draftRuakhPathways } from "@/lib/claude";
import { inquiryInput, pathwayInput, personPseudonymizer } from "./ai-input";
import { DEMO_FAMILIES } from "@/lib/discover-demo";
import { audienceForStage, FORMATION_TAGS, PATHWAY_PLAN, type FormationTag, type GeneratedPathway } from "@/lib/types";
import { sanitizeGlimpse, sanitizeMilestones, sanitizeUniqueness } from "@/lib/pathway-journey";
import { getSorClient } from "./supabase-server";
import { getCaptureRoster, getInquiry, getPersonProfile, getRoster, logAccess, requireStaff } from "./queries";
import { matchPeople } from "./match";
import { runImport, type ImportOutcome } from "./importers/run";
import { runFunnelImport, type FunnelImportOutcome } from "./importers/run-funnel";
import { seasonOf } from "./funnel";
import { checkFinalsiteConnection } from "./importers/finalsite-api";
import { checkBlackbaudUser } from "./importers/blackbaud";
import { blackbaudConnection, FLOW_COOKIE, TOKEN_COOKIE } from "./blackbaud-auth";
import { cookies } from "next/headers";
import { validateStudentSparks } from "./sparks";
import {
  INQUIRY_STATUSES,
  displayName,
  type ConsentScope,
  type LifecycleStage,
  type PersonProfile,
  type SourceSystem,
  type StaffMember,
} from "./types";

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const fail = (e: unknown): { ok: false; error: string } => {
  const message = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e);
  // requireStaff redirects a signed-out user to /login; inside an action that
  // surfaces as "NEXT_REDIRECT". Whatever's on screen is still in the tab.
  if (message === "NEXT_REDIRECT" || message.startsWith("NEXT_REDIRECT;")) {
    return {
      ok: false,
      error: "Your sign-in has expired. Sign in again in a new tab, then come back here and try again. Nothing on this screen is lost.",
    };
  }
  return { ok: false, error: message };
};

async function requireRole(...roles: StaffMember["role"][]): Promise<StaffMember> {
  const staff = await requireStaff();
  if (!roles.includes(staff.role)) throw new Error(`This needs the ${roles.join(" or ")} role.`);
  return staff;
}

function hasConsent(profile: PersonProfile, scope: ConsentScope): boolean {
  return profile.person.is_sample || profile.consents.some((c) => c.scope === scope && !c.revoked_at);
}

/** A real student's details reach Claude only when BOTH the family consented
 *  (ai_drafting) AND the school has switched real-student AI on
 *  (AI_REAL_STUDENTS=on), which waits on confirming that Pacifica's Anthropic
 *  terms cover student data. Sample students and the fictional demo only need
 *  the key, so an API key set for a demo can't reach a real record by itself. */
const realStudentAiOn = () => process.env.AI_REAL_STUDENTS?.trim() === "on";
const AI_OFF_FOR_REAL =
  "AI for real students is switched off until the school confirms Anthropic's terms cover student data (AI_REAL_STUDENTS).";

// ---------------------------------------------------------------- auth


/** Emails a 6-digit sign-in code (and a link, for laptops). The code is what
 *  makes phones work: the link often opens in a different browser or inside
 *  the mail app, and an iPhone home-screen app never sees Safari's cookies. */
export async function sendSignInLinkAction(formData: FormData): Promise<Result> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = safeNext(formData.get("next"));
  if (!email.endsWith("@pacificachristian.org")) {
    return { ok: false, error: "Use your @pacificachristian.org address." };
  }
  const origin = await requestOrigin();
  const supabase = await getSorClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  return error ? fail(error) : { ok: true };
}

export async function verifySignInCodeAction(formData: FormData): Promise<Result> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6,10}$/.test(token)) return { ok: false, error: "Enter the code from the email." };
  const supabase = await getSorClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) return { ok: false, error: "That code didn't work. It may have expired, so request a new one." };
  redirect(safeNext(formData.get("next")));
}

/** "Continue with Google": Supabase's Google provider, school accounts only.
 *  Off until GOOGLE_SIGNIN=on (IT's Internal OAuth client + the provider
 *  enabled in Supabase). `hd` only pre-selects the school domain in Google's
 *  chooser; the Internal consent screen and the staff trigger are what keep
 *  other accounts out. */
export async function signInWithGoogleAction(formData: FormData): Promise<Result> {
  if (process.env.GOOGLE_SIGNIN?.trim() !== "on") return { ok: false, error: "Google sign-in isn't switched on yet." };
  const next = safeNext(formData.get("next"));
  const origin = await requestOrigin();
  const supabase = await getSorClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      queryParams: { hd: "pacificachristian.org", prompt: "select_account" },
    },
  });
  if (error || !data.url) return fail(error ?? new Error("Google sign-in didn't start."));
  redirect(data.url);
}

export async function signOutAction() {
  const supabase = await getSorClient();
  await supabase.auth.signOut();
  // The Blackbaud token is tied to whoever connected it; don't leave it for
  // the next person who signs in on this browser.
  const jar = await cookies();
  jar.delete(TOKEN_COOKIE);
  jar.set(FLOW_COOKIE, "", { path: "/auth/blackbaud", maxAge: 0 });
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

const STAFF_ROLES: StaffMember["role"][] = ["admin", "admissions", "teacher", "staff"];

/** Approve, change the role of, or deactivate a staff member. Never your own
 *  row, so an admin can't lock themselves (and everyone else) out. */
export async function setStaffAction(
  userId: string,
  change: { role?: StaffMember["role"]; active?: boolean }
): Promise<Result> {
  try {
    const staff = await requireRole("admin");
    if (userId === staff.user_id) return { ok: false, error: "Ask another admin to change your own access." };
    if (change.role && !STAFF_ROLES.includes(change.role)) return { ok: false, error: "Unknown role." };
    const update: { role?: StaffMember["role"]; active?: boolean } = {};
    if (change.role) update.role = change.role;
    if (typeof change.active === "boolean") update.active = change.active;
    const supabase = await getSorClient();
    const { data, error } = await supabase.from("staff").update(update).eq("user_id", userId).select("user_id");
    if (error) return fail(error);
    if (!data?.length) return { ok: false, error: "No such staff member." };
    await logAccess(staff, "staff_change", null, { userId, ...update });
    revalidatePath("/pilot");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setAutoApproveStaffAction(on: boolean): Promise<Result> {
  try {
    const staff = await requireRole("admin");
    const supabase = await getSorClient();
    const { error } = await supabase.from("pilot_settings").update({ auto_approve_staff: on }).eq("id", true);
    if (error) return fail(error);
    await logAccess(staff, on ? "auto_approve_staff_on" : "auto_approve_staff_off", null);
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

const ID_RULES: Record<"finalsite" | "blackbaud" | "canvas", { label: string; pattern: RegExp }> = {
  finalsite: { label: "Finalsite Person ID", pattern: /^[A-Za-z0-9-]{1,64}$/ },
  blackbaud: { label: "Blackbaud user id", pattern: /^\d{1,12}$/ },
  canvas: { label: "Canvas user id", pattern: /^\d{1,12}$/ },
};

/** Set, change or clear a participant's Finalsite / Blackbaud / Canvas ids
 *  after they were added. Admin only (RLS too). Importers match on these, so
 *  an id can belong to one person per system. */
export async function setExternalIdsAction(formData: FormData): Promise<Result> {
  try {
    const staff = await requireRole("admin");
    const personId = String(formData.get("person_id") ?? "");
    const supabase = await getSorClient();
    const { data: person } = await supabase.from("people").select("id, is_sample").eq("id", personId).maybeSingle();
    if (!person) throw new Error("That person isn't on the pilot.");
    if (person.is_sample) throw new Error("Sample students keep their fictional ids.");

    const changed: string[] = [];
    for (const system of ["finalsite", "blackbaud", "canvas"] as const) {
      const value = String(formData.get(`${system}_id`) ?? "").trim();
      const { label, pattern } = ID_RULES[system];
      if (!value) {
        const { error, count } = await supabase
          .from("external_ids")
          .delete({ count: "exact" })
          .eq("person_id", personId)
          .eq("system", system);
        if (error) return fail(error);
        if (count) changed.push(`${system} cleared`);
        continue;
      }
      if (!pattern.test(value)) throw new Error(`${label} doesn't look right (${system === "finalsite" ? "letters, digits and dashes" : "digits only"}).`);
      const { data: existing } = await supabase
        .from("external_ids")
        .select("external_id")
        .eq("person_id", personId)
        .eq("system", system)
        .maybeSingle();
      if (existing?.external_id === value) continue;
      const { error } = existing
        ? await supabase.from("external_ids").update({ external_id: value }).eq("person_id", personId).eq("system", system)
        : await supabase.from("external_ids").insert({ person_id: personId, system, external_id: value });
      if (error) {
        if ((error as { code?: string }).code === "23505") throw new Error(`That ${label} already belongs to another person on the pilot.`);
        return fail(error);
      }
      changed.push(system);
    }
    if (changed.length) await logAccess(staff, "update_external_ids", personId, { changed });
    revalidatePath(`/pilot/people/${personId}`);
    revalidatePath("/pilot");
    return { ok: true };
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
    const { data, error } = await supabase
      .from("consents")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", consentId)
      .eq("person_id", personId)
      .is("revoked_at", null)
      .select("id");
    if (error) return fail(error);
    if (!data?.length) throw new Error("That consent isn't active for this student.");
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
    const blackbaudToken = system === "blackbaud" ? (await blackbaudConnection()).token : null;
    const outcome = await runImport(supabase, staff, system, { finalsiteCsv, blackbaudToken });
    await logAccess(staff, "import", null, { system, mode: outcome.mode, matched: outcome.matched });
    revalidatePath("/pilot");
    return { ok: true, outcome };
  } catch (e) {
    return fail(e);
  }
}

/** Field names from ONE Blackbaud user (meant for the admin's own staff
 *  record), never values: proves the connection and checks the field map
 *  before any student is pulled. */
export async function checkBlackbaudAction(
  formData: FormData
): Promise<Result<{ check: Awaited<ReturnType<typeof checkBlackbaudUser>> }>> {
  try {
    const staff = await requireRole("admin");
    const id = String(formData.get("blackbaud_id") ?? "").trim();
    if (!/^\d{1,12}$/.test(id)) throw new Error("Enter a Blackbaud user id (digits only), ideally your own.");
    const { token } = await blackbaudConnection();
    if (!token) throw new Error("Connect Blackbaud first (the connection lasts an hour).");
    const check = await checkBlackbaudUser(id, token);
    await logAccess(staff, "blackbaud_check", null, { found: check.found });
    return { ok: true, check };
  } catch (e) {
    return fail(e);
  }
}

export async function disconnectBlackbaudAction(): Promise<Result<object>> {
  try {
    await requireRole("admin");
    (await cookies()).delete(TOKEN_COOKIE);
    revalidatePath("/pilot");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- admissions season

/** Record (or withdraw) approval to show LIVE Finalsite counts. Counts only,
 *  no per-student data, so this is separate from the pilot gate, but it
 *  still names who approved it and where, and the change is logged. */
export async function setFunnelApprovalAction(formData: FormData): Promise<Result> {
  try {
    const staff = await requireRole("admin");
    const open = formData.get("open") === "true";
    const approvedBy = String(formData.get("approved_by") ?? "").trim();
    const reference = String(formData.get("approval_reference") ?? "").trim();
    if (open && (!approvedBy || !reference)) {
      return { ok: false, error: "Enter who approved showing live counts and where that approval lives." };
    }
    const supabase = await getSorClient();
    const { error } = await supabase
      .from("pilot_settings")
      .update(
        open
          ? {
              funnel_live_enabled: true,
              funnel_approved_by: approvedBy,
              funnel_approval_reference: reference,
              funnel_approved_at: new Date().toISOString(),
            }
          : { funnel_live_enabled: false }
      )
      .eq("id", true);
    if (error) return fail(error);
    await logAccess(staff, open ? "funnel_live_open" : "funnel_live_close", null, open ? { approvedBy, reference } : {});
    revalidatePath("/season");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- inquiries (/discover)

/** Opens or closes the public /discover form. Opening records who approved
 *  storing prospective families' details, and where (DB-enforced). */
export async function setInquiriesApprovalAction(formData: FormData): Promise<Result> {
  try {
    const staff = await requireRole("admin");
    const open = formData.get("open") === "true";
    const approvedBy = String(formData.get("approved_by") ?? "").trim();
    const reference = String(formData.get("approval_reference") ?? "").trim();
    if (open && (!approvedBy || !reference)) {
      return { ok: false, error: "Enter who approved collecting inquiries here and where that approval lives." };
    }
    const supabase = await getSorClient();
    const { error } = await supabase
      .from("pilot_settings")
      .update(
        open
          ? {
              inquiries_open: true,
              inquiries_approved_by: approvedBy,
              inquiries_approval_reference: reference,
              inquiries_approved_at: new Date().toISOString(),
            }
          : { inquiries_open: false }
      )
      .eq("id", true);
    if (error) return fail(error);
    await logAccess(staff, open ? "inquiries_open" : "inquiries_close", null, open ? { approvedBy, reference } : {});
    revalidatePath("/pilot/inquiries");
    revalidatePath("/discover");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Admissions moves an inquiry along. Only follow-up fields change; what the
 *  family sent is fixed (DB trigger). */
export async function updateInquiryStatusAction(id: string, status: string): Promise<Result> {
  try {
    const staff = await requireRole("admin", "admissions");
    if (!(INQUIRY_STATUSES as string[]).includes(status)) throw new Error("Unknown status.");
    const supabase = await getSorClient();
    const { data, error } = await supabase
      .from("inquiries")
      .update({ status, ...(status === "applied" ? { applied_at: new Date().toISOString() } : {}) })
      .eq("id", id)
      .select("id");
    if (error) return fail(error);
    if (!data?.length) throw new Error("That inquiry isn't available.");
    await logAccess(staff, "inquiry_status", null, { inquiry: id, status });
    revalidatePath("/pilot/inquiries");
    revalidatePath("/pilot/inquiries/referrals");
    revalidatePath(`/pilot/inquiries/${id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** A fictional inquiry, for trying the inbox and the Finalsite export before
 *  any real family uses the form. Never exported (the export skips samples). */
export async function addSampleInquiryAction(): Promise<Result> {
  try {
    const staff = await requireRole("admin");
    const supabase = await getSorClient();
    const n = Math.floor(Math.random() * 900) + 100;
    const { error } = await supabase.from("inquiries").insert({
      is_sample: true,
      share_code: randomBytes(4).toString("hex").toUpperCase(),
      source: "website",
      parent_first_name: "Sample",
      parent_last_name: `Family ${n}`,
      parent_relationship: "Mother",
      parent_email: `sample${n}@example.com`,
      address_1: "1 Example Way",
      city: "Newport Beach",
      state: "CA",
      zip: "92660",
      child_first_name: "Alex",
      child_last_name: `Family ${n}`,
      child_grade: 9,
      entry_year: new Date().getFullYear() + 1,
      current_school: "Harbor View Middle School",
      one_thing: "Builds radios from thrift-store parts and keeps the ones that almost work.",
      interests: ["STEM", "Surf"],
      consent_contact: true,
      consent_pathway: true,
      consent_version: "sample",
    });
    if (error) return fail(error);
    await logAccess(staff, "inquiry_sample_add", null, {});
    revalidatePath("/pilot/inquiries");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Five fictional families (lib/discover-demo.ts) for admissions to try the
 *  whole flow. Samples: never exported, clearly marked. */
export async function addDemoFamiliesAction(): Promise<Result<{ added: number }>> {
  try {
    const staff = await requireRole("admin", "admissions");
    const supabase = await getSorClient();
    const year = new Date().getMonth() >= 3 ? new Date().getFullYear() + 1 : new Date().getFullYear();
    const rows = DEMO_FAMILIES.map((f, n) => ({
      ...f,
      is_sample: true,
      share_code: randomBytes(4).toString("hex").toUpperCase(),
      source: "website",
      parent_email: `${f.parent_first_name.toLowerCase()}.${f.parent_last_name.toLowerCase()}@example.com`,
      address_1: `${120 + n * 7} Example Way`,
      city: "Newport Beach",
      state: "CA",
      zip: "92660",
      entry_year: year,
      consent_contact: true,
      consent_pathway: true,
      consent_version: "demo",
    }));
    const { error } = await supabase.from("inquiries").insert(rows);
    if (error) return fail(error);
    await logAccess(staff, "inquiry_demo_families", null, { added: rows.length });
    revalidatePath("/pilot/inquiries");
    return { ok: true, added: rows.length };
  } catch (e) {
    return fail(e);
  }
}

/** Drafts a Formation Pathway for an inquiring family, from their own words
 *  (lib/discover.ts inquiryDraftInput). Only if they asked for one; AI on a
 *  real family waits on AI_REAL_STUDENTS, like students. Saved as a draft
 *  that a named staff member signs. */
export async function draftInquiryPathwayAction(inquiryId: string): Promise<Result<{ usedFallback: boolean }>> {
  try {
    const staff = await requireRole("admin", "admissions");
    const found = await getInquiry(inquiryId);
    if (!found) throw new Error("That inquiry isn't available.");
    const { inquiry } = found;
    if (!inquiry.consent_pathway) throw new Error("This family didn't ask for a Formation Pathway.");
    if (!inquiry.is_sample && !realStudentAiOn()) throw new Error(AI_OFF_FOR_REAL);
    const { answers, context, anon } = inquiryInput(inquiry);
    anon.assertNoNames(JSON.stringify({ answers, context }));
    // Two for an inquiry: they've told us one thing. More come with the application.
    const drafted = await draftAdmissionsPathways(answers, context, PATHWAY_PLAN.inquiry.draft);
    const result = anon.restoreDeep(drafted.result);
    const usedFallback = drafted.usedFallback;
    if (!result.pathways.length) throw new Error("No pathway came back. Try again.");
    const supabase = await getSorClient();
    const { error } = await supabase
      .from("inquiry_pathways")
      .insert({ inquiry_id: inquiry.id, pathways: result.pathways, used_fallback: usedFallback, generated_by: staff.user_id });
    if (error) return fail(error);
    await logAccess(staff, "inquiry_pathway_draft", null, { inquiry: inquiry.id, usedFallback });
    revalidatePath(`/pilot/inquiries/${inquiry.id}`);
    return { ok: true, usedFallback };
  } catch (e) {
    return fail(e);
  }
}

/** Signs a pathway draft, keeping the pathways staff chose. The database
 *  records the signer's own name and makes it read-only. */
export async function signInquiryPathwayAction(pathwayId: string, inquiryId: string, keep: number[]): Promise<Result> {
  try {
    const staff = await requireRole("admin", "admissions");
    const found = await getInquiry(inquiryId);
    const draft = found?.drafts.find((d) => d.id === pathwayId && d.status === "draft");
    if (!draft) throw new Error("Only an unsigned draft for this family can be signed.");
    // Staff keep the ones worth sending (three is the usual), in draft order.
    const chosen = [...new Set(keep)].filter((i) => Number.isInteger(i) && draft.pathways[i]).sort((a, b) => a - b);
    if (chosen.length < 1 || chosen.length > 3) throw new Error("Keep one to three pathways to sign.");
    const supabase = await getSorClient();
    const { data, error } = await supabase
      .from("inquiry_pathways")
      .update({ status: "approved", pathways: chosen.map((i) => draft.pathways[i]) })
      .eq("id", pathwayId)
      .eq("inquiry_id", inquiryId)
      .eq("status", "draft")
      .select("id");
    if (error) return fail(error);
    if (!data?.length) throw new Error("Only an unsigned draft for this family can be signed.");
    await logAccess(staff, "inquiry_pathway_sign", null, { inquiry: inquiryId, pathway: pathwayId });
    revalidatePath(`/pilot/inquiries/${inquiryId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Makes the private link an inquiring family opens their page with (after
 *  signing). Shown once: only its hash is stored. Earlier links keep working
 *  until they expire or are ended. */
export async function createFamilyLinkAction(inquiryId: string): Promise<Result<{ url: string; expiresAt: string }>> {
  try {
    const staff = await requireRole("admin", "admissions");
    const token = randomBytes(24).toString("base64url");
    const supabase = await getSorClient();
    const { data, error } = await supabase
      .from("inquiry_family_links")
      .insert({ inquiry_id: inquiryId, token_hash: createHash("sha256").update(token, "utf8").digest("hex"), created_by: staff.user_id })
      .select("expires_at")
      .single();
    if (error) return fail(error);
    await logAccess(staff, "inquiry_family_link", null, { inquiry: inquiryId });
    revalidatePath(`/pilot/inquiries/${inquiryId}`);
    return { ok: true, url: `${await requestOrigin()}/welcome/${token}`, expiresAt: data.expires_at };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- referrals and thank-yous

/** Admin records leadership's decision on referral thank-yous (what, when,
 *  how many), or turns them off. The database refuses cash and an
 *  unrecorded approval. docs/referrals.md. */
export async function setReferralThanksDecisionAction(formData: FormData): Promise<Result> {
  try {
    const staff = await requireRole("admin");
    const open = formData.get("open") === "true";
    const what = String(formData.get("what") ?? "").trim();
    const on = formData.get("on") === "enrolled" ? "enrolled" : "applied";
    const cap = Number(formData.get("cap"));
    const approvedBy = String(formData.get("approved_by") ?? "").trim();
    const reference = String(formData.get("approval_reference") ?? "").trim();
    if (open && (!what || !approvedBy || !reference)) {
      return { ok: false, error: "Enter what the thank-you is, who approved it and where that approval lives." };
    }
    if (open && !(Number.isInteger(cap) && cap >= 1 && cap <= 10)) return { ok: false, error: "The cap is 1 to 10 per family." };
    const supabase = await getSorClient();
    const { error } = await supabase
      .from("pilot_settings")
      .update(
        open
          ? {
              referral_thanks_open: true,
              referral_thanks_what: what,
              referral_thanks_on: on,
              referral_thanks_cap: cap,
              referral_thanks_approved_by: approvedBy,
              referral_thanks_approval_reference: reference,
              referral_thanks_approved_at: new Date().toISOString(),
            }
          : { referral_thanks_open: false }
      )
      .eq("id", true);
    if (error) {
      if (/referral_thanks_not_cash/.test(error.message)) return { ok: false, error: "A thank-you can't be cash or a cash equivalent." };
      return fail(error);
    }
    await logAccess(staff, open ? "referral_thanks_open" : "referral_thanks_close", null, open ? { what, on, cap, approvedBy, reference } : {});
    revalidatePath("/pilot/inquiries/referrals");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Admissions confirms that a family came through another family's link.
 *  The database checks it's the code that brought them and not the same family. */
export async function confirmReferralAction(referredInquiryId: string): Promise<Result> {
  try {
    const staff = await requireRole("admin", "admissions");
    const supabase = await getSorClient();
    const { data: referred } = await supabase.from("inquiries").select("id, referred_by_code").eq("id", referredInquiryId).maybeSingle();
    if (!referred?.referred_by_code) throw new Error("This family didn't come through another family's link.");
    const { data: referrer } = await supabase.from("inquiries").select("id").eq("share_code", referred.referred_by_code).maybeSingle();
    if (!referrer) throw new Error("The family whose link it was isn't available.");
    const { error } = await supabase
      .from("referral_thanks")
      .insert({ referred_inquiry_id: referred.id, referrer_inquiry_id: referrer.id });
    if (error) return fail(error.code === "23505" ? new Error("Already confirmed.") : error);
    await logAccess(staff, "referral_confirm", null, { inquiry: referred.id, referrer: referrer.id });
    revalidatePath("/pilot/inquiries/referrals");
    revalidatePath(`/pilot/inquiries/${referred.id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** The next step for a thank-you: approve, record it sent, or decline with a
 *  note. The database records who did each step and enforces the rules. */
export async function stepReferralThanksAction(id: string, step: "approved" | "sent" | "declined", note?: string): Promise<Result> {
  try {
    const staff = await requireRole("admin", "admissions");
    if (!["approved", "sent", "declined"].includes(step)) throw new Error("Unknown step.");
    const supabase = await getSorClient();
    const { data, error } = await supabase
      .from("referral_thanks")
      .update({ status: step, ...(step === "declined" ? { note: (note ?? "").trim().slice(0, 500) } : {}) })
      .eq("id", id)
      .select("id, referred_inquiry_id");
    if (error) return fail(error);
    if (!data?.length) throw new Error("That referral isn't available.");
    await logAccess(staff, `referral_thanks_${step}`, null, { referral: id });
    revalidatePath("/pilot/inquiries/referrals");
    revalidatePath(`/pilot/inquiries/${data[0].referred_inquiry_id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Ends every private link for a family (their public shares are separate:
 *  the family stops those, or the inquiry is closed). */
export async function endFamilyLinksAction(inquiryId: string): Promise<Result> {
  try {
    const staff = await requireRole("admin", "admissions");
    const supabase = await getSorClient();
    const { error } = await supabase.from("inquiry_family_links").delete().eq("inquiry_id", inquiryId);
    if (error) return fail(error);
    await logAccess(staff, "inquiry_family_link_end", null, { inquiry: inquiryId });
    revalidatePath(`/pilot/inquiries/${inquiryId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function runFunnelImportAction(mode: "sample" | "live"): Promise<Result<{ outcome: FunnelImportOutcome }>> {
  try {
    const staff = await requireRole("admin");
    const supabase = await getSorClient();
    const outcome = await runFunnelImport(supabase, staff, mode);
    await logAccess(staff, "funnel_import", null, { mode, rows: outcome.rows, error: outcome.error });
    revalidatePath("/season");
    return { ok: true, outcome };
  } catch (e) {
    return fail(e);
  }
}

/** Field names and object count from one Finalsite page, never values. */
export async function checkFinalsiteConnectionAction(): Promise<
  Result<{ check: Awaited<ReturnType<typeof checkFinalsiteConnection>> }>
> {
  try {
    const staff = await requireRole("admin");
    const check = await checkFinalsiteConnection(seasonOf(new Date().toISOString().slice(0, 10)));
    await logAccess(staff, "finalsite_check", null, { objects: check.objectsOnFirstPage });
    return { ok: true, check };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- capture (#3)

export async function matchCaptureAction(
  transcript: string
): Promise<Result<{ candidates: { id: string; name: string; stage: string }[]; confident: boolean }>> {
  try {
    await requireStaff();
    const roster = await getCaptureRoster();
    const matches = matchPeople(transcript, roster);
    const candidates = matches.map((m) => ({
      id: m.person.id,
      name: displayName(m.person),
      stage: m.person.stage,
    }));
    // Skip the "who is this?" step only when one name clearly wins. The
    // review screen still names the student, with a "Wrong student" link.
    const confident = matches.length > 0 && (matches.length === 1 || matches[0].score - matches[1].score >= 1);
    return { ok: true, candidates, confident };
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
    const staff = await requireStaff();
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
    if (!profile.person.is_sample && !realStudentAiOn()) {
      return {
        ok: true,
        cleanText: transcript.trim(),
        tags: [],
        disciplineFlag: null,
        aiUsed: false,
        aiNote: `${AI_OFF_FOR_REAL} Saving your words as spoken.`,
      };
    }
    const anon = personPseudonymizer(profile, await getRoster(), staff.display_name);
    const sent = anon.scrub(transcript, { dictation: true });
    anon.assertNoNames(sent);
    const draft = anon.restoreDeep(await draftObservation(sent));
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

export async function draftPathwaysAction(personId: string): Promise<Result> {
  try {
    const staff = await requireRole("admin", "admissions");
    const profile = await getPersonProfile(personId);
    if (!profile) return { ok: false, error: "Student not found." };
    if (!hasConsent(profile, "ai_drafting")) {
      return { ok: false, error: "No AI-drafting consent on file for this student." };
    }
    if (!profile.person.is_sample && !realStudentAiOn()) {
      return { ok: false, error: `${AI_OFF_FOR_REAL} Sample students can be drafted now.` };
    }
    // Names out before it leaves, back in after (lib/sor/anonymize.ts).
    const { input, anon } = pathwayInput(profile, await getRoster(), staff.display_name);
    anon.assertNoNames(JSON.stringify(input));
    const plan = PATHWAY_PLAN[audienceForStage(profile.person.stage)];
    const draft = anon.restoreDeep(await draftRuakhPathways(input, plan.draft));
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

/** Staff edit a pathway draft before signing it (principle #1: humans
 *  author, AI drafts). Signed drafts are locked; draft again to change one. */
export async function updateDraftPathwaysAction(input: {
  draftId: string;
  personId: string;
  pathways: GeneratedPathway[];
}): Promise<Result> {
  try {
    const staff = await requireRole("admin", "admissions");
    const clip = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
    const supabase = await getSorClient();
    const { data: who } = await supabase.from("people").select("stage").eq("id", input.personId).maybeSingle();
    if (!who) throw new Error("Student not found.");
    const plan = PATHWAY_PLAN[audienceForStage(who.stage)];
    const pathways = input.pathways.slice(0, plan.draft).map((p) => {
      // Fewer than three complete milestones, or an empty glimpse, means
      // "none": the journey visual then derives its steps.
      const milestones = sanitizeMilestones(p.milestones);
      const glimpse = sanitizeGlimpse(p.glimpse);
      return {
        name: clip(p.name, 120),
        firstSemester: clip(p.firstSemester, 1500),
        mentorArchetype: clip(p.mentorArchetype, 800),
        stretchChallenge: clip(p.stretchChallenge, 800),
        fourYearHorizon: (Array.isArray(p.fourYearHorizon) ? p.fourYearHorizon : []).map((h) => clip(h, 300)).filter(Boolean).slice(0, 6),
        ...(milestones ? { milestones } : {}),
        ...(glimpse ? { glimpse } : {}),
        // A why-now only stands with its source; clearing either drops both.
        ...sanitizeUniqueness(p as unknown as Record<string, unknown>),
      };
    });
    if (pathways.length < plan.keepMin) {
      throw new Error(`Keep at least ${plan.keepMin} ${plan.keepMin === 1 ? "pathway" : "pathways"}.`);
    }
    if (pathways.some((p) => !p.name || !p.firstSemester)) {
      throw new Error("Each pathway needs a name and a first-semester description.");
    }
    const { data, error } = await supabase
      .from("pathway_drafts")
      .update({ pathways })
      .eq("id", input.draftId)
      .eq("person_id", input.personId)
      .eq("status", "draft")
      .select("id");
    if (error) return fail(error);
    if (!data?.length) throw new Error("Only an unsigned draft can be edited. Draft again to change a signed one.");
    await logAccess(staff, "edit_draft", input.personId, { draftId: input.draftId });
    revalidatePath(`/pilot/people/${input.personId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Save a Spark conversation (what lights the student up), as the adult who's
 *  signed in. The database refuses it without student_voice consent. */
export async function saveStudentSparksAction(input: { personId: string; sparks: unknown }): Promise<Result> {
  try {
    const staff = await requireStaff();
    const checked = validateStudentSparks(input.sparks);
    if (!checked.ok) return { ok: false, error: checked.error };
    const supabase = await getSorClient();
    const { error } = await supabase
      .from("student_sparks")
      .insert({ person_id: input.personId, sparks: checked.sparks, created_by: staff.user_id });
    if (error) {
      return {
        ok: false,
        error: /student_voice/.test(error.message)
          ? "There's no student-voice consent on file for this student, so their sparks can't be saved."
          : error.message,
      };
    }
    await logAccess(staff, "student_sparks", input.personId, {
      answers: checked.sparks.answers.length,
      picks: checked.sparks.picks.length,
      channels: checked.sparks.channels.length,
    });
    revalidatePath(`/pilot/people/${input.personId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const SPARK_LINK_DAYS = 7;

/** Make a one-time, write-only link a family can open at home to do Spark
 *  together. Only the token's hash is stored, so the URL is returned once
 *  and can't be shown again. Needs student_voice consent (DB trigger). */
export async function createSparkLinkAction(personId: string): Promise<Result<{ url: string; expiresAt: string }>> {
  try {
    const staff = await requireStaff();
    const supabase = await getSorClient();
    const { data: person } = await supabase
      .from("people")
      .select("first_name, preferred_name")
      .eq("id", personId)
      .maybeSingle();
    if (!person) throw new Error("Student not found.");
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SPARK_LINK_DAYS * 86_400_000).toISOString();
    const { error } = await supabase.from("spark_links").insert({
      person_id: personId,
      token_hash: createHash("sha256").update(token, "utf8").digest("hex"),
      first_name: (person.preferred_name || person.first_name).slice(0, 60),
      created_by: staff.user_id,
      expires_at: expiresAt,
    });
    if (error) {
      return {
        ok: false,
        error: /student_voice/.test(error.message)
          ? "There's no student-voice consent on file for this student, so a link can't be sent."
          : /spark_links/.test(error.message)
            ? "Family links need a database update first (migration 20261004150000_spark_family_links.sql). Ask an admin to apply it."
            : error.message,
      };
    }
    await logAccess(staff, "spark_link_create", personId, { expiresAt });
    return { ok: true, url: `${await requestOrigin()}/spark/family/${token}`, expiresAt };
  } catch (e) {
    return fail(e);
  }
}

/** The family's submit from /spark/family/[token]. No sign-in: the database
 *  function checks the token (hash), expiry, single use and consent, and
 *  saves the sparks as the staff member who sent the link. */
export async function submitFamilySparksAction(input: { token: string; sparks: unknown }): Promise<Result> {
  try {
    const checked = validateStudentSparks(input.sparks);
    if (!checked.ok) return { ok: false, error: checked.error };
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(input.token)) return { ok: false, error: "This link isn't valid." };
    const supabase = await getSorClient();
    const { data, error } = await supabase.rpc("spark_link_submit", { p_token: input.token, p_sparks: checked.sparks });
    if (error) return { ok: false, error: "Something went wrong saving your sparks. Please try again." };
    if (data !== true) {
      return { ok: false, error: "This link has expired or was already used. Ask the school for a new one." };
    }
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** In a signed-pathway conversation (/pathway/[personId]) the student picks
 *  the possibility that excites them. Saved as an observation by the adult
 *  who's signed in, so it's theirs, consent-checked by the database, and
 *  feeds the next draft. Only for a SIGNED draft of that same student. */
export async function recordPathwayChoiceAction(input: {
  personId: string;
  draftId: string;
  pathwayIndex: number;
  note: string;
}): Promise<Result> {
  try {
    const staff = await requireRole("admin", "admissions");
    const supabase = await getSorClient();
    const { data: draft } = await supabase
      .from("pathway_drafts")
      .select("id, person_id, status, pathways")
      .eq("id", input.draftId)
      .maybeSingle();
    if (!draft || draft.person_id !== input.personId || draft.status !== "approved") {
      throw new Error("That pathway isn't signed, so it can't be chosen yet.");
    }
    const chosen = (draft.pathways as { name?: string }[])[input.pathwayIndex];
    if (!chosen?.name) throw new Error("Choose one of the pathways.");
    const { data: person } = await supabase
      .from("people")
      .select("first_name, preferred_name")
      .eq("id", input.personId)
      .maybeSingle();
    const first = person?.preferred_name || person?.first_name || "They";
    const note = input.note.trim().slice(0, 500);
    const body =
      `In our pathway conversation, ${first} chose "${chosen.name}" as the possibility that excites them most.` +
      (note ? ` In their words: "${note}"` : "");
    const { error } = await supabase.from("observations").insert({
      person_id: input.personId,
      author_id: staff.user_id,
      author_name: staff.display_name,
      source: "text",
      raw_text: body,
      body,
      tags: ["Sense of Calling"],
    });
    if (error) return fail(error);
    await logAccess(staff, "pathway_choice", input.personId, { draftId: input.draftId, pathwayIndex: input.pathwayIndex });
    revalidatePath(`/pilot/people/${input.personId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function approveDraftAction(draftId: string, personId: string): Promise<Result> {
  try {
    const staff = await requireRole("admin", "admissions");
    const supabase = await getSorClient();
    const { data, error } = await supabase
      .from("pathway_drafts")
      .update({ status: "approved", approved_by: staff.display_name, approved_at: new Date().toISOString() })
      .eq("id", draftId)
      .eq("person_id", personId)
      .eq("status", "draft")
      .select("id");
    if (error) return fail(error);
    // Signed drafts stay signed by whoever signed them.
    if (!data?.length) throw new Error("Only an unsigned draft for this student can be signed.");
    await logAccess(staff, "approve_draft", personId, { draftId });
    revalidatePath(`/pilot/people/${personId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
