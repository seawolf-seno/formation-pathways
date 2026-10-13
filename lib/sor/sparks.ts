// What a student says lights them up, captured in the Spark experience
// (/pathway/[personId]/spark). Pure: validation and the text handed to the
// drafting prompt, and how a draft used them. No I/O.

import type { GeneratedPathway } from "../types";

/** The Spark formats being compared in the Spark Lab (/pilot/spark-lab). */
export const SPARK_FORMATS = ["classic", "starters", "swipe"] as const;
export type SparkFormat = (typeof SPARK_FORMATS)[number];
export const FORMAT_LABELS: Record<SparkFormat, string> = {
  classic: "Current flow",
  starters: "Sentence starters",
  swipe: "Swipe deck",
};
export type FeltLikeMe = "yes" | "kind_of" | "not_really";
export const FELT_LABELS: Record<FeltLikeMe, string> = { yes: "Yes", kind_of: "Kind of", not_really: "Not really" };

/** One leg of a two-format Spark Lab sitting. */
export interface SparkLabMeta {
  /** Shared by both legs of one sitting. */
  labId: string;
  order: 1 | 2;
  seconds: number;
  /** "Did that feel like you?", asked right after this format. */
  feltLikeMe: FeltLikeMe | null;
  /** Second leg only: the other format, and which felt more like them. */
  comparedWith?: SparkFormat;
  preferred?: "this" | "other" | "same";
}

export interface StudentSparks {
  /** Answers to the open questions, spoken or typed, in the student's words. */
  answers: { prompt: string; text: string; via: "voice" | "text" }[];
  /** Interests they tapped; `obsessed` ones they tapped twice. */
  picks: { label: string; obsessed: boolean }[];
  /** "This or that": the side they chose for each pair shown, or `""` where
   *  they said it was genuinely both. "Both" is a real answer, not a skip —
   *  forcing a side on a student who is into many things invents a preference
   *  they never stated. */
  leanings: { a: string; b: string; choice: string }[];
  /** Creators, channels, podcasts or artists they named themselves. Typed, so
   *  only what they chose to say is here — there is no history import. */
  channels: string[];
  /** Media genres they tapped: what actually fills their feed. Weaker evidence
   *  than the rest of a Spark, and the prompt says so. */
  genres: string[];
  /** Which Spark format produced these (absent on sessions before the lab). */
  format?: SparkFormat;
  lab?: SparkLabMeta;
}

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Clean, size-capped copy of what the browser sent, or an error. */
export function validateStudentSparks(raw: unknown): { ok: true; sparks: StudentSparks } | { ok: false; error: string } {
  const r = (raw ?? {}) as Partial<Record<keyof StudentSparks, unknown>>;
  const answers = (Array.isArray(r.answers) ? r.answers : [])
    .map((a) => ({
      prompt: clip((a as { prompt?: unknown }).prompt, 200),
      text: clip((a as { text?: unknown }).text, 1200),
      via: (a as { via?: unknown }).via === "voice" ? ("voice" as const) : ("text" as const),
    }))
    .filter((a) => a.prompt && a.text)
    .slice(0, 8);
  const picks = (Array.isArray(r.picks) ? r.picks : [])
    .map((p) => ({ label: clip((p as { label?: unknown }).label, 60), obsessed: Boolean((p as { obsessed?: unknown }).obsessed) }))
    .filter((p) => p.label)
    .slice(0, 20);
  const leanings = (Array.isArray(r.leanings) ? r.leanings : [])
    .map((l) => {
      const x = l as { a?: unknown; b?: unknown; choice?: unknown };
      return { a: clip(x.a, 60), b: clip(x.b, 60), choice: clip(x.choice, 60) };
    })
    .filter((l) => l.a && l.b && (l.choice === "" || l.choice === l.a || l.choice === l.b))
    .slice(0, 10);
  const channels = [...new Set((Array.isArray(r.channels) ? r.channels : []).map((c) => clip(c, 80)).filter(Boolean))].slice(0, 15);
  const genres = [...new Set((Array.isArray(r.genres) ? r.genres : []).map((g) => clip(g, 60)).filter(Boolean))].slice(0, 20);
  if (!answers.length && !picks.length) {
    return { ok: false, error: "Light up at least one spark: answer a question or tap something you love." };
  }
  const format = (SPARK_FORMATS as readonly unknown[]).includes(r.format) ? (r.format as SparkFormat) : undefined;
  const lab = format ? validateLabMeta(r.lab) : undefined;
  return {
    ok: true,
    sparks: { answers, picks, leanings, channels, genres, ...(format ? { format } : {}), ...(lab ? { lab } : {}) },
  };
}

const FELT = new Set<unknown>(["yes", "kind_of", "not_really"]);
function validateLabMeta(raw: unknown): SparkLabMeta | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const m = raw as Record<string, unknown>;
  const labId = clip(m.labId, 64);
  if (!labId || (m.order !== 1 && m.order !== 2)) return undefined;
  const seconds = Math.max(0, Math.min(7200, Math.round(Number(m.seconds) || 0)));
  const comparedWith = (SPARK_FORMATS as readonly unknown[]).includes(m.comparedWith) ? (m.comparedWith as SparkFormat) : undefined;
  const preferred = m.preferred === "this" || m.preferred === "other" || m.preferred === "same" ? m.preferred : undefined;
  return {
    labId,
    order: m.order,
    seconds,
    feltLikeMe: FELT.has(m.feltLikeMe) ? (m.feltLikeMe as FeltLikeMe) : null,
    ...(comparedWith ? { comparedWith } : {}),
    ...(comparedWith && preferred ? { preferred } : {}),
  };
}

/** The sparks as plain text for the drafting prompt (first-person evidence). */
export function sparksForPrompt(s: StudentSparks): string {
  const lines: string[] = [];
  for (const a of s.answers) lines.push(`- Asked "${a.prompt}", they said: "${a.text}"`);
  const obsessed = s.picks.filter((p) => p.obsessed).map((p) => p.label);
  const liked = s.picks.filter((p) => !p.obsessed).map((p) => p.label);
  if (obsessed.length) lines.push(`- Things they're obsessed with: ${obsessed.join(", ")}`);
  if (liked.length) lines.push(`- Things they enjoy: ${liked.join(", ")}`);
  // A student who tapped a lot and marked nothing an obsession reads, in a bare
  // list, exactly like a student who had little to say — and the draft then
  // picks one item and calls it their passion. Say the shape out loud instead.
  if (s.picks.length >= 8 || (s.picks.length >= 5 && !obsessed.length)) {
    lines.push(
      `- The shape of that: ${s.picks.length} things tapped${
        obsessed.length ? "" : ", none of them marked an obsession"
      }. They are into a lot at once and deep in no single one yet. That is their answer, not a gap in it — do not promote one of these to "their passion".`
    );
  }
  const leaned = s.leanings.filter((l) => l.choice);
  const bothSides = s.leanings.filter((l) => !l.choice);
  if (leaned.length) lines.push(`- How they lean: ${leaned.map((l) => `${l.choice} (over ${l.choice === l.a ? l.b : l.a})`).join("; ")}`);
  if (bothSides.length) {
    lines.push(
      `- They would not pick a side on: ${bothSides
        .map((l) => `${l.a} vs ${l.b}`)
        .join("; ")}. They said both, so treat these as genuinely both — not as a missing answer, and not as a weak version of either side.`
    );
  }
  if (s.channels.length) lines.push(`- Creators, channels and podcasts they named: ${s.channels.join(", ")}`);
  // Genres are the weakest thing in a Spark: a feed is partly chosen and partly
  // fed to them, so "watches gaming videos" is not evidence of wanting a life in
  // games. Useful for language and texture; never as the seed of a pathway.
  if ((s.genres ?? []).length) {
    lines.push(
      `- What fills their feed: ${s.genres.join(
        ", "
      )}. This is what they end up watching, not what they want — use it for texture and the words they'd recognise, and never build a pathway on a genre alone.`
    );
  }
  return lines.join("\n");
}

/** One saved Spark session (a `student_sparks` row). */
export interface SparkSession {
  sparks: StudentSparks;
  created_at: string;
  source: "in_person" | "family_link";
}

/** Every session as one set of sparks for the drafting prompt, newest first,
 *  so a family's at-home answers add to the in-person ones instead of
 *  replacing them. Obsessed anywhere stays obsessed; a pair keeps its newest lean. */
export function mergeSparks(sessions: SparkSession[]): StudentSparks | null {
  if (!sessions.length) return null;
  const answers = new Map<string, StudentSparks["answers"][number]>();
  const picks = new Map<string, StudentSparks["picks"][number]>();
  const leanings = new Map<string, StudentSparks["leanings"][number]>();
  const channels = new Set<string>();
  const genres = new Set<string>();
  for (const { sparks } of sessions) {
    for (const a of sparks.answers) {
      const key = `${a.prompt}\n${a.text}`.toLowerCase();
      if (!answers.has(key)) answers.set(key, a);
    }
    for (const p of sparks.picks) {
      const key = p.label.toLowerCase();
      picks.set(key, { label: picks.get(key)?.label ?? p.label, obsessed: Boolean(picks.get(key)?.obsessed || p.obsessed) });
    }
    for (const l of sparks.leanings) {
      const key = [l.a, l.b].map((x) => x.toLowerCase()).sort().join("|");
      if (!leanings.has(key)) leanings.set(key, l);
    }
    for (const c of sparks.channels) channels.add(c);
    for (const g of sparks.genres ?? []) genres.add(g);
  }
  return {
    answers: [...answers.values()].slice(0, 16),
    picks: [...picks.values()].slice(0, 30),
    leanings: [...leanings.values()].slice(0, 15),
    channels: [...channels].slice(0, 20),
    genres: [...genres].slice(0, 20),
  };
}

// ---- How sparks were used in a draft (for staff, so they can see the line
// from what a student said to the pathway that grew from it).

/** Where a spark shows up in a pathway. */
export interface SparkUse {
  pathway: string;
  where: string;
}

const STOP = new Set(
  "the and for with that this what when where your you they them their have has had are was were been from into about just like really very most more some much many things thing want love kind make made being doing also than then there which would could should because every always never maybe".split(" ")
);
function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .map((w) => w.replace(/(ing|ers|er|es|s)$/, ""))
      .filter((w) => w.length >= 3 && !STOP.has(w))
  );
}
/** A pathway's reference to a spark (its hook, or a milestone's "spark")
 *  matches a student's words when most of the reference's words are theirs. */
function refMatches(ref: string, theirs: Set<string>): boolean {
  const r = words(ref);
  if (r.size === 0 || theirs.size === 0) return false;
  let shared = 0;
  for (const w of r) if (theirs.has(w)) shared++;
  const smaller = Math.min(r.size, theirs.size);
  return shared >= Math.min(2, smaller) && shared / smaller >= 0.6;
}

/** For one spark (an answer's text, an interest, a channel), every place in
 *  the draft's pathways that grew from it. Explicit references only (hook,
 *  milestone spark), plus a short interest or channel named outright. */
export function sparkUses(spark: string, pathways: GeneratedPathway[], opts: { short?: boolean } = {}): SparkUse[] {
  const theirs = words(spark);
  const uses: SparkUse[] = [];
  for (const p of pathways) {
    if (p.hook && refMatches(p.hook, theirs)) uses.push({ pathway: p.name, where: "grows from it" });
    for (const m of p.milestones ?? []) {
      if (m.spark && refMatches(m.spark, theirs)) uses.push({ pathway: p.name, where: `${m.when}: ${m.title}` });
    }
    if (opts.short && !uses.some((u) => u.pathway === p.name)) {
      const text = [p.name, p.firstSemester, p.stretchChallenge, p.glimpse ?? "", ...(p.milestones ?? []).map((m) => `${m.title} ${m.detail}`)]
        .join(" ")
        .toLowerCase();
      if (spark.trim().length >= 3 && text.includes(spark.trim().toLowerCase())) uses.push({ pathway: p.name, where: "named in it" });
    }
  }
  return uses;
}
