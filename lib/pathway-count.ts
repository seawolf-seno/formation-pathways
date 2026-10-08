// The pathway prompts are written once, for any count (lib/types.ts
// PATHWAY_PLAN: 2 for an inquiry, 3 for an application, 6 for a student).
// This fills in the numbers and the rules that only make sense at a size.

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight"];
const word = (n: number) => WORDS[n] ?? String(n);

/** At most this many "why now"s per draft: one for two, two for three, three for six. */
export function whyNowMax(count: number): number {
  return Math.max(1, Math.min(3, count - 1));
}

/** Room for the pathways, their journeys and glimpses (9000 for six). */
export function pathwayMaxTokens(count: number): number {
  return 1300 * count + 1200;
}

export function renderPathwayCount(text: string, count: number): string {
  const combo =
    count >= 4
      ? "At least two pathways must come from a combination of two hooks, the pathway no one else in their grade would be offered."
      : count === 3
        ? "At least one pathway must come from a combination of two hooks, the pathway no one else in their grade would be offered."
        : "When the evidence has two hooks, one pathway should combine them: the pathway no one else in their grade would be offered.";
  const field =
    count >= 4
      ? 'At most two pathways may share a broad field (two "science" pathways must still be clearly different roads).'
      : "No two pathways may share a broad field: with so few, each must open a clearly different road.";
  const values: Record<string, string> = {
    N: word(count),
    N_UPPER: word(count).toUpperCase(),
    COMBO_RULE: combo,
    FIELD_RULE: field,
    INTEREST_MAX: word(count >= 4 ? 2 : 1),
    WHY_NOW_MAX: word(whyNowMax(count)),
    WHY_NOW_MAX_UPPER: word(whyNowMax(count)).toUpperCase(),
  };
  return text.replace(/\{\{([A-Z_]+)\}\}/g, (m, key: string) => values[key] ?? m);
}
