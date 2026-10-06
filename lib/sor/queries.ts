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
  StaffListEntry,
  StaffMember,
} from "./types";
import type { FunnelCount } from "./funnel";

/** The signed-in, active staff member, or a redirect to /login. Signed in
 *  and waiting for an admin → /login?error=pending; not on the staff table at
 *  all (e.g. a non-school address) → /login?error=not-staff. */
export async function requireStaff(): Promise<StaffMember> {
  await connection(); // per-request, never prerendered, even if env is missing at build time
  if (!isSorConfigured()) redirect("/login");
  const supabase = await getSorClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // Staff can always read their own row (RLS), active or not.
  const { data } = await supabase
    .from("staff")
    .select("user_id, email, display_name, role, active")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) redirect("/login?error=not-staff");
  if (!data.active) redirect("/login?error=pending");
  const { user_id, email, display_name, role } = data as StaffMember;
  return { user_id, email, display_name, role };
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
    auto_approve_staff: false,
    approved_by: null,
    approval_reference: null,
    approved_at: null,
    funnel_live_enabled: false,
    funnel_approved_by: null,
    funnel_approval_reference: null,
    funnel_approved_at: null,
  };
}

export interface RosterEntry extends Person {
  consents: Consent[];
  observation_count: number;
  /** Spark sessions saved, and the newest one's date (null: none, or this
   *  role can't read sparks). */
  spark_count: number;
  last_spark_at: string | null;
  /** Newest pathway draft's date; null for roles that can't read drafts. */
  last_draft_at: string | null;
}

export async function getRoster(): Promise<RosterEntry[]> {
  const supabase = await getSorClient();
  const { data, error } = await supabase
    .from("people")
    // Sparks and drafts are filtered by RLS like everything else: a role
    // that can't read them simply gets none back.
    .select("*, consents(*), observations(count), student_sparks(created_at), pathway_drafts(created_at)")
    .order("last_name");
  if (error) throw error;
  const newest = (rows: { created_at: string }[] | null | undefined) =>
    (rows ?? []).reduce<string | null>((max, r) => (!max || r.created_at > max ? r.created_at : max), null);
  return (data ?? []).map((row) => {
    const { observations, consents, student_sparks, pathway_drafts, ...person } = row as Person & {
      consents: Consent[];
      observations: { count: number }[];
      student_sparks: { created_at: string }[] | null;
      pathway_drafts: { created_at: string }[] | null;
    };
    return {
      ...person,
      consents: consents.filter((c) => !c.revoked_at),
      observation_count: observations?.[0]?.count ?? 0,
      spark_count: student_sparks?.length ?? 0,
      last_spark_at: newest(student_sparks),
      last_draft_at: newest(pathway_drafts),
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
  const [externalIds, consents, admissions, enrollment, courses, evidence, observations, drafts, classHistory, sparks] =
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
      // Empty (not an error page) until the course_history migration is applied.
      supabase
        .from("course_history")
        .select("*")
        .eq("person_id", id)
        .order("school_year", { ascending: false })
        .order("course_title"),
      // Every Spark session, newest first (drafting merges them all). "*", not
      // a column list: `source` arrives with the family-links migration, and
      // naming a missing column fails the whole read, which once made saved
      // sparks look like "no Spark yet".
      supabase
        .from("student_sparks")
        .select("*")
        .eq("person_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
  // A failed read must never pass for "nothing there": say so in the logs.
  if (sparks.error) console.error("student_sparks read failed:", sparks.error.message);
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
    classHistory: classHistory.data ?? [],
    sparks: (sparks.data ?? []).map((row) => ({
      sparks: row.sparks,
      created_at: row.created_at,
      source: row.source === "family_link" ? "family_link" : "in_person",
    })),
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

/** Everyone who has signed in with a school address; admins only (RLS). */
export async function getStaffList(): Promise<StaffListEntry[]> {
  const supabase = await getSorClient();
  const { data } = await supabase
    .from("staff")
    .select("user_id, email, display_name, role, active, created_at")
    .order("active")
    .order("display_name");
  return (data as StaffListEntry[]) ?? [];
}

/** Admissions season counts (admin + admissions only, via RLS). Live counts
 *  once any exist, otherwise the fictional sample ones. */
export async function getFunnelCounts(): Promise<{ rows: FunnelCount[]; mode: "live" | "sample" | "none"; importedAt: string | null }> {
  const supabase = await getSorClient();
  for (const isSample of [false, true]) {
    const rows: Record<string, unknown>[] = [];
    // PostgREST caps a response (1,000 rows by default), so page through.
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from("admissions_funnel_counts")
        .select("entry_year, stage, cohort, as_of, count, imported_at")
        .eq("is_sample", isSample)
        .eq("cohort", "all")
        .order("entry_year")
        .order("stage")
        .order("as_of")
        .range(from, from + 999);
      if (error) throw error;
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    if (rows.length) {
      return {
        mode: isSample ? "sample" : "live",
        importedAt: rows.map((r) => String(r.imported_at)).sort().at(-1) ?? null,
        rows: rows.map((r) => ({
          entryYear: Number(r.entry_year),
          stage: r.stage as FunnelCount["stage"],
          cohort: "all",
          asOf: String(r.as_of),
          count: r.count == null ? null : Number(r.count),
        })),
      };
    }
  }
  return { rows: [], mode: "none", importedAt: null };
}
