import fs from "fs";
import path from "path";

/**
 * Blackbaud SKY API (School) → enrollments.
 *
 * Live mode fetches ONE user at a time by id (GET /school/v1/users/{id}) for
 * allowlisted pilot participants only — it never lists the school.
 * Needs BLACKBAUD_SUBSCRIPTION_KEY (developer.blackbaud.com) and a
 * BLACKBAUD_ACCESS_TOKEN from the SKY OAuth flow. SKY access tokens expire
 * after 60 minutes; paste a fresh one before a live run.
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

export function mapBlackbaudUser(raw: Raw): { record: BlackbaudRecord; missing: string[] } {
  const info = (raw.student_info ?? raw.student ?? {}) as Raw;
  const record: BlackbaudRecord = {
    externalId: String(raw.id),
    preferredName: (pick(raw, "preferred_name", "nick_name") as string) ?? null,
    grade: num(pick(info, "grade_level", "grade") ?? pick(raw, "grade_level", "grade")),
    gradYear: num(pick(info, "grad_year", "class_of") ?? pick(raw, "grad_year", "class_of")),
    advisorName: (pick(info, "advisor_name") ?? pick(raw, "advisor_name")) as string | null,
    enrolledSince: (pick(info, "enroll_date") ?? pick(raw, "enroll_date")) as string | null,
  };
  const missing = (["grade", "gradYear"] as const).filter((k) => record[k] == null);
  return { record, missing };
}

export function isLiveBlackbaudConfigured(): boolean {
  return Boolean(process.env.BLACKBAUD_SUBSCRIPTION_KEY && process.env.BLACKBAUD_ACCESS_TOKEN);
}

export async function fetchLiveBlackbaud(
  allowlist: Set<string>
): Promise<{ records: BlackbaudRecord[]; warnings: string[] }> {
  const records: BlackbaudRecord[] = [];
  const warnings: string[] = [];
  for (const id of allowlist) {
    const res = await fetch(`${SKY_BASE}/users/${encodeURIComponent(id)}`, {
      headers: {
        "Bb-Api-Subscription-Key": process.env.BLACKBAUD_SUBSCRIPTION_KEY!,
        Authorization: `Bearer ${process.env.BLACKBAUD_ACCESS_TOKEN}`,
      },
    });
    if (res.status === 404) continue;
    if (!res.ok) throw new Error(`Blackbaud SKY ${res.status} — token expired or missing scope?`);
    const raw = (await res.json()) as Raw;
    const { record, missing } = mapBlackbaudUser(raw);
    if (missing.length) {
      warnings.push(
        `Blackbaud user ${id}: no ${missing.join("/")} in response; keys seen: ${Object.keys(raw).join(", ")}`
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
