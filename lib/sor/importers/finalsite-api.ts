import { createHmac } from "crypto";
import type { FunnelEvent } from "../funnel";

/**
 * Finalsite Enrollment External API → admissions season COUNTS.
 *
 * What Finalsite documents (Custom Data Services: Finalsite Enrollment
 * External API): read-only GET over HTTPS; a JWT signed HS256 with the API
 * credential's secret, claims `sub` (credential id), `name`, `exp` (≤ 60 min),
 * sent as `Authorization: Bearer`; version in `X-Api-Version`; lists of at
 * most 100 objects with `meta.next_cursor`, passed back as `?cursor=`;
 * 15 requests per 10 s, else 429 with Retry-After. Endpoint paths and field
 * names are NOT public — they're in the school's own Swagger page (EMS
 * Settings → Fields & Data → External API Documentation). Pacifica's, checked
 * 2026-09-30: base https://pacificachristian.fsenrollment.com, contacts at
 * /api/external/contacts, Bearer JWT. Any other path lands on the web app's
 * login ("You need to sign in or sign up before continuing"). Adjust
 * FINALSITE_FUNNEL_FIELDS to match the contact schema.
 *
 * Privacy: the API returns one object per contact, not totals. Each object
 * is mapped straight to a FunnelEvent — an entry year and four dates, nothing
 * that identifies anyone — and dropped. Nothing per-person is stored, logged
 * or sent anywhere; only suppressed counts reach the database. Warnings
 * report field NAMES, never values. Leave it that way.
 */

/** Where each FunnelEvent field lives in a Finalsite contact object. Each
 *  entry lists candidate keys (dotted paths allowed), first match wins. The
 *  first key of each is what Pacifica's /api/external/contacts returns
 *  (seen via "Check connection", 2026-09-30); the rest are fallbacks.
 *  admittedOn has no matching field there yet: no decision date appears at
 *  the top level of a contact (review_decision has no date). */
export const FINALSITE_FUNNEL_FIELDS: Record<keyof FunnelEvent, string[]> = {
  // Both are school-year objects ({ name: "2027-2028", start_year: 2027 });
  // start_year is the fall the class enters. prospect_entry_year is blank on
  // many contacts, so fall back to the contact's school_year.
  entryYear: ["prospect_entry_year.start_year", "school_year.start_year", "prospect_entry_year.name", "school_year.name"],
  inquiredOn: ["inquiry_submit_date", "inquiry_date"],
  appliedOn: ["application_submit_date", "application_submitted_date"],
  admittedOn: ["accepted_date", "decision_date", "review_decision_date"],
  enrolledOn: ["contract_submit_date", "enrolled_date"],
};

// Values pasted into a dashboard often pick up a trailing newline, a space or
// quotes, which silently breaks the JWT signature. Strip them.
const clean = (v: string | undefined) => v?.trim().replace(/^(["'])(.*)\1$/, "$2").trim() || undefined;

const env = () => ({
  baseUrl: clean(process.env.FINALSITE_API_BASE_URL)?.replace(/\/+$/, ""),
  credentialId: clean(process.env.FINALSITE_API_CREDENTIAL_ID),
  secret: clean(process.env.FINALSITE_API_SECRET),
  version: clean(process.env.FINALSITE_API_VERSION) || "1", // required header; Pacifica's Swagger: 1
  path: clean(process.env.FINALSITE_FUNNEL_PATH) || "/api/external/contacts",
  query: clean(process.env.FINALSITE_FUNNEL_QUERY) || "",
});

export function isLiveFinalsiteApiConfigured(): boolean {
  const e = env();
  return Boolean(e.baseUrl?.startsWith("https://") && e.credentialId && e.secret);
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

/** HS256 JWT for one run; 10 minutes is plenty and well under the 60 max. */
export function signFinalsiteJwt(credentialId: string, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(
    JSON.stringify({ sub: credentialId, name: "Formation Pathways admissions counts", iat: nowSeconds, exp: nowSeconds + 600 })
  );
  const sig = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

type Raw = Record<string, unknown>;

function at(o: Raw, dotted: string): unknown {
  return dotted.split(".").reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Raw)[k] : undefined), o);
}

const toDate = (v: unknown): string | null => {
  if (typeof v !== "string" || !v) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(v);
  return m ? m[1] : null;
};

const toYear = (v: unknown): number | null => {
  // "2027" / 2027 is the fall the class enters. A school-year label is the
  // year they enter, so "2027-2028" / "2027-28" is the class entering fall
  // 2027 too: entry year 2027, recruited in the 2026–27 season.
  const s = String(v ?? "").trim();
  const range = /^(\d{4})\s*[-–/]\s*(\d{2,4})$/.exec(s);
  if (range) return Number(range[1]);
  return /^\d{4}$/.test(s) ? Number(s) : null;
};

/** The shape of a value, never the value: "YYYY", "YYYY-YYYY", "date", … */
function formatOf(v: unknown): string {
  if (v == null || v === "") return "empty";
  if (typeof v === "number") return Number.isInteger(v) && v >= 1900 && v <= 2200 ? "YYYY (number)" : "number";
  if (typeof v !== "string") return Array.isArray(v) ? "list" : typeof v === "object" ? "object" : typeof v;
  const s = v.trim();
  if (/^\d{4}$/.test(s)) return "YYYY";
  if (/^\d{4}\s*[-–/]\s*\d{4}$/.test(s)) return "YYYY-YYYY";
  if (/^\d{4}\s*[-–/]\s*\d{2}$/.test(s)) return "YYYY-YY";
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return "date-time";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return "date";
  return "other text";
}

/** Contact object → FunnelEvent, plus which fields weren't found. Pass
 *  `entryYear` when the query already fixed the season (school_year_id). */
export function mapFinalsiteContact(raw: Raw, knownEntryYear?: number): { event: FunnelEvent | null; missing: (keyof FunnelEvent)[] } {
  const find = (field: keyof FunnelEvent) => {
    for (const k of FINALSITE_FUNNEL_FIELDS[field]) {
      const v = at(raw, k);
      if (v != null && v !== "") return v;
    }
    return null;
  };
  const entryYear = knownEntryYear ?? toYear(find("entryYear"));
  const event: FunnelEvent = {
    entryYear: entryYear ?? 0,
    inquiredOn: toDate(find("inquiredOn")),
    appliedOn: toDate(find("appliedOn")),
    admittedOn: toDate(find("admittedOn")),
    enrolledOn: toDate(find("enrolledOn")),
  };
  const missing = (Object.keys(FINALSITE_FUNNEL_FIELDS) as (keyof FunnelEvent)[]).filter((k) =>
    k === "entryYear" ? entryYear == null : event[k] == null
  );
  return { event: entryYear == null ? null : event, missing };
}

/** Every key path in an object, e.g. "application.submitted_at". Names only. */
function keyPaths(o: Raw, prefix = "", depth = 0): string[] {
  return Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object" && !Array.isArray(v) && depth < 2
      ? keyPaths(v as Raw, `${prefix}${k}.`, depth + 1)
      : [`${prefix}${k}`]
  );
}

/** Finalsite's own reason for refusing the token (e.g. "invalid signature").
 *  Only read for 401/403, which carry no contact data, and capped in length. */
async function authFailureReason(res: Response): Promise<string> {
  const header = res.headers.get("www-authenticate") ?? "";
  let message = "";
  try {
    const text = await res.text();
    try {
      const j = JSON.parse(text) as Raw;
      const pick = [j.message, j.error_description, j.error, j.detail, j.title].find((v) => typeof v === "string");
      message = (pick as string | undefined) ?? "";
    } catch {
      message = text.startsWith("<") ? "" : text; // skip HTML error pages
    }
  } catch {}
  return [message, header].filter(Boolean).join(" · ").replace(/\s+/g, " ").slice(0, 200);
}

/** The list of contacts inside one response page, wherever Finalsite puts it:
 *  a bare array, a known envelope key, or else the first array-valued key
 *  (e.g. `contacts`). */
export function extractItems(json: unknown): Raw[] {
  if (Array.isArray(json)) return json as Raw[];
  if (!json || typeof json !== "object") return [];
  const o = json as Raw;
  for (const k of ["data", "results", "items", "contacts"]) if (Array.isArray(o[k])) return o[k] as Raw[];
  const firstArray = Object.values(o).find(Array.isArray);
  return (firstArray as Raw[] | undefined) ?? [];
}

/** Top-level key names of a response page, plus `meta.*` names: the shape of
 *  the envelope, never values, and never the contact objects' own keys. */
export function envelopeKeys(json: unknown): string[] {
  if (!json || typeof json !== "object" || Array.isArray(json)) return Array.isArray(json) ? ["(array)"] : [];
  const o = json as Raw;
  const meta = o.meta && typeof o.meta === "object" && !Array.isArray(o.meta) ? Object.keys(o.meta as Raw).map((k) => `meta.${k}`) : [];
  return [...Object.keys(o).map((k) => (Array.isArray(o[k]) ? `${k}[]` : k)), ...meta];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Query = Record<string, string>;

async function* pages(maxPages: number, extra: Query = {}, onEnvelope?: (keys: string[]) => void): AsyncGenerator<Raw[]> {
  const e = env();
  if (!isLiveFinalsiteApiConfigured()) throw new Error("Finalsite API isn't configured (see .env.local.example).");
  const token = signFinalsiteJwt(e.credentialId!, e.secret!);
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`${e.baseUrl}${e.path}${e.query ? `?${e.query.replace(/^\?/, "")}` : ""}`);
    url.searchParams.set("count", "25"); // the API's maximum
    for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "X-Api-Version": e.version },
      cache: "no-store",
    });
    if (res.status === 429) {
      await sleep((Number(res.headers.get("retry-after")) || 2) * 1000);
      page--;
      continue;
    }
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        const why = await authFailureReason(res);
        throw new Error(
          `Finalsite API ${res.status}: check the credential id/secret and that it's enabled.${why ? ` Finalsite says: ${why}` : ""}`
        );
      }
      throw new Error(`Finalsite API ${res.status} on ${e.path}. Check FINALSITE_FUNNEL_PATH against the Swagger page.`);
    }
    const json = (await res.json()) as Raw | Raw[];
    onEnvelope?.(envelopeKeys(json));
    yield extractItems(json);
    cursor = Array.isArray(json) ? null : ((json.meta as Raw | undefined)?.next_cursor as string | null) ?? null;
    if (!cursor) return;
    await sleep(700); // stays under 15 requests / 10 s
  }
  throw new Error(`Stopped after ${maxPages} pages. Narrow FINALSITE_FUNNEL_QUERY.`);
}

/** Up to `max` pages, stopping early without error. */
async function sample(max: number, extra: Query = {}, onEnvelope?: (keys: string[]) => void): Promise<Raw[]> {
  const out: Raw[] = [];
  let n = 0;
  for await (const items of pages(max + 1, extra, onEnvelope)) {
    out.push(...items);
    if (++n >= max) break;
  }
  return out;
}

// ---------------------------------------------------------- school years
//
// The API is per school year: with `school_year_id`, a contact's status,
// enrollment_type and dates reflect THAT year. So each season is pulled on its
// own, filtered to new families, which keeps past seasons right (a student who
// entered in 2024 is "returning" today) and keeps each pull small. School year
// ids are school setup, not family data; they're read off the school-year
// objects contacts carry, or set in FINALSITE_SCHOOL_YEAR_IDS
// ("2027=<uuid>,2026=<uuid>") to skip discovery.

type SchoolYear = { id: string; startYear: number; name: string };

/** School-year objects on a contact: its own, its prospect entry year, and any
 *  on track fields. */
export function schoolYearsOn(o: Raw): SchoolYear[] {
  const objs = [o.school_year, o.prospect_entry_year, ...(Array.isArray(o.track_attributes) ? o.track_attributes.map((t: Raw) => t?.school_year) : [])];
  return objs.flatMap((y) => {
    if (!y || typeof y !== "object") return [];
    const { id, start_year, name } = y as Raw;
    const startYear = typeof start_year === "number" ? start_year : toYear(name);
    return typeof id === "string" && startYear ? [{ id, startYear, name: typeof name === "string" ? name : String(startYear) }] : [];
  });
}

const DISCOVERY_PAGES = 12;

async function resolveSchoolYears(entryYears: number[], seed: Raw[] = []): Promise<Map<number, SchoolYear>> {
  const found = new Map<number, SchoolYear>();
  for (const pair of (clean(process.env.FINALSITE_SCHOOL_YEAR_IDS) ?? "").split(",")) {
    const [y, id] = pair.split("=").map((x) => x?.trim());
    if (/^\d{4}$/.test(y ?? "") && id) found.set(Number(y), { id, startYear: Number(y), name: `${y}-${Number(y) + 1}` });
  }
  const add = (list: Raw[]) => {
    for (const o of list) for (const y of schoolYearsOn(o)) if (!found.has(y.startYear)) found.set(y.startYear, y);
  };
  add(seed);
  if (entryYears.every((y) => found.has(y))) return found;
  for await (const items of pages(DISCOVERY_PAGES + 1)) {
    add(items);
    if (entryYears.every((y) => found.has(y))) break;
  }
  return found;
}

// ---------------------------------------------------------- admitted
//
// Pacifica's Finalsite has no admission decision date on a contact and no
// "accepted" status: accepted families move straight on to contract and
// enrollment statuses. So "admitted" comes from that year's status, dated by
// the day decisions were released that season (they go out together in
// March). A family that signed a contract earlier counts from that date.
// Both lists are the admissions office's to confirm:
//   FINALSITE_ADMITTED_STATUSES  statuses that mean "was offered a place"
//   FINALSITE_DECISION_DATES     2027=2027-03-06,2026=2026-03-07,… (entry year = release date)

const DEFAULT_ADMITTED_STATUSES = ["accepted", "admitted", "enrollment_in_progress", "enrolled"];

export function admittedStatuses(): Set<string> {
  const v = clean(process.env.FINALSITE_ADMITTED_STATUSES);
  return new Set((v ? v.split(",") : DEFAULT_ADMITTED_STATUSES).map((s) => s.trim().toLowerCase()).filter(Boolean));
}

export function decisionDates(): Map<number, string> {
  const out = new Map<number, string>();
  for (const pair of (clean(process.env.FINALSITE_DECISION_DATES) ?? "").split(",")) {
    const [y, d] = pair.split("=").map((x) => x?.trim());
    if (/^\d{4}$/.test(y ?? "") && /^\d{4}-\d{2}-\d{2}$/.test(d ?? "")) out.set(Number(y), d);
  }
  return out;
}

/** The admitted date for one contact in one season: the earlier of the
 *  season's decision release date and the contract date, for a status that
 *  means "offered a place"; otherwise null. A mapped admittedOn field, if one
 *  ever appears, wins. */
export function deriveAdmitted(
  status: unknown,
  event: FunnelEvent,
  releaseDate: string | undefined,
  offered: Set<string>
): string | null {
  if (event.admittedOn) return event.admittedOn;
  if (typeof status !== "string" || !offered.has(status.toLowerCase())) return null;
  const dates = [releaseDate, event.enrolledOn].filter((d): d is string => Boolean(d));
  return dates.length ? dates.sort()[0] : null;
}

/** New families only, for one school year's own status and dates. */
const seasonQuery = (sy: SchoolYear): Query => ({ school_year_id: sy.id, enrollment_type: "new" });

/** Every new family in the listed seasons, as FunnelEvents, one season at a time. */
export async function fetchLiveFunnelEvents(
  entryYears: number[],
  currentEntryYear: number
): Promise<{ events: FunnelEvent[]; warnings: string[] }> {
  // Decision dates are needed for every finished season (otherwise admitted
  // and yield would be wrong); the current one can wait until March.
  const releases = decisionDates();
  const noDate = entryYears.filter((y) => y < currentEntryYear && !releases.has(y));
  if (noDate.length) {
    throw new Error(
      `Set FINALSITE_DECISION_DATES for ${noDate.map((y) => `${y - 1}–${String(y).slice(2)}`).join(", ")} (the day admission decisions were released, e.g. ${noDate[0]}=${noDate[0]}-03-07). Without it, admitted counts and yield would be wrong.`
    );
  }
  const offered = admittedStatuses();
  const years = await resolveSchoolYears(entryYears);
  const events: FunnelEvent[] = [];
  const warnings: string[] = [];
  const missingCount = new Map<string, number>();
  let seen = 0;
  for (const year of entryYears) {
    const sy = years.get(year);
    if (!sy) {
      warnings.push(`No Finalsite school year found for ${year}-${year + 1} (the class entering fall ${year}); that season was skipped. Set FINALSITE_SCHOOL_YEAR_IDS.`);
      continue;
    }
    let n = 0;
    for await (const items of pages(400, seasonQuery(sy))) {
      for (const raw of items) {
        n++;
        // The query fixes the year, so the season is known even when the
        // contact's own year fields are blank.
        const { event, missing } = mapFinalsiteContact(raw, year);
        for (const m of missing) if (m !== "admittedOn") missingCount.set(m, (missingCount.get(m) ?? 0) + 1);
        if (event) events.push({ ...event, admittedOn: deriveAdmitted(raw.status, event, releases.get(year), offered) });
      }
    }
    seen += n;
    if (n === 0) warnings.push(`Finalsite returned no new families for ${sy.name}. Check enrollment_type values in Check connection.`);
  }
  if (!releases.has(currentEntryYear)) {
    warnings.push(`No decision release date set for the current season yet: admitted counts only families already under contract. Add it to FINALSITE_DECISION_DATES when decisions go out.`);
  }
  for (const [field, n] of missingCount) {
    if (n === seen && seen > 0) warnings.push(`No contact had ${field}. Check FINALSITE_FUNNEL_FIELDS.${field} against the Swagger page.`);
  }
  return { events, warnings };
}

// ---------------------------------------------------------- check connection

/** Labels the SCHOOL configures, the same for every family: checklist item and
 *  custom field names, and the allowed values of a few status fields. These
 *  tell us where an admission decision is recorded. No family's data. */
const SETUP_LISTS: Record<string, (o: Raw) => unknown[]> = {
  "checklist items": (o) => (Array.isArray(o.checklist_answers) ? o.checklist_answers.map((c: Raw) => c?.name) : []),
  "custom fields": (o) => (Array.isArray(o.custom_attributes) ? o.custom_attributes.map((c: Raw) => c?.field_name) : []),
  "track fields": (o) => (Array.isArray(o.track_attributes) ? o.track_attributes.map((c: Raw) => c?.field_name) : []),
  status: (o) => [o.status],
  enrollment_type: (o) => [o.enrollment_type],
  review_decision: (o) => [o.review_decision],
};

const CHECK_PAGES = 8; // ~200 contacts: enough to see the setup, a few seconds
const CHECK_SEASON_PAGES = 4; // ~100 new families in the current season

/** A sample — the first pages unfiltered, then new families in the current
 *  season — reported as field names, value formats and school setup labels,
 *  never a family's values, so the field map can be checked before the first
 *  import. */
export async function checkFinalsiteConnection(currentEntryYear: number): Promise<{
  objectsOnFirstPage: number;
  responseKeys: string[];
  keysSeen: string[];
  fieldsFound: Record<keyof FunnelEvent, string | null>;
  /** Per matched field, how many contacts had each value format. No values. */
  formats: Partial<Record<keyof FunnelEvent, Record<string, number>>>;
  setup: Record<string, string[]>;
  /** Current season: which school year was used and how many new families came back. */
  season: { schoolYear: string | null; newFamilies: number };
}> {
  let responseKeys: string[] = [];
  const unfiltered = await sample(CHECK_PAGES, {}, (k) => (responseKeys = k));
  const current = currentEntryYear;
  const sy = (await resolveSchoolYears([current], unfiltered)).get(current) ?? null;
  const seasonal = sy ? await sample(CHECK_SEASON_PAGES, seasonQuery(sy)) : [];
  const first = [...unfiltered, ...seasonal];

  const keys = new Set<string>(first.flatMap((o) => keyPaths(o)));
  const fieldsFound = Object.fromEntries(
    (Object.keys(FINALSITE_FUNNEL_FIELDS) as (keyof FunnelEvent)[]).map((f) => [
      f,
      FINALSITE_FUNNEL_FIELDS[f].find((k) => keys.has(k)) ?? null,
    ])
  ) as Record<keyof FunnelEvent, string | null>;
  // Formats from the season's new families when there are any: they're the
  // contacts the import actually counts.
  const basis = seasonal.length ? seasonal : unfiltered;
  const formats: Partial<Record<keyof FunnelEvent, Record<string, number>>> = {};
  for (const [field, key] of Object.entries(fieldsFound) as [keyof FunnelEvent, string | null][]) {
    if (!key) continue;
    const tally: Record<string, number> = {};
    for (const o of basis) {
      const f = formatOf(at(o, key));
      tally[f] = (tally[f] ?? 0) + 1;
    }
    formats[field] = tally;
  }
  const setup: Record<string, string[]> = Object.fromEntries(
    Object.entries(SETUP_LISTS).map(([label, pick]) => {
      const names = new Set<string>();
      for (const o of first)
        for (const v of pick(o)) if (typeof v === "string" && v && v.length <= 60) names.add(v);
      return [label, [...names].sort()];
    })
  );
  setup["school years"] = [...new Set(first.flatMap((o) => schoolYearsOn(o).map((y) => y.name)))].sort();
  setup["counted as admitted (setting)"] = [...admittedStatuses()].sort();
  setup["decision release dates (setting)"] = [...decisionDates()].sort(([a], [b]) => a - b).map(([y, d]) => `${y - 1}–${String(y).slice(2)}: ${d}`);
  return {
    objectsOnFirstPage: first.length,
    responseKeys,
    keysSeen: [...keys].sort(),
    fieldsFound,
    formats,
    setup,
    season: { schoolYear: sy?.name ?? null, newFamilies: seasonal.length },
  };
}
