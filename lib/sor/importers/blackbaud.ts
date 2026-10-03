import fs from "fs";
import path from "path";

/**
 * Blackbaud SKY API (School) → enrollments.
 *
 * Live mode fetches ONE user at a time by id (GET /school/v1/users/extended/{id},
 * whose `student_info` carries grad_year and grade_level; the basic
 * /users/{id} has neither) for
 * allowlisted pilot participants only — it never lists the school.
 * Needs BLACKBAUD_SUBSCRIPTION_KEY (developer.blackbaud.com) and a SKY access
 * token from "Connect Blackbaud" on /pilot (lib/sor/blackbaud-auth.ts), which
 * lasts 60 minutes. BLACKBAUD_ACCESS_TOKEN in env still works as a fallback
 * for local runs.
 *
 * Field mapping is in `mapBlackbaudUser`. SKY's response shape varies by
 * endpoint and school configuration — if a field comes back empty, the run
 * reports which keys it DID see (names only, never values) so the mapping
 * can be fixed without logging student data.
 */
const SKY_BASE = "https://api.sky.blackbaud.com/school/v1";

export interface BlackbaudRecord {
  externalId: string;
  preferredName: string | null;
  grade: number | null;
  gradYear: number | null;
  advisorName: string | null;
  enrolledSince: string | null;
}

type Raw = Record<string, unknown>;
const pick = (o: Raw | undefined, ...keys: string[]) => {
  for (const k of keys) if (o && o[k] != null && o[k] !== "") return o[k];
  return null;
};
const num = (v: unknown) => (v == null || v === "" || isNaN(Number(v)) ? null : Number(v));
/** A grade from 9, "9", "09" or a description like "9th Grade" / "Grade 10". */
const gradeNum = (v: unknown) => {
  if (typeof v === "number") return v;
  const m = typeof v === "string" ? /\b(\d{1,2})(?:st|nd|rd|th)?\b/i.exec(v) : null;
  return m ? Number(m[1]) : null;
};

export function mapBlackbaudUser(raw: Raw): { record: BlackbaudRecord; missing: string[] } {
  const info = (raw.student_info ?? raw.student ?? {}) as Raw;
  const record: BlackbaudRecord = {
    externalId: String(raw.id),
    preferredName: (pick(raw, "preferred_name", "nick_name") as string) ?? null,
    grade:
      gradeNum(pick(info, "grade_level", "grade") ?? pick(raw, "grade_level", "grade")) ??
      gradeNum(pick(info, "grade_level_description") ?? pick(raw, "grade_level_description")),
    gradYear: num(pick(info, "grad_year", "class_of") ?? pick(raw, "grad_year", "class_of")),
    advisorName: (pick(info, "advisor_name") ?? pick(raw, "advisor_name")) as string | null,
    enrolledSince: (pick(info, "enroll_date") ?? pick(raw, "enroll_date")) as string | null,
  };
  const missing = (["grade", "gradYear"] as const).filter((k) => record[k] == null);
  return { record, missing };
}

/** Live when there's a subscription key and a token (connected, or env). */
export function isLiveBlackbaudConfigured(token: string | null = process.env.BLACKBAUD_ACCESS_TOKEN ?? null): boolean {
  return Boolean(process.env.BLACKBAUD_SUBSCRIPTION_KEY?.trim() && token);
}

const skyHeaders = (token: string) => ({
  "Bb-Api-Subscription-Key": process.env.BLACKBAUD_SUBSCRIPTION_KEY!.trim(),
  Authorization: `Bearer ${token}`,
  Accept: "application/json",
});

/** Blackbaud's own reason for an error: a JSON message in any of the shapes
 *  SKY uses, else short plain text, plus the WWW-Authenticate header (where a
 *  rejected token's reason lives). Error responses carry no student data. */
async function skyReason(res: Response): Promise<string> {
  const header = res.headers.get("www-authenticate") ?? "";
  let message = "";
  try {
    const text = await res.text();
    try {
      const j = JSON.parse(text) as Raw;
      const first = Array.isArray(j.errors) ? (j.errors[0] as Raw | undefined) : undefined;
      const pick = [j.message, j.Message, j.title, j.error_description, j.error, first?.message, first?.title].find(
        (v) => typeof v === "string" && v
      );
      message = (pick as string | undefined) ?? "";
    } catch {
      message = text.trim().startsWith("<") ? "" : text;
    }
  } catch {}
  return [message, header && `(${header})`].filter(Boolean).join(" ").replace(/\s+/g, " ").slice(0, 300);
}

async function skyError(res: Response): Promise<Error> {
  const why = await skyReason(res);
  const noRole = /access to this route/i.test(why);
  const hint =
    noRole ? "your Blackbaud account's roles don't allow this endpoint (ask your Blackbaud admin for a role the endpoint lists)"
    : res.status === 401 ? "the connection expired (connect Blackbaud again) or the subscription key is wrong"
    : res.status === 403 ? "the SKY app isn't connected to the school's environment, or your Blackbaud role can't read users"
    : "unexpected response";
  return new Error(`Blackbaud SKY ${res.status}: ${hint}.${why ? ` Blackbaud says: ${why}` : ""}`);
}

/** The extended user record (student_info with grad year and grade). If this
 *  account's role can't read the extended route, fall back to the basic one,
 *  which still links names but has no grade or class year. */
async function fetchUser(id: string, token: string): Promise<Response> {
  const get = (path: string) => fetch(`${SKY_BASE}${path}${encodeURIComponent(id)}`, { headers: skyHeaders(token), cache: "no-store" });
  const extended = await get("/users/extended/");
  if (extended.status !== 401 && extended.status !== 403) return extended;
  return get("/users/");
}

/** Every key path in an object, e.g. "student_info.grad_year". Names only. */
function keyPaths(o: Raw, prefix = "", depth = 0): string[] {
  return Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object" && !Array.isArray(v) && depth < 2 ? keyPaths(v as Raw, `${prefix}${k}.`, depth + 1) : [`${prefix}${k}`]
  );
}

/** One user's record, reported as field names and which mapped fields were
 *  found, never values. Meant for an admin's OWN staff record, to prove the
 *  connection and check the field map before any student is pulled. */
export async function checkBlackbaudUser(id: string, token: string): Promise<{ found: boolean; keys: string[]; mapped: string[] }> {
  const res = await fetchUser(id, token);
  if (res.status === 404) return { found: false, keys: [], mapped: [] };
  if (!res.ok) throw await skyError(res);
  const raw = (await res.json()) as Raw;
  const { record } = mapBlackbaudUser(raw);
  const mapped = (Object.keys(record) as (keyof BlackbaudRecord)[]).filter((k) => k !== "externalId" && record[k] != null);
  return { found: true, keys: keyPaths(raw).sort(), mapped };
}

export async function fetchLiveBlackbaud(
  allowlist: Set<string>,
  token: string
): Promise<{ records: BlackbaudRecord[]; warnings: string[] }> {
  const records: BlackbaudRecord[] = [];
  const warnings: string[] = [];
  for (const id of allowlist) {
    const res = await fetchUser(id, token);
    if (res.status === 404) continue;
    if (!res.ok) throw await skyError(res);
    const raw = (await res.json()) as Raw;
    const { record, missing } = mapBlackbaudUser(raw);
    if (missing.length) {
      warnings.push(
        `Blackbaud user ${id}: no ${missing.join("/")} in response${
          raw.student_info ? "" : " (no student_info: not a student record, or your Blackbaud role can't read /users/extended)"
        }; keys seen: ${Object.keys(raw).join(", ")}`
      );
    }
    records.push(record);
  }
  return { records, warnings };
}

export function readSampleBlackbaud(allowlist: Set<string>): BlackbaudRecord[] {
  const file = path.join(process.cwd(), "fixtures/sample/blackbaud-users.json");
  const { users } = JSON.parse(fs.readFileSync(file, "utf-8")) as { users: Raw[] };
  return users.filter((u) => allowlist.has(String(u.id))).map((u) => mapBlackbaudUser(u).record);
}

// ---------------------------------------------------------- class history
//
// GET /school/v1/academics/enrollments/{user_id}?school_year=<label>: the
// course sections a student is in for one year. Needs the "Academic Group
// Manager" or "Schedule Manager" role in Blackbaud. Only the course title,
// code and offering type (Academics, Arts, Athletics…) are kept: never
// grades, attendance or teacher notes. Year labels come from /school/v1/years.

export interface ClassSection {
  sectionId: string;
  schoolYear: string;
  courseTitle: string;
  courseCode: string | null;
  offeringType: string | null;
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);

/** One enrollment row → the few fields we keep, or null if it has no title. */
export function mapSection(raw: Raw, schoolYear: string): ClassSection | null {
  const offering = raw.offering_type as Raw | string | undefined;
  const title = str(pick(raw, "course_title", "course_name", "section_name", "name", "title"));
  const sectionId = str(pick(raw, "id", "section_id", "lead_section_id"));
  if (!title || !sectionId) return null;
  return {
    sectionId,
    schoolYear,
    courseTitle: title.slice(0, 160),
    courseCode: str(pick(raw, "course_code", "code"))?.slice(0, 40) ?? null,
    offeringType: (typeof offering === "string" ? str(offering) : str(offering?.description ?? offering?.name))?.slice(0, 60) ?? null,
  };
}

/** The current school year and up to three before it, as Blackbaud labels them. */
async function recentSchoolYears(token: string): Promise<string[]> {
  const res = await fetch(`${SKY_BASE}/years`, { headers: skyHeaders(token), cache: "no-store" });
  if (!res.ok) throw await skyError(res);
  const json = (await res.json()) as Raw | Raw[];
  const years = (Array.isArray(json) ? json : ((json.value ?? []) as Raw[]))
    .map((y) => ({ label: str(y.school_year_label), begin: str(y.begin_date) ?? "", current: Boolean(y.current_year) }))
    .filter((y): y is { label: string; begin: string; current: boolean } => Boolean(y.label))
    .sort((a, b) => b.begin.localeCompare(a.begin));
  const currentAt = years.findIndex((y) => y.current);
  return years.slice(Math.max(0, currentAt), Math.max(0, currentAt) + 4).map((y) => y.label);
}

/** Class history for allowlisted students. A role that can't read schedules
 *  only adds a warning: the rest of the Blackbaud import still counts. */
export async function fetchClassHistory(
  ids: string[],
  token: string
): Promise<{ byUser: Map<string, ClassSection[]>; warnings: string[] }> {
  const byUser = new Map<string, ClassSection[]>();
  const warnings: string[] = [];
  if (!ids.length) return { byUser, warnings };
  let years: string[];
  try {
    years = await recentSchoolYears(token);
  } catch (e) {
    warnings.push(`Class history skipped: couldn't read school years (${e instanceof Error ? e.message : e}).`);
    return { byUser, warnings };
  }
  const untitledKeys = new Set<string>();
  for (const id of ids) {
    const sections: ClassSection[] = [];
    for (const year of years) {
      const url = `${SKY_BASE}/academics/enrollments/${encodeURIComponent(id)}?school_year=${encodeURIComponent(year)}`;
      const res = await fetch(url, { headers: skyHeaders(token), cache: "no-store" });
      if (res.status === 404) continue;
      if (!res.ok) {
        const err = await skyError(res);
        warnings.push(
          res.status === 401 || res.status === 403
            ? `Class history skipped: it needs the Academic Group Manager or Schedule Manager role in Blackbaud. (${err.message})`
            : `Class history skipped: ${err.message}`
        );
        return { byUser, warnings };
      }
      const json = (await res.json()) as Raw | Raw[];
      for (const row of Array.isArray(json) ? json : ((json.value ?? []) as Raw[])) {
        const s = mapSection(row, year);
        if (s) sections.push(s);
        else Object.keys(row).forEach((k) => untitledKeys.add(k));
      }
    }
    byUser.set(id, sections);
  }
  if (untitledKeys.size) {
    warnings.push(`Some class rows had no course title; keys seen: ${[...untitledKeys].sort().join(", ")}`);
  }
  return { byUser, warnings };
}

/** Fictional class history for the sample students (fixtures). */
export function readSampleClassHistory(allowlist: Set<string>): Map<string, ClassSection[]> {
  const file = path.join(process.cwd(), "fixtures/sample/blackbaud-users.json");
  const { users } = JSON.parse(fs.readFileSync(file, "utf-8")) as { users: (Raw & { sections?: Raw[] })[] };
  return new Map(
    users
      .filter((u) => allowlist.has(String(u.id)))
      .map((u) => [
        String(u.id),
        (u.sections ?? []).flatMap((row) => mapSection(row, String(row.school_year)) ?? []),
      ])
  );
}
