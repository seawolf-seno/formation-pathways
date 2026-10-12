// A Mastery Hub course's standards file (fixtures/mastery/<key>.json): the
// standards hierarchy, the level words, the rules that turn evidence into a
// level, and the study links for each unit. Faculty edit the file; another
// teacher adapts the hub to their subject by adding one. Pure: checks the
// file's shape and answers questions about it. No I/O. Tested in
// tests/mastery.test.mjs.

export const LEVELS = ["beginning", "developing", "proficient", "extending"] as const;
export type Level = (typeof LEVELS)[number];

export const EVIDENCE_SOURCES = [
  "canvas",
  "ap_classroom",
  "khan",
  "phet",
  "openstax",
  "oral",
  "observation",
  "student",
  "other",
] as const;
export type EvidenceSource = (typeof EVIDENCE_SOURCES)[number];

export const SOURCE_LABELS: Record<EvidenceSource, string> = {
  canvas: "Canvas",
  ap_classroom: "AP Classroom",
  khan: "Khan Academy",
  phet: "PhET",
  openstax: "OpenStax",
  oral: "Oral exam",
  observation: "Teacher observation",
  student: "Sent in by the student",
  other: "Other",
};

export const RESOURCE_KINDS = ["khan", "phet", "openstax", "ap_classroom", "other"] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export interface Resource {
  kind: ResourceKind;
  label: string;
  url: string;
}

/** A YouTube video, kept as its id: the page links to youtube.com and shows
 *  YouTube's own thumbnail. Nothing is embedded or downloaded. */
export interface Video {
  id: string;
  title: string;
  channel: string;
  /** What it covers, in a few words. */
  topics: string | null;
}

export interface Standard {
  code: string;
  title: string;
  /** Other names for it (a Khan Academy skill, a textbook heading), so an
   *  assignment titled that way counts toward this standard. */
  aliases: string[];
  resources: Resource[];
  videos: Video[];
}

export interface StandardGroup {
  code: string;
  title: string;
  /** "Unit 2 …" in an export title maps to this group. */
  unitNumber: number | null;
  resources: Resource[];
  videos: Video[];
  standards: Standard[];
}

export interface ScaleStep {
  level: Level;
  label: string;
  meaning: string;
}

export interface MasteryRules {
  /** Lowest percent for each level above beginning. */
  scoreThresholds: { extending: number; proficient: number; developing: number };
  /** How many of the newest pieces of evidence count. */
  recent: number;
  /** Each older piece counts this much as the one after it (0–1). */
  decay: number;
  weights: Record<EvidenceSource, number>;
  /** A teacher's own judgment from these sources stands until newer evidence. */
  teacherSources: EvidenceSource[];
  /** Words an export uses for a level (Khan's "Mastered"…), lowercased.
   *  null: the row says nothing about mastery and is skipped. */
  levelWords: Record<string, Level | null>;
}

export interface MasteryConfig {
  key: string;
  /** The default course address (/mastery/APPhysics1). */
  slug: string;
  title: string;
  scale: ScaleStep[];
  rules: MasteryRules;
  groups: StandardGroup[];
}

const CODE = /^[A-Za-z0-9.-]{1,20}$/;
/** A course address: same rule as mastery_courses.slug in the database. */
export const COURSE_SLUG = /^[A-Za-z][A-Za-z0-9-]{1,39}$/;
const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, where: string, max = 200): string => {
  if (typeof v !== "string" || !v.trim() || v.length > max) throw new Error(`${where}: expected text`);
  return v.trim();
};

function parseResources(v: unknown, where: string): Resource[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) throw new Error(`${where}: resources must be a list`);
  return v.map((r, i) => {
    if (!isObj(r)) throw new Error(`${where} resource ${i + 1}: expected an object`);
    const kind = RESOURCE_KINDS.includes(r.kind as ResourceKind) ? (r.kind as ResourceKind) : "other";
    const url = text(r.url, `${where} resource ${i + 1} url`, 500);
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`${where} resource ${i + 1}: not a web address`);
    }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password)
      throw new Error(`${where} resource ${i + 1}: links must be https, with no sign-in details`);
    return { kind, label: text(r.label, `${where} resource ${i + 1} label`), url: parsed.toString() };
  });
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** A YouTube watch / short / youtu.be address (or a bare id) → its id. */
export function youtubeId(raw: string): string | null {
  const v = raw.trim();
  if (VIDEO_ID.test(v)) return v;
  try {
    const u = new URL(v);
    if (u.protocol !== "https:") return null;
    const host = u.hostname.replace(/^(www|m)\./, "");
    const id =
      host === "youtu.be" ? u.pathname.slice(1)
      : host === "youtube.com" ? (u.searchParams.get("v") ?? u.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1] ?? "")
      : "";
    return VIDEO_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

export const videoUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
export const videoThumbnail = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

function parseVideos(v: unknown, where: string): Video[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) throw new Error(`${where}: videos must be a list`);
  return v.map((x, i) => {
    if (!isObj(x)) throw new Error(`${where} video ${i + 1}: expected an object`);
    const id = youtubeId(String(x.id ?? x.url ?? ""));
    if (!id) throw new Error(`${where} video ${i + 1}: not a YouTube video id or address`);
    return {
      id,
      title: text(x.title, `${where} video ${i + 1} title`, 200),
      channel: text(x.channel, `${where} video ${i + 1} channel`, 100),
      topics: typeof x.topics === "string" && x.topics.trim() ? x.topics.trim().slice(0, 200) : null,
    };
  });
}

/** Reads and checks a standards file. Throws a plain message naming the
 *  first problem, so a faculty edit that breaks the file says where. */
export function parseMasteryConfig(raw: unknown): MasteryConfig {
  if (!isObj(raw)) throw new Error("The standards file must be a JSON object");
  const key = text(raw.key, "key", 60);
  if (!/^[a-z0-9-]+$/.test(key)) throw new Error("key: lowercase letters, numbers and dashes only");

  const scaleRaw = Array.isArray(raw.scale) ? raw.scale : [];
  const scale = LEVELS.map((level) => {
    const s = scaleRaw.find((x) => isObj(x) && x.level === level) as Record<string, unknown> | undefined;
    if (!s) throw new Error(`scale: missing ${level}`);
    return { level, label: text(s.label, `scale ${level} label`, 40), meaning: text(s.meaning, `scale ${level} meaning`, 300) };
  });

  const r = isObj(raw.rules) ? raw.rules : {};
  const t = isObj(r.scoreThresholds) ? r.scoreThresholds : {};
  const num = (v: unknown, where: string, lo: number, hi: number) => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) throw new Error(`${where}: expected a number from ${lo} to ${hi}`);
    return v;
  };
  const scoreThresholds = {
    extending: num(t.extending, "rules.scoreThresholds.extending", 0, 100),
    proficient: num(t.proficient, "rules.scoreThresholds.proficient", 0, 100),
    developing: num(t.developing, "rules.scoreThresholds.developing", 0, 100),
  };
  if (!(scoreThresholds.extending > scoreThresholds.proficient && scoreThresholds.proficient > scoreThresholds.developing))
    throw new Error("rules.scoreThresholds: extending > proficient > developing");
  const w = isObj(r.weights) ? r.weights : {};
  const weights = Object.fromEntries(
    EVIDENCE_SOURCES.map((s) => [s, w[s] === undefined ? 1 : num(w[s], `rules.weights.${s}`, 0, 10)]),
  ) as Record<EvidenceSource, number>;
  const teacherSources = (Array.isArray(r.teacherSources) ? r.teacherSources : ["oral", "observation"]).filter(
    (s): s is EvidenceSource => EVIDENCE_SOURCES.includes(s as EvidenceSource),
  );
  const levelWords: Record<string, Level | null> = {};
  if (isObj(r.levelWords))
    for (const [word, level] of Object.entries(r.levelWords)) {
      if (level !== null && !LEVELS.includes(level as Level)) throw new Error(`rules.levelWords.${word}: not a level`);
      levelWords[word.trim().toLowerCase()] = level as Level | null;
    }
  for (const l of LEVELS) levelWords[l] ??= l;
  const rules: MasteryRules = {
    scoreThresholds,
    recent: Math.round(num(r.recent ?? 4, "rules.recent", 1, 20)),
    decay: num(r.decay ?? 0.6, "rules.decay", 0.05, 1),
    weights,
    teacherSources,
    levelWords,
  };

  if (!Array.isArray(raw.groups) || !raw.groups.length) throw new Error("groups: expected a list of units");
  const seen = new Set<string>();
  const groups = raw.groups.map((g, gi): StandardGroup => {
    if (!isObj(g)) throw new Error(`group ${gi + 1}: expected an object`);
    const code = text(g.code, `group ${gi + 1} code`, 20);
    if (!Array.isArray(g.standards) || !g.standards.length) throw new Error(`${code}: no standards`);
    return {
      code,
      title: text(g.title, `${code} title`),
      unitNumber: typeof g.unitNumber === "number" ? g.unitNumber : null,
      resources: parseResources(g.resources, code),
      videos: parseVideos(g.videos, code),
      standards: g.standards.map((s, si) => {
        if (!isObj(s)) throw new Error(`${code} standard ${si + 1}: expected an object`);
        const sc = text(s.code, `${code} standard ${si + 1} code`, 20);
        if (!CODE.test(sc)) throw new Error(`${sc}: letters, numbers, dots and dashes only`);
        if (seen.has(sc)) throw new Error(`${sc}: used twice`);
        seen.add(sc);
        const aliases = s.aliases === undefined ? [] : Array.isArray(s.aliases) ? s.aliases.map((a, ai) => text(a, `${sc} alias ${ai + 1}`, 120)) : null;
        if (!aliases) throw new Error(`${sc}: aliases must be a list`);
        return { code: sc, title: text(s.title, `${sc} title`), aliases, resources: parseResources(s.resources, sc), videos: parseVideos(s.videos, sc) };
      }),
    };
  });

  const slug = typeof raw.slug === "string" ? raw.slug.trim() : "";
  if (!COURSE_SLUG.test(slug)) throw new Error("slug: the course address, e.g. APPhysics1 (letters, numbers, dashes)");
  return { key, slug, title: text(raw.title, "title", 120), scale, rules, groups };
}

export function allStandards(config: MasteryConfig): (Standard & { group: StandardGroup })[] {
  return config.groups.flatMap((group) => group.standards.map((s) => ({ ...s, group })));
}

export function findStandard(config: MasteryConfig, code: string) {
  return allStandards(config).find((s) => s.code === code) ?? null;
}

/** A standard's own links first, then its unit's. */
export function resourcesFor(config: MasteryConfig, code: string): Resource[] {
  const s = findStandard(config, code);
  return s ? [...s.resources, ...s.group.resources] : [];
}

export function levelLabel(config: MasteryConfig, level: Level | null): string {
  if (!level) return "Not started";
  return config.scale.find((s) => s.level === level)?.label ?? level;
}

/** Standards as choices for a picker, grouped by unit. */
export function standardOptions(config: MasteryConfig): { code: string; title: string; group: string }[] {
  return allStandards(config).map((s) => ({ code: s.code, title: s.title, group: s.group.title }));
}

/** A standard's own videos first, then its unit's (no repeats). */
export function videosFor(config: MasteryConfig, code: string): Video[] {
  const s = findStandard(config, code);
  if (!s) return [];
  const seen = new Set<string>();
  return [...s.videos, ...s.group.videos].filter((v) => !seen.has(v.id) && Boolean(seen.add(v.id)));
}
