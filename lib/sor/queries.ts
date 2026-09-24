import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getSorClient, isSorConfigured } from "./supabase-server";
import type {
  Consent,
  ImportRun,
  Person,
  PersonProfile,
  PilotSettings,
  StaffMember,
} from "./types";

/** The signed-in, active staff member, or a redirect to /login. Signed in
 *  but not on the staff table → /login?error=not-staff. */
export async function requireStaff(): Promise<StaffMember> {
  await connection(); // per-request, never prerendered, even if env is missing at build time
  if (!isSorConfigured()) redirect("/login");
  const supabase = await getSorClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await supabase
    .from("staff")
    .select("user_id, email, display_name, role")
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();
  if (!data) redirect("/login?error=not-staff");
  return data as StaffMember;
}

export async function logAccess(
  staff: StaffMember,
  action: string,
  personId: string | null,
  detail: Record<string, unknown> = {}
) {
  const supabase = await getSorClient();
  await supabase
    .from("access_log")
    .insert({ staff_id: staff.user_id, action, person_id: personId, detail });
}

export async function getPilotSettings(): Promise<PilotSettings> {
  const supabase = await getSorClient();
  const { data } = await supabase.from("pilot_settings").select("*").single();
  return (data as PilotSettings) ?? {
    real_data_enabled: false,
    approved_by: null,
    approval_reference: null,
    approved_at: null,
  };
}

export interface RosterEntry extends Person {
  consents: Consent[];
  observation_count: number;
}

export async function getRoster(): Promise<RosterEntry[]> {
  const supabase = await getSorClient();
  const { data, error } = await supabase
    .from("people")
    .select("*, consents(*), observations(count)")
    .order("last_name");
  if (error) throw error;
  return (data ?? []).map((row) => {
    const { observations, consents, ...person } = row as Person & {
      consents: Consent[];
      observations: { count: number }[];
    };
    return {
      ...person,
      consents: consents.filter((c) => !c.revoked_at),
      observation_count: observations?.[0]?.count ?? 0,
    };
  });
}

/** People a staff member can capture an observation about right now. */
export async function getCaptureRoster(): Promise<Person[]> {
  const roster = await getRoster();
  return roster.filter(
    (p) =>
      p.is_sample || p.consents.some((c) => c.scope === "staff_observations")
  );
}

export async function getPersonProfile(id: string): Promise<PersonProfile | null> {
  const supabase = await getSorClient();
  const { data: person } = await supabase.from("people").select("*").eq("id", id).maybeSingle();
  if (!person) return null;
  const [externalIds, consents, admissions, enrollment, courses, evidence, observations, drafts] =
    await Promise.all([
      supabase.from("external_ids").select("*").eq("person_id", id),
      supabase.from("consents").select("*").eq("person_id", id).order("created_at"),
      supabase.from("admissions_records").select("*").eq("person_id", id).maybeSingle(),
      supabase.from("enrollments").select("*").eq("person_id", id).maybeSingle(),
      supabase.from("course_enrollments").select("*").eq("person_id", id),
      supabase
        .from("academic_evidence")
        .select("*")
        .eq("person_id", id)
        .order("submitted_at", { ascending: false }),
      supabase
        .from("observations")
        .select("*")
        .eq("person_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("pathway_drafts")
        .select("*")
        .eq("person_id", id)
        .order("created_at", { ascending: false }),
    ]);
  return {
    person: person as Person,
    externalIds: externalIds.data ?? [],
    consents: consents.data ?? [],
    admissions: admissions.data ?? null,
    enrollment: enrollment.data ?? null,
    courses: courses.data ?? [],
    evidence: evidence.data ?? [],
    observations: observations.data ?? [],
    drafts: drafts.data ?? [],
  } as PersonProfile;
}

export async function getImportRuns(): Promise<ImportRun[]> {
  const supabase = await getSorClient();
  const { data } = await supabase
    .from("import_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(10);
  return (data as ImportRun[]) ?? [];
}
