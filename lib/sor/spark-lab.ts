// The Spark Lab: which Spark format helps teens show us who they are, and
// which one grows the most distinctive pathways. Each student does two
// formats back to back (rotating through every ordered pair so neither
// format always goes first), says after each whether it felt like them, then
// which felt more like them. Pure: no I/O, tested in tests/spark-lab.test.mjs.
//
// Counts and medians only. These numbers judge formats, never students.
import { SPARK_FORMATS, sparkUses, type FeltLikeMe, type SparkFormat, type StudentSparks } from "./sparks.ts";
import type { GeneratedPathway } from "../types";

/** Every ordered pair of different formats, in a rotation that balances which goes first. */
export const LAB_PAIRS: [SparkFormat, SparkFormat][] = [
  ["starters", "swipe"],
  ["swipe", "classic"],
  ["classic", "starters"],
  ["swipe", "starters"],
  ["classic", "swipe"],
  ["starters", "classic"],
];

/** The pair for the nth lab sitting overall. */
export function pairFor(sittings: number): [SparkFormat, SparkFormat] {
  return LAB_PAIRS[((sittings % LAB_PAIRS.length) + LAB_PAIRS.length) % LAB_PAIRS.length];
}

/** "starters,swipe" from a URL, if it names two different known formats. */
export function parsePair(value: string | undefined): [SparkFormat, SparkFormat] | null {
  const parts = (value ?? "").split(",").map((p) => p.trim());
  const known = (p: string): p is SparkFormat => (SPARK_FORMATS as readonly string[]).includes(p);
  return parts.length === 2 && known(parts[0]) && known(parts[1]) && parts[0] !== parts[1] ? [parts[0], parts[1]] : null;
}

/**
 * Specific details in a teen's words: names and proper nouns (capitalised
 * words that don't start a sentence, other than "I"), and numbers. "I like
 * music" scores 0; "I rebuilt Dad's 1998 Trek at Bike Kitchen" scores 5.
 */
export function specificDetails(text: string): number {
  let count = 0;
  const sentences = text.split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    const tokens = sentence.split(/\s+/).filter(Boolean);
    tokens.forEach((raw, i) => {
      const t = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}']+$/gu, "");
      if (!t) return;
      if (/^\d/.test(t)) count++;
      else if (i > 0 && /^\p{Lu}/u.test(t) && t !== "I" && !/^I'/.test(t)) count++;
    });
  }
  return count;
}

/** Sparks in a session that could seed a pathway: answers, interests, channels. */
function sparkTexts(s: StudentSparks): { text: string; short: boolean }[] {
  return [
    ...s.answers.map((a) => ({ text: a.text, short: false })),
    ...s.picks.map((p) => ({ text: p.label, short: true })),
    ...s.channels.map((c) => ({ text: c, short: true })),
  ];
}

export interface LabSession {
  person_id: string;
  created_at: string;
  sparks: StudentSparks;
}
export interface LabDraft {
  person_id: string;
  created_at: string;
  pathways: GeneratedPathway[];
}

export interface FormatSummary {
  format: SparkFormat;
  sessions: number;
  medianSeconds: number | null;
  /** Per session, on average. */
  sparks: number;
  wordsPerAnswer: number;
  specificDetails: number;
  felt: Record<FeltLikeMe, number>;
  /** Head to head, from the second leg's "which felt more like you?". */
  preferred: number;
  notPreferred: number;
  same: number;
  /** Sessions with a pathway draft made after them, and the average share of
   *  their sparks that ended up in that draft's pathways. */
  drafted: number;
  usedShare: number | null;
  /** Distinct pathways (of the draft) that grew from this session, on average. */
  pathwaysShaped: number | null;
  /** The media step is identical in all three formats, so these two judge the
   *  genre question itself rather than the format: genres tapped per session,
   *  and how often one of them turns up in a later draft. Deliberately apart
   *  from `usedShare`, which counts only answers, interests and creators — a
   *  genre is the weakest thing in a Spark and the prompt is told never to
   *  build a pathway on one, so folding genres into the main number would
   *  quietly reward exactly the inference we tell the draft not to make.
   *  Kept so that "did asking about their feed do anything?" has an answer. */
  genres: number;
  genresUsed: number | null;
  genresDrafted: number;
  /** The skills card is shared too, and kept out of `usedShare` for the same
   *  reason: a shared card must not flatter whichever format it arrived with.
   *  These are shares of sessions, not counts, because both questions are
   *  skippable and the gap between the two is the number worth watching —
   *  "could teach" is answered with pride and "working on" takes nerve, so if
   *  the second runs far behind the first, the card doesn't feel safe enough
   *  to be honest in and the wording needs changing, not the student. */
  saidCanTeach: number;
  saidGrowing: number;
  skillsUsed: number | null;
  skillsDrafted: number;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Per-format comparison across every lab session. */
export function summarizeLab(sessions: LabSession[], drafts: LabDraft[]): FormatSummary[] {
  const lab = sessions.filter((s) => s.sparks.format && s.sparks.lab);
  // Head-to-head: the second leg says which felt more like them; credit both sides.
  const result = new Map<SparkFormat, { preferred: number; notPreferred: number; same: number }>(
    SPARK_FORMATS.map((f) => [f, { preferred: 0, notPreferred: 0, same: 0 }])
  );
  for (const s of lab) {
    const { comparedWith, preferred } = s.sparks.lab!;
    if (!comparedWith || !preferred) continue;
    const self = result.get(s.sparks.format!)!;
    const other = result.get(comparedWith)!;
    if (preferred === "same") {
      self.same++;
      other.same++;
    } else if (preferred === "this") {
      self.preferred++;
      other.notPreferred++;
    } else {
      self.notPreferred++;
      other.preferred++;
    }
  }

  return SPARK_FORMATS.map((format) => {
    const mine = lab.filter((s) => s.sparks.format === format);
    const answers = mine.flatMap((s) => s.sparks.answers);
    const felt: Record<FeltLikeMe, number> = { yes: 0, kind_of: 0, not_really: 0 };
    for (const s of mine) if (s.sparks.lab!.feltLikeMe) felt[s.sparks.lab!.feltLikeMe]++;

    const shares: number[] = [];
    const shaped: number[] = [];
    const genreShares: number[] = [];
    const skillShares: number[] = [];
    for (const s of mine) {
      // The newest draft for this student made after this session.
      const draft = drafts
        .filter((d) => d.person_id === s.person_id && d.created_at > s.created_at)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      if (!draft) continue;
      // Genres are counted on their own, so a session of nothing but tapped
      // genres still answers the genre question even though it has no sparks.
      const genres = s.sparks.genres ?? [];
      if (genres.length) {
        genreShares.push(
          genres.filter((g) => sparkUses(g, draft.pathways, { short: true }).length > 0).length / genres.length
        );
      }
      // Counted before the guard below, like genres: a session where the only
      // thing said was a skill still answers the skills question.
      const skills = [...(s.sparks.canTeach ?? []), ...(s.sparks.growing ?? [])];
      if (skills.length) {
        skillShares.push(
          skills.filter((k) => sparkUses(k, draft.pathways, { short: true }).length > 0).length / skills.length
        );
      }
      const texts = sparkTexts(s.sparks);
      if (!texts.length) continue;
      const uses = texts.map((t) => sparkUses(t.text, draft.pathways, { short: t.short }));
      shares.push(uses.filter((u) => u.length > 0).length / texts.length);
      shaped.push(new Set(uses.flat().map((u) => u.pathway)).size);
    }

    return {
      format,
      sessions: mine.length,
      medianSeconds: median(mine.map((s) => s.sparks.lab!.seconds).filter((x) => x > 0)),
      sparks: mean(mine.map((s) => sparkTexts(s.sparks).length)),
      wordsPerAnswer: mean(answers.map((a) => a.text.split(/\s+/).filter(Boolean).length)),
      specificDetails: mean(mine.map((s) => s.sparks.answers.reduce((n, a) => n + specificDetails(a.text), 0))),
      felt,
      ...result.get(format)!,
      drafted: shares.length,
      usedShare: shares.length ? mean(shares) : null,
      pathwaysShaped: shaped.length ? mean(shaped) : null,
      genres: mean(mine.map((s) => (s.sparks.genres ?? []).length)),
      genresDrafted: genreShares.length,
      genresUsed: genreShares.length ? mean(genreShares) : null,
      saidCanTeach: mean(mine.map((s) => ((s.sparks.canTeach ?? []).length ? 1 : 0))),
      saidGrowing: mean(mine.map((s) => ((s.sparks.growing ?? []).length ? 1 : 0))),
      skillsDrafted: skillShares.length,
      skillsUsed: skillShares.length ? mean(skillShares) : null,
    };
  });
}
