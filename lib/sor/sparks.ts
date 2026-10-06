// What a student says lights them up, captured in the Spark experience
// (/pathway/[personId]/spark). Pure: validation and the text handed to the
// drafting prompt, and how a draft used them. No I/O.

import type { GeneratedPathway } from "../types";

export interface StudentSparks {
  /** Answers to the open questions, spoken or typed, in the student's words. */
  answers: { prompt: string; text: string; via: "voice" | "text" }[];
  /** Interests they tapped; `obsessed` ones they tapped twice. */
  picks: { label: string; obsessed: boolean }[];
  /** "This or that": the side they chose for each pair shown. */
  leanings: { a: string; b: string; choice: string }[];
  /** YouTube channels they chose to share from their own watch history (read
   *  on their device; only these names leave it). */
  channels: string[];
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
    .filter((l) => l.a && l.b && (l.choice === l.a || l.choice === l.b))
    .slice(0, 10);
  const channels = [...new Set((Array.isArray(r.channels) ? r.channels : []).map((c) => clip(c, 80)).filter(Boolean))].slice(0, 15);
  if (!answers.length && !picks.length) {
    return { ok: false, error: "Light up at least one spark: answer a question or tap something you love." };
  }
  return { ok: true, sparks: { answers, picks, leanings, channels } };
}

/** The sparks as plain text for the drafting prompt (first-person evidence). */
export function sparksForPrompt(s: StudentSparks): string {
  const lines: string[] = [];
  for (const a of s.answers) lines.push(`- Asked "${a.prompt}", they said: "${a.text}"`);
  const obsessed = s.picks.filter((p) => p.obsessed).map((p) => p.label);
  const liked = s.picks.filter((p) => !p.obsessed).map((p) => p.label);
  if (obsessed.length) lines.push(`- Things they're obsessed with: ${obsessed.join(", ")}`);
  if (liked.length) lines.push(`- Things they enjoy: ${liked.join(", ")}`);
  if (s.leanings.length) lines.push(`- How they lean: ${s.leanings.map((l) => `${l.choice} (over ${l.choice === l.a ? l.b : l.a})`).join("; ")}`);
  if (s.channels.length) lines.push(`- YouTube channels they chose to share: ${s.channels.join(", ")}`);
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
  }
  return {
    answers: [...answers.values()].slice(0, 16),
    picks: [...picks.values()].slice(0, 30),
    leanings: [...leanings.values()].slice(0, 15),
    channels: [...channels].slice(0, 20),
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
