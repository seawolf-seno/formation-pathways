// Pure logic for the "Spark" interest survey: a fast, interactive way to learn
// about an applicant before essays, the parent questionnaire or an interview
// exist. It is a supplement to those, never a replacement — see
// docs/interest-survey.md. No I/O; the fixed vocabulary is loaded by the
// caller (lib/actions.ts / lib/queries.ts) from the editable /prompts files
// and passed in here, so this stays testable without the filesystem.

export interface SparkOption {
  label: string;
  emoji: string;
}

export interface SparkChoicePair {
  a: string;
  b: string;
}

export interface SparkResponse {
  /** Labels from the interests vocabulary the applicant tapped. At least
   *  MIN_INTERESTS; the upper bound is loose on purpose, because how many a
   *  student taps is itself the signal for a student who is into many things. */
  interests: string[];
  /** One entry per choice pair, in the pairs' order. The picked label, or
   *  `null` where they said it was genuinely both / depends. Kept full-length
   *  and positional so an entry always maps to its pair. */
  choices: (string | null)[];
  /** Optional, short, free text. Never required. */
  note: string | null;
}

export const MIN_INTERESTS = 3;
// Was 6 of a 14-item list, which forced a genuine generalist to drop real
// answers until they looked like a student who likes exactly six things. The
// cap is only here so that tapping every single one — which would carry no
// signal at all — is still out of reach.
export const MAX_INTERESTS = 10;
export const MAX_NOTE_LENGTH = 280;

export function parseVocabLines(raw: string): SparkOption[] {
  return raw
    .split("\n")
    .map((l) => l.trim())
    // "#" lines are notes for faculty editing the file.
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const [label, emoji] = l.split("|").map((s) => s.trim());
      return { label, emoji: emoji ?? "" };
    })
    .filter((o) => o.label.length > 0);
}

export function parseChoiceLines(raw: string): SparkChoicePair[] {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [a, b] = l.split("|").map((s) => s.trim());
      return { a, b };
    })
    .filter((p) => p.a && p.b);
}

/**
 * Validate a submitted response against the current vocabulary. Throws with a
 * short, family-facing message on anything malformed, unknown, or oversized —
 * this is the one public write in the app, so it never trusts the client.
 */
export function validateSparkResponse(
  raw: unknown,
  interestOptions: SparkOption[],
  choicePairs: SparkChoicePair[]
): SparkResponse {
  if (!raw || typeof raw !== "object") throw new Error("Something went wrong. Please try again.");
  const r = raw as Record<string, unknown>;

  const validLabels = new Set(interestOptions.map((o) => o.label));
  const interests = Array.isArray(r.interests)
    ? r.interests.filter((v): v is string => typeof v === "string" && validLabels.has(v))
    : [];
  const uniqueInterests = [...new Set(interests)];
  if (uniqueInterests.length < MIN_INTERESTS) {
    throw new Error(`Pick at least ${MIN_INTERESTS} — even a guess is fine.`);
  }
  if (uniqueInterests.length > MAX_INTERESTS) {
    throw new Error(`Pick up to ${MAX_INTERESTS} — the ones that stand out most.`);
  }

  const rawChoices = Array.isArray(r.choices) ? r.choices : [];
  if (rawChoices.length !== choicePairs.length) {
    throw new Error("Please answer every either/or.");
  }
  const choices = rawChoices.map((v, i) => {
    const pair = choicePairs[i];
    // null/"" is a real answer: "both" or "depends". Only an unknown label is bad.
    if (v === null || v === undefined || v === "") return null;
    if (v !== pair.a && v !== pair.b) {
      throw new Error("Please answer every either/or.");
    }
    return v as string;
  });

  const noteRaw = typeof r.note === "string" ? r.note.trim() : "";
  const note = noteRaw.length > 0 ? noteRaw.slice(0, MAX_NOTE_LENGTH) : null;

  return { interests: uniqueInterests, choices, note };
}

/**
 * A short, plain-language context block for the Pathways generator — never
 * essay text, only self-described interests. Kept separate from
 * `ApplicantAnswer` so it is always clearly labeled to the model as
 * self-reported and preliminary, not an essay.
 */
export function formatSparkContext(response: SparkResponse, choicePairs: SparkChoicePair[]): string {
  const lines = [
    `Self-described interests (tapped from a list, before essays or an interview): ${response.interests.join(", ")}.`,
  ];
  // A pair they refused to split is its own signal — especially for a student
  // who is into many things — so it is reported, never silently dropped and
  // never reported as a preference they did not state.
  const leaned: string[] = [];
  const refused: string[] = [];
  response.choices.forEach((picked, i) => {
    const pair = choicePairs[i];
    if (!pair) return;
    if (picked === null) refused.push(`"${pair.a}" vs "${pair.b}"`);
    else leaned.push(`"${picked}" over "${picked === pair.a ? pair.b : pair.a}"`);
  });
  if (leaned.length > 0) {
    lines.push(`When asked to choose, they leaned toward: ${leaned.join("; ")}.`);
  }
  if (refused.length > 0) {
    lines.push(
      `They would not pick a side on: ${refused.join("; ")}. They said both, so treat these as genuinely both — not as a missing answer, and not as a weak version of either side.`
    );
  }
  // State the shape of the answer, not just its contents. A student who tapped
  // nine things and would not split most of the pairs has told us something
  // real, but the model only ever sees a comma-separated list, and a list reads
  // the same whether it was the whole point or an afterthought.
  if (response.interests.length >= MIN_INTERESTS * 2 || refused.length > leaned.length) {
    lines.push(
      `They were asked for at least ${MIN_INTERESTS} interests and gave ${response.interests.length}, and would not pick a side on ${refused.length} of ${response.choices.length} either/ors. Being into many things is their answer, not a gap in it.`
    );
  }
  if (response.note) {
    lines.push(`In their own words: "${response.note}"`);
  }
  return lines.join("\n");
}
