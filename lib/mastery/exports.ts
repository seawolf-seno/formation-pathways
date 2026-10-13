// Reads a report a teacher downloads from AP Classroom, Khan Academy or any
// other gradebook (a CSV), and turns it into mastery evidence. This replaces
// logging in to those sites on the teacher's behalf: no passwords leave the
// teacher, nothing is scraped, and each site's own export is used as intended.
//
// The exact column names those sites use are NOT verified against real
// exports yet, so the reader is tolerant: it looks for a student column
// (email or name), then either one row per assessment (title + score / level
// columns) or one row per student with a column per assessment ("8/10",
// "80%", "Mastered"). Anything it can't place is listed for the teacher, who
// always sees a preview before anything is saved.
//
// Students are matched only exactly (school email, or first + last name), so
// a grade is never attached to the wrong student on a guess. Pure; tested in
// tests/mastery.test.mjs.

import { allStandards, type EvidenceSource, type Level, type MasteryConfig } from "./config.ts";

export interface ExportRow {
  line: number;
  studentEmail: string | null;
  studentName: string | null;
  title: string;
  standardCodes: string[];
  score: number | null;
  maxScore: number | null;
  level: Level | null;
  occurredAt: string | null;
}

export interface ParsedExport {
  rows: ExportRow[];
  /** Assessment titles with no standard found (the teacher picks one). */
  unmappedTitles: string[];
  /** Cells that weren't a score or a level word, by example. */
  skipped: string[];
  layout: "long" | "wide";
}

const key = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");
const ALIASES = {
  email: ["email", "emailaddress", "studentemail", "username", "login"],
  name: ["studentname", "student", "name", "fullname"],
  first: ["firstname", "first", "givenname"],
  last: ["lastname", "last", "surname", "familyname"],
  title: ["assignment", "assignmentname", "assessment", "assessmentname", "title", "quiz", "test", "activity", "skill", "exercise", "progresscheck"],
  standard: ["standard", "standards", "topic", "topics", "learningobjective", "objective", "skillcode", "code"],
  score: ["score", "points", "pointsearned", "earned", "rawscore", "correct"],
  max: ["maxscore", "outof", "possible", "pointspossible", "total", "totalpoints", "maxpoints"],
  percent: ["percent", "percentage", "pct", "percentcorrect", "scorepercent"],
  level: ["mastery", "masterylevel", "level", "status", "skilllevel"],
  date: ["date", "completed", "completedat", "completedon", "submitted", "submittedat", "duedate"],
} as const;
type Field = keyof typeof ALIASES;

function findColumns(headers: string[]): Partial<Record<Field, string>> {
  const found: Partial<Record<Field, string>> = {};
  for (const field of Object.keys(ALIASES) as Field[]) {
    const h = headers.find((x) => (ALIASES[field] as readonly string[]).includes(key(x)));
    if (h) found[field] = h;
  }
  return found;
}

/** "8/10", "8 / 10", "80%", "0.8"? no: a bare number is a percent. */
export function readScore(cell: string): { score: number; max: number } | null {
  const c = cell.trim();
  let m = c.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (m && Number(m[2]) > 0) return { score: Number(m[1]), max: Number(m[2]) };
  m = c.match(/^(\d+(?:\.\d+)?)\s*%?$/);
  if (m && Number(m[1]) <= 100) return { score: Number(m[1]), max: 100 };
  return null;
}

/** Lowercase words only: "Newton’s 2nd-law!" → "newtons 2nd law". */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Standards whose title (two words or more) or one of whose aliases appears
 *  whole in the assignment title: "Newton's second law practice" → 2.5. A
 *  one-word title ("Work", "Power") only counts as an alias would: on its
 *  own it's too common to trust. When one match sits inside a longer one
 *  ("second law" in "rotational form of Newton's second law"), only the
 *  longer counts. More than three matches means the title is too general,
 *  and none count. */
export function standardsByName(title: string, config: MasteryConfig): string[] {
  const t = ` ${normalizeName(title)} `;
  const hits: { code: string; phrase: string }[] = [];
  for (const s of allStandards(config)) {
    const own = normalizeName(s.title);
    const phrases = [...(own.includes(" ") ? [own] : []), ...s.aliases.map(normalizeName)].filter((p) => p && t.includes(` ${p} `));
    if (phrases.length) hits.push({ code: s.code, phrase: phrases.sort((a, b) => b.length - a.length)[0] });
  }
  const kept = hits.filter((h) => !hits.some((o) => o !== h && o.phrase.length > h.phrase.length && ` ${o.phrase} `.includes(` ${h.phrase} `)));
  return kept.length <= 3 ? kept.map((h) => h.code) : [];
}

/** Standard codes a title names, as whole tokens ("Quiz [2.5, 2.7]",
 *  "SP1 practice"), else every standard of the unit it names ("Unit 2
 *  Progress Check"), else standards it names in words ("Newton's second
 *  law"), else none. */
export function standardsInTitle(title: string, config: MasteryConfig): string[] {
  const codes = allStandards(config).map((s) => s.code);
  const named = codes.filter((c) => new RegExp(`(^|[^A-Za-z0-9.])${c.replace(/\./g, "\\.")}($|[^A-Za-z0-9]|\\.(?!\\d))`, "i").test(title));
  if (named.length) return named;
  const unit = title.match(/\bunit\s*(\d{1,2})\b/i) ?? title.match(/\bU(\d{1,2})\b/);
  if (unit) {
    const group = config.groups.find((g) => g.unitNumber === Number(unit[1]));
    if (group) return group.standards.map((s) => s.code);
  }
  return standardsByName(title, config);
}

function standardsInCell(cell: string, config: MasteryConfig): string[] {
  const codes = new Set(allStandards(config).map((s) => s.code.toLowerCase()));
  const listed = cell.split(/[,;|\s]+/).map((c) => c.replace(/^\[|\]$/g, "").trim().toLowerCase()).filter((c) => codes.has(c));
  if (listed.length) return allStandards(config).filter((s) => listed.includes(s.code.toLowerCase())).map((s) => s.code);
  return standardsInTitle(cell, config);
}

function readDate(cell: string | undefined): string | null {
  if (!cell?.trim()) return null;
  const d = new Date(cell.trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function parseExport(records: Record<string, string>[], config: MasteryConfig): ParsedExport {
  const headers = records.length ? Object.keys(records[0]) : [];
  const col = findColumns(headers);
  const words = config.rules.levelWords;
  const skipped = new Set<string>();
  const rows: ExportRow[] = [];

  const who = (r: Record<string, string>) => {
    const email = col.email ? r[col.email]?.trim().toLowerCase() || null : null;
    let name = col.name ? r[col.name]?.trim() || null : null;
    if (!name && (col.first || col.last)) name = [col.first && r[col.first], col.last && r[col.last]].filter(Boolean).join(" ").trim() || null;
    return { studentEmail: email && email.includes("@") ? email : null, studentName: name };
  };

  const value = (cell: string | undefined, percentCell?: string, maxCell?: string) => {
    const c = cell?.trim() ?? "";
    const word = c.toLowerCase();
    if (Object.hasOwn(words, word)) return { level: words[word], score: null, maxScore: null, known: words[word] !== null };
    if (maxCell?.trim() && /^\d+(\.\d+)?$/.test(c) && Number(maxCell) > 0)
      return { level: null, score: Number(c), maxScore: Number(maxCell), known: true };
    const s = readScore(c) ?? (percentCell ? readScore(percentCell) : null);
    if (s) return { level: null, score: s.score, maxScore: s.max, known: true };
    if (c && c !== "-" && c !== "—") skipped.add(c.slice(0, 40));
    return null;
  };

  const identity = new Set([col.email, col.name, col.first, col.last, col.date].filter(Boolean) as string[]);
  const long = Boolean(col.title && (col.score || col.percent || col.level));

  records.forEach((r, i) => {
    const person = who(r);
    if (!person.studentEmail && !person.studentName) return;
    const occurredAt = readDate(col.date ? r[col.date] : undefined);
    if (long) {
      const title = r[col.title!]?.trim();
      if (!title) return;
      const v =
        (col.level && r[col.level]?.trim() ? value(r[col.level]) : null) ??
        value(col.score ? r[col.score] : undefined, col.percent ? r[col.percent] : undefined, col.max ? r[col.max] : undefined);
      if (!v || !v.known) return;
      const codes = col.standard && r[col.standard]?.trim() ? standardsInCell(r[col.standard], config) : standardsInTitle(title, config);
      rows.push({ line: i + 2, ...person, title: title.slice(0, 200), standardCodes: codes, score: v.score, maxScore: v.maxScore, level: v.level, occurredAt });
      return;
    }
    // Wide: every other column is an assessment.
    for (const h of headers) {
      if (identity.has(h) || !h.trim()) continue;
      const v = value(r[h]);
      if (!v || !v.known) continue;
      rows.push({ line: i + 2, ...person, title: h.trim().slice(0, 200), standardCodes: standardsInTitle(h, config), score: v.score, maxScore: v.maxScore, level: v.level, occurredAt });
    }
  });

  const unmappedTitles = [...new Set(rows.filter((r) => !r.standardCodes.length).map((r) => r.title))];
  return { rows, unmappedTitles, skipped: [...skipped].slice(0, 8), layout: long ? "long" : "wide" };
}

export interface RosterPerson {
  person_id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  email: string | null;
}

const normName = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);

/** Exact match only: the student's school email, or their first (or
 *  preferred) and last name in either order ("Lee, Sam" / "Sam Lee"). Two
 *  roster students with the same name never match by name. */
export function matchStudent(row: Pick<ExportRow, "studentEmail" | "studentName">, roster: RosterPerson[]): RosterPerson | null {
  if (row.studentEmail) {
    const byEmail = roster.find((p) => p.email && p.email === row.studentEmail);
    if (byEmail) return byEmail;
  }
  if (!row.studentName) return null;
  const tokens = new Set(normName(row.studentName));
  const hits = roster.filter((p) => {
    const last = normName(p.last_name);
    const firsts = [p.first_name, p.preferred_name].filter(Boolean).map((f) => normName(f!));
    return last.length > 0 && last.every((t) => tokens.has(t)) && firsts.some((f) => f.length > 0 && f.every((t) => tokens.has(t)));
  });
  return hits.length === 1 ? hits[0] : null;
}

export interface EvidenceDraft {
  person_id: string;
  standard_code: string;
  source: EvidenceSource;
  title: string;
  score: number | null;
  max_score: number | null;
  level: Level | null;
  occurred_at: string;
  external_key: string;
}

/** Rows → evidence to save, one per matched student and standard. The key
 *  makes a re-upload of the same report add nothing, while a changed score
 *  (a retake) is new evidence. */
export function exportEvidence(
  parsed: ParsedExport,
  roster: RosterPerson[],
  source: EvidenceSource,
  fallbackStandard: string | null,
  now: string,
): { evidence: EvidenceDraft[]; unmatched: string[] } {
  const evidence: EvidenceDraft[] = [];
  const unmatched = new Set<string>();
  for (const row of parsed.rows) {
    const p = matchStudent(row, roster);
    if (!p) {
      unmatched.add(row.studentEmail ?? row.studentName ?? `line ${row.line}`);
      continue;
    }
    const codes = row.standardCodes.length ? row.standardCodes : fallbackStandard ? [fallbackStandard] : [];
    for (const code of codes)
      evidence.push({
        person_id: p.person_id,
        standard_code: code,
        source,
        title: row.title,
        score: row.score,
        max_score: row.maxScore,
        level: row.level,
        occurred_at: row.occurredAt ?? now,
        external_key: `${source}:${row.title.toLowerCase()}:${row.score ?? ""}/${row.maxScore ?? ""}:${row.level ?? ""}`.slice(0, 200),
      });
  }
  return { evidence, unmatched: [...unmatched] };
}
