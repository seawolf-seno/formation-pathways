// Pure transcript logic for the browser's speech recognition, shared by the
// phone capture (/capture) and the demo's capture modal. No DOM, so it's
// testable in node (tests/dictation.test.mjs).
//
// Why this exists: desktop Chrome sends each spoken phrase once, as its own
// result. Chrome on Android (Pixel and others) in continuous mode re-sends
// earlier results and makes each final result the WHOLE utterance so far
// ("Maya", "Maya stayed", "Maya stayed after class"). Appending every final
// result printed the text two or three times. So the transcript is always
// rebuilt from the full result list, folding a result into the previous one
// when it merely extends or repeats it.

export interface ResultLike {
  isFinal: boolean;
  0: { transcript: string };
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Add a phrase, unless it repeats the last one; replace the last one if
 *  this phrase just extends it (Android's cumulative results). */
function pushPhrase(list: string[], phrase: string): void {
  const last = list[list.length - 1];
  if (last !== undefined) {
    const a = norm(last);
    const b = norm(phrase);
    if (b === a || a.endsWith(b)) return;
    if (b.startsWith(a)) {
      list[list.length - 1] = phrase;
      return;
    }
  }
  list.push(phrase);
}

/** Final text and still-changing (interim) text from one recognition session's result list. */
export function readResults(results: ArrayLike<ResultLike>): { final: string; interim: string } {
  const finals: string[] = [];
  const interims: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const t = results[i]?.[0]?.transcript?.trim();
    if (!t) continue;
    pushPhrase(results[i].isFinal ? finals : interims, t);
  }
  const final = finals.join(" ");
  let interim = interims.join(" ");
  // Android's interim result can repeat everything already final.
  if (final && norm(interim).startsWith(norm(final))) {
    interim = interim.slice(Math.min(interim.length, final.length)).trim();
  }
  return { final, interim };
}

/** Join text pieces with single spaces. */
export function joinText(...parts: string[]): string {
  return parts.map((p) => p.trim()).filter(Boolean).join(" ");
}

/** Android Chrome's continuous mode is the unreliable one: there, listen one
 *  phrase at a time and restart until the user taps Done. */
export function prefersShortSessions(userAgent: string): boolean {
  return /Android/i.test(userAgent);
}
