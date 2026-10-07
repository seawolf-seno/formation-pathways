// Mechanical clean-up of AI-drafted pathway prose: the few contrast and
// emphasis tics the prompt bans (prompts/unique-pathways.txt, STYLE) but the
// model still slips in. Only rewrites that keep the meaning: "not just X" as a
// trailing or bracketed clause is dropped, "not just X but Y" becomes "X and
// Y", "exactly the/what" loses "exactly". Applied to fresh drafts only, never
// to text a staff member wrote. Pure; tested in tests/draft-style.test.mjs.
import type { GeneratedPathway } from "./types";

export function tidyPhrasing(text: string): string {
  return (
    text
      // First, so the rules below never cut a sentence that has a "but".
      // "not just how it works but why …" → "how it works and why …"
      .replace(/\bnot just (.{1,80}?),? but (also )?/gi, "$1 and ")
      // "… defend your reading — not just hold it — and …" → "… defend your reading and …"
      .replace(/\s+[—–]\s*not just [^—–.;]+?\s*[—–]\s*/gi, " ")
      // "… audible, not just visible." → "… audible."
      .replace(/,?\s*[—–]?\s*not just [^.;!?,—–]+(?=[.;!?])/gi, "")
      .replace(/\bexactly (the|what)\b/gi, "$1")
      .replace(/\s{2,}/g, " ")
      .replace(/\s+([.,;!?])/g, "$1")
      .trim()
  );
}

/** A fresh draft's prose fields, tidied. Names and hooks stay as written. */
export function tidyDraftPathway(p: GeneratedPathway): GeneratedPathway {
  const t = (v: string | undefined) => (v === undefined ? v : tidyPhrasing(v));
  return {
    ...p,
    firstSemester: tidyPhrasing(p.firstSemester),
    stretchChallenge: tidyPhrasing(p.stretchChallenge),
    fourYearHorizon: p.fourYearHorizon.map(tidyPhrasing),
    ...(p.glimpse !== undefined ? { glimpse: t(p.glimpse) } : {}),
    ...(p.whyNow !== undefined ? { whyNow: t(p.whyNow) } : {}),
    ...(p.milestones ? { milestones: p.milestones.map((m) => ({ ...m, detail: tidyPhrasing(m.detail) })) } : {}),
  };
}
