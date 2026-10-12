// How evidence becomes a mastery level, and what a student does next. Pure
// and deterministic (no AI): the same evidence always gives the same level,
// and a student or parent can be told exactly why. The numbers involved
// (thresholds, weights, how many pieces count) live in the course's standards
// file, so a teacher changes them without code. Tested in
// tests/mastery.test.mjs.

import { LEVELS, allStandards, resourcesFor, videosFor, type EvidenceSource, type Level, type MasteryConfig, type MasteryRules, type Resource, type Standard, type StandardGroup, type Video } from "./config.ts";

export interface EvidenceLike {
  standard_code: string;
  source: EvidenceSource;
  score: number | null;
  max_score: number | null;
  level: Level | null;
  occurred_at: string;
  created_at?: string;
}

export interface StandardStatus {
  code: string;
  level: Level | null;
  /** "teacher": the newest piece is the teacher's own judgment and stands.
   *  "evidence": the weighted recent evidence. "none": nothing yet. */
  basis: "teacher" | "evidence" | "none";
  count: number;
  lastAt: string | null;
}

export function levelFromScore(score: number, max: number, rules: MasteryRules): Level {
  const pct = (score / max) * 100;
  const t = rules.scoreThresholds;
  if (pct >= t.extending) return "extending";
  if (pct >= t.proficient) return "proficient";
  if (pct >= t.developing) return "developing";
  return "beginning";
}

/** The level one piece of evidence points to: its own level if it carries
 *  one (an oral exam, a Khan mastery word), else from its score. */
export function evidenceLevel(e: EvidenceLike, rules: MasteryRules): Level | null {
  if (e.level) return e.level;
  if (e.score !== null && e.max_score !== null && e.max_score > 0) return levelFromScore(e.score, e.max_score, rules);
  return null;
}

const newestFirst = (a: EvidenceLike, b: EvidenceLike) =>
  b.occurred_at.localeCompare(a.occurred_at) || (b.created_at ?? "").localeCompare(a.created_at ?? "");

/**
 * One standard's level from its evidence:
 * 1. If the newest piece is the teacher's own judgment (an oral exam or an
 *    observation with a level), it stands.
 * 2. Otherwise the newest `recent` pieces are averaged on the level ladder,
 *    each weighted by its source and by how recent it is (`decay`).
 */
export function standardLevel(evidence: EvidenceLike[], rules: MasteryRules): Omit<StandardStatus, "code"> {
  const rated = evidence
    .map((e) => ({ e, level: evidenceLevel(e, rules) }))
    .filter((x): x is { e: EvidenceLike; level: Level } => x.level !== null)
    .sort((a, b) => newestFirst(a.e, b.e));
  if (!rated.length) return { level: null, basis: "none", count: 0, lastAt: null };
  const lastAt = rated[0].e.occurred_at;
  if (rules.teacherSources.includes(rated[0].e.source) && rated[0].e.level)
    return { level: rated[0].level, basis: "teacher", count: rated.length, lastAt };

  let sum = 0;
  let weight = 0;
  rated.slice(0, rules.recent).forEach(({ e, level }, i) => {
    const w = (rules.weights[e.source] ?? 1) * Math.pow(rules.decay, i);
    sum += w * LEVELS.indexOf(level);
    weight += w;
  });
  if (weight === 0) return { level: null, basis: "none", count: rated.length, lastAt };
  return { level: LEVELS[Math.round(sum / weight)], basis: "evidence", count: rated.length, lastAt };
}

/** Every standard in the course, with the student's level on it. */
export function studentStatuses(config: MasteryConfig, evidence: EvidenceLike[]): Map<string, StandardStatus> {
  const byCode = new Map<string, EvidenceLike[]>();
  for (const e of evidence) byCode.set(e.standard_code, [...(byCode.get(e.standard_code) ?? []), e]);
  return new Map(
    allStandards(config).map((s) => [s.code, { code: s.code, ...standardLevel(byCode.get(s.code) ?? [], config.rules) }]),
  );
}

/** A unit's level: the middle (lower median) of its standards that have
 *  one. null until any standard in the unit has evidence. */
export function groupLevel(levels: (Level | null)[]): Level | null {
  const idx = levels.filter((l): l is Level => l !== null).map((l) => LEVELS.indexOf(l)).sort((a, b) => a - b);
  if (!idx.length) return null;
  return LEVELS[idx[Math.floor((idx.length - 1) / 2)]];
}

export interface NextStep {
  standard: Standard;
  groupTitle: string;
  level: Level | null;
  /** The class has finished this unit, so this one should be solid by now. */
  covered: boolean;
  /** Recent work already reaches proficient: an oral exam could confirm it. */
  readyToShow: boolean;
  resources: Resource[];
  videos: Video[];
}

const atLeast = (l: Level | null, floor: Level) => l !== null && LEVELS.indexOf(l) >= LEVELS.indexOf(floor);

/** Has the class finished this unit? (Science practices and other groups
 *  without a unit number never count as finished.) */
export function isCovered(group: StandardGroup, finishedThrough: number | null | undefined): boolean {
  return finishedThrough != null && group.unitNumber !== null && group.unitNumber <= finishedThrough;
}

/**
 * What to work on next, at most `limit` standards, in this order:
 * 1. in units the class has finished: standards started but not yet
 *    proficient, then ones with no evidence yet (everyone should have these);
 * 2. elsewhere: standards started but not yet proficient;
 * 3. standards not started yet in a unit the student already has evidence in
 *    (the class is there; later units wait).
 * Each comes with its study links and videos, and a nudge to ask for an oral
 * exam when the newest score already reaches proficient.
 */
export function nextSteps(
  config: MasteryConfig,
  statuses: Map<string, StandardStatus>,
  evidence: EvidenceLike[],
  limit = 3,
  finishedThrough: number | null = null,
): NextStep[] {
  const out: NextStep[] = [];
  const taken = new Set<string>();
  const standards = allStandards(config);
  const level = (code: string) => statuses.get(code)?.level ?? null;
  const add = (s: (typeof standards)[number]) => {
    if (out.length >= limit || taken.has(s.code)) return;
    taken.add(s.code);
    const newest = evidence.filter((e) => e.standard_code === s.code).sort(newestFirst)[0];
    out.push({
      standard: s,
      groupTitle: s.group.title,
      level: level(s.code),
      covered: isCovered(s.group, finishedThrough),
      readyToShow: Boolean(newest && !atLeast(level(s.code), "proficient") && atLeast(evidenceLevel(newest, config.rules), "proficient")),
      resources: resourcesFor(config, s.code),
      videos: videosFor(config, s.code),
    });
  };
  const covered = standards.filter((s) => isCovered(s.group, finishedThrough));
  for (const s of covered) if (level(s.code) && !atLeast(level(s.code), "proficient")) add(s);
  for (const s of covered) if (!level(s.code)) add(s);
  for (const s of standards) if (level(s.code) && !atLeast(level(s.code), "proficient")) add(s);
  const activeGroups = new Set(standards.filter((s) => level(s.code)).map((s) => s.group.code));
  for (const s of standards) if (activeGroups.has(s.group.code) && !level(s.code)) add(s);
  return out;
}

/** How many standards sit at each level: counts only, for summaries. */
export function levelCounts(statuses: Iterable<StandardStatus>): Record<Level | "none", number> {
  const counts = { none: 0, beginning: 0, developing: 0, proficient: 0, extending: 0 } as Record<Level | "none", number>;
  for (const s of statuses) counts[s.level ?? "none"]++;
  return counts;
}
