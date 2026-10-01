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
 *  entry lists candidate keys (dotted paths allowed), first match wins. These
 *  are best guesses: confirm them against the school's Swagger page with
 *  "Check connection" on the Admissions season page before the first import. */
export const FINALSITE_FUNNEL_FIELDS: Record<keyof FunnelEvent, string[]> = {
  entryYear: ["entry_year", "entering_year", "school_year", "enrollment_year"],
  inquiredOn: ["inquiry_date", "inquiry_submitted_at", "created_at"],
  appliedOn: ["application_submitted_date", "application_submitted_at", "application.submitted_at"],
  admittedOn: ["accepted_date", "decision_date", "admission_decision.accepted_at"],
  enrolledOn: ["enrolled_date", "contract_signed_date", "enrollment.contract_signed_at"],
};

// Values pasted into a dashboard often pick up a trailing newline, a space or
// quotes, which silently breaks the JWT signature. Strip them.
const clean = (v: string | undefined) => v?.trim().replace(/^(["'])(.*)\1$/, "$2").trim() || undefined;

const env = () => ({
  baseUrl: clean(process.env.FINALSITE_API_BASE_URL)?.replace(/\/+$/, ""),
  credentialId: clean(process.env.FINALSITE_API_CREDENTIAL_ID),
  secret: clean(process.env.FINALSITE_API_SECRET),
  version: clean(process.env.FINALSITE_API_VERSION),
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
  // "2027", 2027, or a school-year label like "2026-2027" / "2026-27" → 2027.
  const s = String(v ?? "");
  const range = /^(\d{4})\s*[-–/]\s*(\d{2,4})$/.exec(s);
  if (range) return range[2].length === 4 ? Number(range[2]) : Number(range[1].slice(0, 2) + range[2]);
  return /^\d{4}$/.test(s) ? Number(s) : null;
};

/** Contact object → FunnelEvent, plus which fields weren't found. */
export function mapFinalsiteContact(raw: Raw): { event: FunnelEvent | null; missing: (keyof FunnelEvent)[] } {
  const find = (field: keyof FunnelEvent) => {
    for (const k of FINALSITE_FUNNEL_FIELDS[field]) {
      const v = at(raw, k);
      if (v != null && v !== "") return v;
    }
    return null;
  };
  const entryYear = toYear(find("entryYear"));
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

async function* pages(maxPages: number, onEnvelope?: (keys: string[]) => void): AsyncGenerator<Raw[]> {
  const e = env();
  if (!isLiveFinalsiteApiConfigured()) throw new Error("Finalsite API isn't configured (see .env.local.example).");
  const token = signFinalsiteJwt(e.credentialId!, e.secret!);
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`${e.baseUrl}${e.path}${e.query ? `?${e.query.replace(/^\?/, "")}` : ""}`);
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(e.version ? { "X-Api-Version": e.version } : {}),
      },
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
  throw new Error(`Stopped after ${maxPages} pages. Narrow FINALSITE_FUNNEL_QUERY (e.g. to recent entry years).`);
}

/** Every contact in the listed seasons, as FunnelEvents. */
export async function fetchLiveFunnelEvents(entryYears: number[]): Promise<{ events: FunnelEvent[]; warnings: string[] }> {
  const wanted = new Set(entryYears);
  const events: FunnelEvent[] = [];
  const missingCount = new Map<string, number>();
  let seen = 0;
  let noYear = 0;
  for await (const items of pages(1000)) {
    for (const raw of items) {
      seen++;
      const { event, missing } = mapFinalsiteContact(raw);
      for (const m of missing) missingCount.set(m, (missingCount.get(m) ?? 0) + 1);
      if (!event) noYear++;
      else if (wanted.has(event.entryYear)) events.push(event);
    }
  }
  const warnings: string[] = [];
  if (noYear) warnings.push(`${noYear} of ${seen} contacts had no entry year and were not counted.`);
  for (const [field, n] of missingCount) {
    if (field !== "entryYear" && n === seen && seen > 0) {
      warnings.push(`No contact had ${field}. Check FINALSITE_FUNNEL_FIELDS.${field} against the Swagger page.`);
    }
  }
  return { events, warnings };
}

/** One page, reported as field names and how many objects came back —
 *  never values — so the field map can be checked before the first import. */
export async function checkFinalsiteConnection(): Promise<{
  objectsOnFirstPage: number;
  responseKeys: string[];
  keysSeen: string[];
  fieldsFound: Record<keyof FunnelEvent, string | null>;
}> {
  let responseKeys: string[] = [];
  const first: Raw[] = (await pages(1, (k) => (responseKeys = k)).next()).value ?? [];
  const keys = new Set<string>(first.flatMap((o) => keyPaths(o)));
  const fieldsFound = Object.fromEntries(
    (Object.keys(FINALSITE_FUNNEL_FIELDS) as (keyof FunnelEvent)[]).map((f) => [
      f,
      FINALSITE_FUNNEL_FIELDS[f].find((k) => keys.has(k)) ?? null,
    ])
  ) as Record<keyof FunnelEvent, string | null>;
  return { objectsOnFirstPage: first.length, responseKeys, keysSeen: [...keys].sort(), fieldsFound };
}
