// A course's learning objectives, straight from Canvas (the Outcomes the
// teacher already set up, grouped by unit), turned into the hub's standard
// set so everything else (Khan skills, AP Classroom, Canvas work) can sort
// under them. Pure; tested in tests/mastery.test.mjs.
//
// Canvas shape (GET /courses/:id/outcome_group_links?outcome_style=full):
//   [{ outcome_group: { id, title }, outcome: { id, title, display_name,
//      description, mastery_points, points_possible, ratings } }]
// Each outcome's immediate group is its unit ("Unit 2 · Forces"). Outcomes
// at the course's root land in one "Course objectives" group.

import type { MasteryConfig } from "./config.ts";

export interface CanvasOutcomeLink {
  outcome_group?: { id: number | string; title?: string | null } | null;
  outcome?: {
    id: number | string;
    title?: string | null;
    display_name?: string | null;
    description?: string | null;
    mastery_points?: number | null;
    points_possible?: number | null;
    ratings?: { description?: string | null; points?: number | null }[] | null;
  } | null;
}

export const outcomeCode = (id: number | string) => `o${id}`;
export const outcomeGroupCode = (id: number | string) => `g${id}`;

/** "Unit 2 · Forces" / "U2: Forces" / "2. Forces" → 2. */
export function unitNumberOf(title: string): number | null {
  const m = title.match(/\bunit\s*(\d{1,2})\b/i) ?? title.match(/^\s*U(\d{1,2})\b/) ?? title.match(/^\s*(\d{1,2})[.:)\s-]/);
  return m ? Number(m[1]) : null;
}

const stripHtml = (s: string) =>
  s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

/**
 * The hub's standard set for a course from its Canvas outcomes. Levels,
 * rules and level words come from `base` (the subject's set), and so do each
 * unit's videos and study links, matched by unit number, so nothing already
 * curated is lost. Objective codes are Canvas ids (o123), so a re-pull keeps
 * every piece of evidence attached.
 */
export function objectivesFromCanvas(
  links: CanvasOutcomeLink[],
  opts: { key: string; slug: string; title: string; courseTitle: string; base: MasteryConfig | null; baseRaw: Record<string, unknown> | null },
): Record<string, unknown> {
  const groups = new Map<string, { code: string; title: string; unitNumber: number | null; standards: Record<string, unknown>[] }>();
  const seen = new Set<string>();
  for (const l of links) {
    const o = l.outcome;
    if (!o || o.id == null) continue;
    const code = outcomeCode(o.id);
    if (seen.has(code)) continue; // one outcome linked in two places: first wins
    seen.add(code);
    const groupTitle = (l.outcome_group?.title ?? "").trim();
    const isRoot = !groupTitle || groupTitle === opts.courseTitle;
    const gKey = isRoot ? "root" : String(l.outcome_group!.id);
    if (!groups.has(gKey))
      groups.set(gKey, {
        code: isRoot ? "gcourse" : outcomeGroupCode(l.outcome_group!.id),
        title: isRoot ? "Course objectives" : groupTitle.slice(0, 200),
        unitNumber: isRoot ? null : unitNumberOf(groupTitle),
        standards: [],
      });
    const title = stripHtml(o.display_name || o.title || "").slice(0, 200) || `Objective ${o.id}`;
    const description = o.description ? stripHtml(o.description).slice(0, 300) : "";
    groups.get(gKey)!.standards.push({
      code,
      title,
      aliases: [],
      ...(description ? { description } : {}),
      resources: [],
      videos: [],
    });
  }
  const ordered = [...groups.values()].sort(
    (a, b) => (a.unitNumber ?? 999) - (b.unitNumber ?? 999) || a.title.localeCompare(b.title),
  );
  const baseRaw = opts.baseRaw ?? {};
  const baseGroups = (opts.base?.groups ?? []).filter((g) => g.unitNumber !== null);
  return {
    key: opts.key,
    slug: opts.slug,
    title: opts.title,
    source: "canvas",
    scale: baseRaw.scale,
    rules: baseRaw.rules,
    groups: ordered.map((g) => {
      const match = g.unitNumber === null ? undefined : baseGroups.find((b) => b.unitNumber === g.unitNumber);
      return {
        code: g.code,
        title: g.title,
        unitNumber: g.unitNumber,
        // Carried over from the subject's set: the unit's links, and its own
        // and its topics' videos, so the shelf stays full.
        resources: match ? match.resources : [],
        videos: match ? dedupeVideos([...match.videos, ...match.standards.flatMap((s) => s.videos)]) : [],
        standards: g.standards,
      };
    }),
  };
}

function dedupeVideos<T extends { id: string }>(videos: T[]): T[] {
  const ids = new Set<string>();
  return videos.filter((v) => !ids.has(v.id) && Boolean(ids.add(v.id)));
}

/** Canvas outcome id → objective code, for a config built from Canvas. */
export function outcomeCodes(config: MasteryConfig): Map<string, string> {
  return new Map(config.groups.flatMap((g) => g.standards).filter((s) => /^o\d+$/.test(s.code)).map((s) => [s.code.slice(1), s.code]));
}

/** A Canvas rollup score as the outcome's own rating words ("Meets
 *  Mastery"): the highest rating at or below the score. */
export function ratingLabel(score: number, ratings: { description?: string | null; points?: number | null }[] | null | undefined): string | null {
  const sorted = (ratings ?? []).filter((r) => typeof r.points === "number").sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
  const hit = sorted.find((r) => score >= (r.points ?? 0));
  return hit?.description?.trim() || null;
}

const STOP = new Set(["the", "and", "of", "a", "an", "in", "on", "to", "for", "with", "using", "use", "how", "what", "intro", "introduction", "practice", "problems", "problem", "skill", "skills", "unit", "basics", "understanding", "analyze", "analyzing", "describe", "describing", "apply", "applying", "students", "student", "will", "be", "able", "can", "is", "are", "by", "from", "about", "between", "its", "their"]);
const stem = (w: string) => w.replace(/(ings?|ions?|ies|es|s)$/, "");
const tokens = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/['’]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
      .map(stem),
  );

/**
 * Which objective a Khan skill most likely belongs to: among the objectives
 * in the Canvas unit with the same unit number (else all of them), the one
 * whose title, description and other names share the most words with the
 * skill's title. null when nothing overlaps or two tie: the teacher decides.
 */
export function suggestObjective(skillTitle: string, unitNumber: number | null, config: MasteryConfig): string | null {
  const pool =
    (unitNumber != null ? config.groups.find((g) => g.unitNumber === unitNumber)?.standards : null) ?? config.groups.flatMap((g) => g.standards);
  const want = tokens(skillTitle);
  if (!want.size) return null;
  const scored = pool
    .map((s) => {
      const have = tokens([s.title, s.description ?? "", ...s.aliases].join(" "));
      let n = 0;
      for (const w of want) if (have.has(w)) n++;
      return { code: s.code, n };
    })
    .sort((a, b) => b.n - a.n);
  if (!scored.length || scored[0].n === 0 || scored[1]?.n === scored[0].n) return null;
  return scored[0].code;
}

// ---------------------------------------------------------------- objectives as assignments
//
// Some teachers (seno) keep each learning objective as a Canvas ASSIGNMENT,
// graded for mastery, instead of as an Outcome. Then the teacher picks those
// assignments once; each becomes an objective (a<assignment id>), its unit
// read from its name or its assignment group, and the student's grade on it
// is the objective's Canvas score.

export interface CanvasAssignmentGroup {
  id: number | string;
  name?: string | null;
  position?: number | null;
  assignments?: {
    id: number | string;
    name?: string | null;
    points_possible?: number | null;
    description?: string | null;
    position?: number | null;
    published?: boolean | null;
  }[];
}

export interface AssignmentChoice {
  id: string;
  name: string;
  group: string;
  points: number | null;
  /** The unit it belongs to, from its name, else its assignment group. */
  unitNumber: number | null;
  /** Looks like a learning objective (its name or its group says so). */
  suggested: boolean;
}

export const assignmentCode = (id: number | string) => `a${id}`;

const OBJECTIVE_WORDS = /\b(LOs?|learning\s+(objective|target|goal)s?|objectives?|mastery|standards?|targets?)\b/i;

/** "LO 2.1 …", "LO2-3", "Unit 2 …", "U2 …", "2.1 …", "2. …" → 2. */
export function unitFromName(name: string): number | null {
  const lo = name.match(/\bLO\s*-?\s*(\d{1,2})(?:[.\-]\d+)?\b/i);
  if (lo) return Number(lo[1]);
  const dotted = name.match(/^\s*(\d{1,2})\.\d+\b/);
  if (dotted) return Number(dotted[1]);
  return unitNumberOf(name);
}

/** Every published assignment, with its unit and whether it looks like an
 *  objective, in Canvas's own order. */
export function assignmentChoices(groups: CanvasAssignmentGroup[]): AssignmentChoice[] {
  return [...groups]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .flatMap((g) => {
      const groupName = (g.name ?? "").trim();
      return [...(g.assignments ?? [])]
        .filter((a) => a.published !== false && a.id != null && (a.name ?? "").trim())
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((a) => {
          const name = (a.name ?? "").trim().slice(0, 200);
          return {
            id: String(a.id),
            name,
            group: groupName,
            points: typeof a.points_possible === "number" ? a.points_possible : null,
            unitNumber: unitFromName(name) ?? unitNumberOf(groupName),
            suggested: OBJECTIVE_WORDS.test(name) || OBJECTIVE_WORDS.test(groupName),
          };
        });
    });
}

/**
 * The course's standard set from the assignments the teacher picked: a unit
 * per unit number (titled like the subject's own unit, when there is one),
 * an objective per assignment, in Canvas order. Levels, rules, videos and
 * links come from `base`, as for Outcomes.
 */
export function objectivesFromAssignments(
  groups: CanvasAssignmentGroup[],
  picks: { id: string; unitNumber: number | null }[],
  opts: { key: string; slug: string; title: string; base: MasteryConfig | null; baseRaw: Record<string, unknown> | null },
): Record<string, unknown> {
  const all = new Map(assignmentChoices(groups).map((c) => [c.id, c]));
  const descriptions = new Map(groups.flatMap((g) => g.assignments ?? []).map((a) => [String(a.id), a.description ? stripHtml(a.description).slice(0, 300) : ""]));
  const units = new Map<string, { unitNumber: number | null; standards: Record<string, unknown>[] }>();
  for (const p of picks) {
    const a = all.get(p.id);
    if (!a) continue;
    const key = p.unitNumber == null ? "none" : String(p.unitNumber);
    if (!units.has(key)) units.set(key, { unitNumber: p.unitNumber, standards: [] });
    const description = descriptions.get(a.id);
    units.get(key)!.standards.push({ code: assignmentCode(a.id), title: a.name, ...(description ? { description } : {}), aliases: [], resources: [], videos: [] });
  }
  const baseRaw = opts.baseRaw ?? {};
  const baseGroups = (opts.base?.groups ?? []).filter((g) => g.unitNumber !== null);
  return {
    key: opts.key,
    slug: opts.slug,
    title: opts.title,
    source: "canvas-assignments",
    scale: baseRaw.scale,
    rules: baseRaw.rules,
    groups: [...units.values()]
      .sort((a, b) => (a.unitNumber ?? 999) - (b.unitNumber ?? 999))
      .map((u) => {
        const match = u.unitNumber === null ? undefined : baseGroups.find((b) => b.unitNumber === u.unitNumber);
        return {
          code: u.unitNumber === null ? "ucourse" : `u${u.unitNumber}`,
          title: u.unitNumber === null ? "Course objectives" : match?.title ?? `Unit ${u.unitNumber}`,
          unitNumber: u.unitNumber,
          resources: match ? match.resources : [],
          videos: match ? dedupeVideos([...match.videos, ...match.standards.flatMap((s) => s.videos)]) : [],
          standards: u.standards,
        };
      }),
  };
}

/** Canvas assignment id → objective code, for a config built from assignments. */
export function assignmentCodes(config: MasteryConfig): Map<string, string> {
  return new Map(config.groups.flatMap((g) => g.standards).filter((s) => /^a\d+$/.test(s.code)).map((s) => [s.code.slice(1), s.code]));
}
