import type { Person } from "./types";

/**
 * Finds which pilot participant a spoken observation is about ("Iris
 * stayed after class to…"). Runs locally against the roster the staff member
 * can already see — the roster is never sent to Claude. Tolerates speech-to-
 * text misspellings ("Okonko" for "Okonkwo") with edit distance. The staff
 * member always confirms the match before anything is saved.
 */
export interface NameMatch {
  person: Person;
  score: number;
}

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z\s-]/g, " ");

function distance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

const COMMON = new Set(["the", "then", "they", "them", "there", "this", "that", "with", "was", "and", "she", "her", "his", "him", "class", "today"]);

function tokenScore(name: string, words: string[]): number {
  const n = norm(name).trim();
  if (!n) return 0;
  const parts = n.split(/[\s-]+/).filter(Boolean);
  let best = 0;
  for (const part of parts) {
    for (const w of words) {
      if (w === part) best = Math.max(best, 1);
      else if (
        part.length >= 5 &&
        !COMMON.has(w) &&
        distance(w, part) <= (part.length >= 7 ? 2 : 1)
      ) {
        best = Math.max(best, 0.7);
      }
    }
  }
  return best;
}

export function matchPeople(transcript: string, roster: Person[]): NameMatch[] {
  // Names are almost always said first; weight the opening words.
  const words = norm(transcript).split(/\s+/).filter(Boolean);
  const opening = words.slice(0, 8);
  return roster
    .map((person) => {
      const first = Math.max(
        tokenScore(person.first_name, words),
        person.preferred_name ? tokenScore(person.preferred_name, words) : 0
      );
      const last = tokenScore(person.last_name, words);
      const early = Math.max(
        tokenScore(person.first_name, opening),
        person.preferred_name ? tokenScore(person.preferred_name, opening) : 0,
        tokenScore(person.last_name, opening)
      );
      return { person, score: first * 2 + last * 1.5 + early * 0.5 };
    })
    .filter((m) => m.score >= 1.4)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}
