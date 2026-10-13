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
