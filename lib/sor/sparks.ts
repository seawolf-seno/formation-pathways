// What a student says lights them up, captured in the Spark experience
// (/pathway/[personId]/spark). Pure: validation and the text handed to the
// drafting prompt. No I/O.

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
