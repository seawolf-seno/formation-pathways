// New inquiries as a Finalsite Enrollment "Create" import CSV. Finalsite's
// External API is read-only (GET only), so its Import Data tool is the
// supported way in. Admissions downloads this file from /pilot/inquiries and
// imports it with a saved mapping template. CHILD.external_id is our
// inquiry's finalsite_external_id, so the read-only API can find the contact
// again later (e.g. to see when a referred family applies).
//
// Column names follow Finalsite's Create template (Import Templates: Creating
// New Contacts). Custom fields are ENTITY.canonical_name, from Settings >
// Fields & Data > Fields. Values such as the status name, the grade and
// school-year labels and the list separator vary by school, so they're
// settings here, not guesses baked in. docs/inquiries.md lists what
// admissions should confirm before the first import. Pure; tested in
// tests/finalsite-import.test.mjs.

export interface InquiryRow {
  finalsite_external_id: string;
  created_at: string;
  source: string;
  referred_by_code: string | null;
  parent_first_name: string;
  parent_last_name: string;
  parent_relationship: string;
  parent_email: string;
  parent_phone: string | null;
  address_1: string;
  address_2: string | null;
  city: string;
  state: string;
  zip: string;
  country: string;
  child_first_name: string;
  child_last_name: string;
  child_grade: number;
  entry_year: number;
  current_school: string | null;
  one_thing: string | null;
  interests: string[];
}

export interface FinalsiteImportConfig {
  /** The workflow status a new inquiry starts in, exactly as Finalsite names it. */
  status: string;
  /** How Finalsite writes a grade, e.g. "{n}" or "Grade {n}". */
  gradeLabel: string;
  /** How Finalsite writes a workflow year, e.g. "{y}-{y1}" gives 2027-2028. */
  yearLabel: string;
  /** Separator for multi-select custom fields. */
  listSeparator: string;
  /** Canonical names of custom fields; leave a field out to skip its column. */
  fields: {
    currentSchool?: string;
    interests?: string;
    sports?: string;
    oneThing?: string;
    referralCode?: string;
    source?: string;
    inquiryDate?: string;
  };
}

// Pacifica's contacts already carry current_school, inquiry_interests and
// sports_inquiry_interests_ms (seen through the API). The Formation Pathways
// fields (one thing, referral code, source) need creating in Finalsite first,
// so they're off until named.
export const DEFAULT_IMPORT_CONFIG: FinalsiteImportConfig = {
  status: "Inquiry",
  gradeLabel: "{n}",
  yearLabel: "{y}-{y1}",
  listSeparator: ";",
  fields: {
    currentSchool: "current_school",
    interests: "inquiry_interests",
    sports: "sports_inquiry_interests_ms",
  },
};

const clean = (v: string | undefined) => v?.trim().replace(/^(["'])(.*)\1$/, "$2").trim() || undefined;

/** The defaults, overridden by FINALSITE_IMPORT_* settings where present. */
export function importConfigFromEnv(env: Record<string, string | undefined>): FinalsiteImportConfig {
  const d = DEFAULT_IMPORT_CONFIG;
  const field = (name: string, fallback?: string) => {
    const v = env[name];
    if (v === undefined) return fallback;
    return clean(v); // set but empty: skip the column
  };
  return {
    status: clean(env.FINALSITE_IMPORT_STATUS) ?? d.status,
    gradeLabel: clean(env.FINALSITE_IMPORT_GRADE_LABEL) ?? d.gradeLabel,
    yearLabel: clean(env.FINALSITE_IMPORT_YEAR_LABEL) ?? d.yearLabel,
    listSeparator: env.FINALSITE_IMPORT_LIST_SEPARATOR ?? d.listSeparator,
    fields: {
      currentSchool: field("FINALSITE_IMPORT_FIELD_CURRENT_SCHOOL", d.fields.currentSchool),
      interests: field("FINALSITE_IMPORT_FIELD_INTERESTS", d.fields.interests),
      sports: field("FINALSITE_IMPORT_FIELD_SPORTS", d.fields.sports),
      oneThing: field("FINALSITE_IMPORT_FIELD_ONE_THING"),
      referralCode: field("FINALSITE_IMPORT_FIELD_REFERRAL_CODE"),
      source: field("FINALSITE_IMPORT_FIELD_SOURCE"),
      inquiryDate: field("FINALSITE_IMPORT_FIELD_INQUIRY_DATE"),
    },
  };
}

/** One CSV cell: quoted when needed, and never read as a spreadsheet formula
 *  (a family's text starting with = + - @ would otherwise run when opened). */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const SPORTS = new Set([
  "Baseball", "Basketball", "Beach Volleyball", "Cross Country", "Flag Football",
  "Golf", "Soccer", "Surf", "Tennis", "Track", "Volleyball",
]);

/** The Create-import CSV for these inquiries. */
export function toFinalsiteCsv(rows: InquiryRow[], config: FinalsiteImportConfig = DEFAULT_IMPORT_CONFIG): string {
  const f = config.fields;
  const custom: [string | undefined, (r: InquiryRow) => string | null][] = [
    [f.currentSchool, (r) => r.current_school],
    [f.interests, (r) => r.interests.filter((i) => !SPORTS.has(i)).join(config.listSeparator)],
    [f.sports, (r) => r.interests.filter((i) => SPORTS.has(i)).join(config.listSeparator)],
    [f.oneThing, (r) => r.one_thing],
    [f.referralCode, (r) => r.referred_by_code],
    [f.source, (r) => (r.source === "share" ? "Formation Pathways (family share)" : r.source === "website" ? "Formation Pathways (website)" : "Formation Pathways")],
    [f.inquiryDate, (r) => r.created_at.slice(0, 10)],
  ];
  const columns: [string, (r: InquiryRow) => string | number | null][] = [
    ["CHILD.external_id", (r) => r.finalsite_external_id],
    ["CHILD.first_name", (r) => r.child_first_name],
    ["CHILD.last_name", (r) => r.child_last_name],
    ["CHILD.grade", (r) => config.gradeLabel.replace("{n}", String(r.child_grade))],
    ["CHILD.workflow_year", (r) => config.yearLabel.replace("{y1}", String(r.entry_year + 1)).replace("{y}", String(r.entry_year))],
    ["CHILD.status", () => config.status],
    ["PARENT1.first_name", (r) => r.parent_first_name],
    ["PARENT1.last_name", (r) => r.parent_last_name],
    ["PARENT1.relationship", (r) => r.parent_relationship],
    ["PARENT1.email", (r) => r.parent_email],
    ["PARENT1.phone_1_number", (r) => r.parent_phone],
    ["HOUSEHOLD1.address_1", (r) => r.address_1],
    ["HOUSEHOLD1.address_2", (r) => r.address_2],
    ["HOUSEHOLD1.city", (r) => r.city],
    ["HOUSEHOLD1.state", (r) => r.state],
    ["HOUSEHOLD1.zip", (r) => r.zip],
    ["HOUSEHOLD1.country", (r) => r.country],
    ...custom.filter((c): c is [string, (r: InquiryRow) => string | null] => Boolean(c[0])).map(
      ([name, get]) => [`CHILD.${name}`, get] as [string, (r: InquiryRow) => string | null]
    ),
  ];
  const lines = [columns.map(([h]) => csvCell(h)).join(",")];
  for (const r of rows) lines.push(columns.map(([, get]) => csvCell(get(r))).join(","));
  return lines.join("\r\n") + "\r\n";
}
