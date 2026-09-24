import fs from "fs";
import path from "path";
import { parseCsv } from "./csv";

/**
 * Finalsite Enrollment → admissions_records, from a CSV report export.
 *
 * Column names are the ones in `FINALSITE_COLUMNS` — build the Finalsite
 * report to match, or edit this map to match the report you already have.
 * Any column starting with "Q: " is treated as an application question and
 * its value as the applicant's answer.
 *
 * The uploaded file is parsed in memory and never stored; rows whose Person
 * ID isn't on the pilot allowlist are dropped before anything else happens.
 */
export const FINALSITE_COLUMNS = {
  id: "Person ID",
  entryYear: "Entry Year",
  enteringGrade: "Entering Grade",
  status: "Status",
  previousSchool: "Current School",
  interests: "Interests",
  activities: "Activities",
} as const;
const QUESTION_PREFIX = "Q: ";

export interface FinalsiteRecord {
  externalId: string;
  entryYear: number | null;
  enteringGrade: number | null;
  status: string | null;
  previousSchool: string | null;
  interests: string[];
  activities: string[];
  responses: { question: string; answer: string }[];
}

const toInt = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : null);
const toList = (v: string | undefined) =>
  (v ?? "").split(";").map((s) => s.trim()).filter(Boolean);

export function readFinalsiteCsv(csvText: string, allowlist: Set<string>): FinalsiteRecord[] {
  const rows = parseCsv(csvText);
  if (rows.length && !(FINALSITE_COLUMNS.id in rows[0])) {
    throw new Error(
      `Finalsite export has no "${FINALSITE_COLUMNS.id}" column. Columns found: ${Object.keys(rows[0]).join(", ")}`
    );
  }
  return rows
    .filter((r) => allowlist.has(r[FINALSITE_COLUMNS.id]))
    .map((r) => ({
      externalId: r[FINALSITE_COLUMNS.id],
      entryYear: toInt(r[FINALSITE_COLUMNS.entryYear]),
      enteringGrade: toInt(r[FINALSITE_COLUMNS.enteringGrade]),
      status: r[FINALSITE_COLUMNS.status] || null,
      previousSchool: r[FINALSITE_COLUMNS.previousSchool] || null,
      interests: toList(r[FINALSITE_COLUMNS.interests]),
      activities: toList(r[FINALSITE_COLUMNS.activities]),
      responses: Object.entries(r)
        .filter(([k, v]) => k.startsWith(QUESTION_PREFIX) && v)
        .map(([k, v]) => ({ question: k.slice(QUESTION_PREFIX.length), answer: v })),
    }));
}

export function readSampleFinalsite(allowlist: Set<string>): FinalsiteRecord[] {
  const file = path.join(process.cwd(), "fixtures/sample/finalsite-applicants.csv");
  return readFinalsiteCsv(fs.readFileSync(file, "utf-8"), allowlist);
}

/** Finalsite status → lifecycle stage. Unknown statuses leave stage alone. */
export function stageFromFinalsiteStatus(status: string | null) {
  const s = (status ?? "").toLowerCase();
  if (s.startsWith("enrolled")) return "enrolled" as const;
  if (s.startsWith("accepted") || s.startsWith("admitted")) return "admitted" as const;
  return null;
}
