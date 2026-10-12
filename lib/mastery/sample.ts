// Fictional evidence for the sample AP Physics 1 class (fictional sample
// students only; the database refuses a real student in a sample course).
// Deterministic: the same students always get the same story, so a demo is
// repeatable. The class is in Unit 3 in mid-October. Pure; tested in
// tests/mastery.test.mjs.

import type { EvidenceSource, Level, MasteryConfig } from "./config.ts";
import type { EvidenceDraft } from "./exports.ts";

/** Small seeded generator (mulberry32), so samples are repeatable. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const day = (base: Date, offset: number) => new Date(base.getTime() - offset * 86_400_000).toISOString();

/** Each sample student's strength (0–1); later ones vary around the class. */
const STRENGTH = [0.92, 0.7, 0.55, 0.82, 0.4, 0.66];

export function sampleEvidence(config: MasteryConfig, people: string[], now: Date): EvidenceDraft[] {
  const out: EvidenceDraft[] = [];
  const units = config.groups.filter((g) => g.unitNumber !== null && g.unitNumber <= 3);
  people.forEach((person, pi) => {
    const r = rng(pi * 7919 + 17);
    const strength = STRENGTH[pi % STRENGTH.length];
    // Growth: later units start a little lower, then climb.
    const pct = (bump: number) => Math.max(20, Math.min(100, Math.round((strength + bump + (r() - 0.5) * 0.3) * 100)));
    const add = (code: string, source: EvidenceSource, title: string, offset: number, score: number | null, max: number | null, level: Level | null) =>
      out.push({
        person_id: person,
        standard_code: code,
        source,
        title,
        score,
        max_score: max,
        level,
        occurred_at: day(now, offset),
        external_key: `sample:${source}:${title}:${code}`.toLowerCase(),
      });
    units.forEach((unit, ui) => {
      const start = 50 - ui * 16; // days ago this unit started
      const codes = unit.standards.map((s) => s.code);
      // Canvas quizzes on pairs of topics.
      for (let i = 0; i < codes.length; i += 2) {
        const pair = codes.slice(i, i + 2);
        const title = `Unit ${unit.unitNumber} quiz [${pair.join(", ")}]`;
        const p = pct(-0.08 + i * 0.01);
        for (const c of pair) add(c, "canvas", title, start - 3 - i, Math.round(p / 10), 10, null);
      }
      // Khan Academy practice: mastery words on the first few topics.
      const words: Level[] = ["beginning", "developing", "proficient", "extending"];
      codes.slice(0, 3).forEach((c, i) => {
        const w = words[Math.min(3, Math.floor((strength + r() * 0.35) * 3.2))];
        add(c, "khan", `Khan Academy practice: ${unit.standards[i].title}`, start - 5 - i, null, null, w);
      });
      // AP Classroom progress check on the whole unit, once the unit is done.
      if (ui < units.length - 1) {
        const p = pct(0.04);
        for (const c of codes) add(c, "ap_classroom", `Unit ${unit.unitNumber} progress check (MCQ)`, start - 14, p, 100, null);
      }
    });
    // A couple of oral exams, the teacher's own judgment.
    if (pi % 2 === 0) add("2.5", "oral", "Oral exam: Newton's second law", 8, null, null, strength > 0.8 ? "extending" : "proficient");
    if (pi % 3 === 1) add("1.3", "oral", "Oral exam: representing motion", 20, null, null, "proficient");
    // Science practices across the quizzes.
    add("SP1", "observation", "Lab: free-body diagrams for the cart lab", 18, null, null, strength > 0.75 ? "proficient" : "developing");
    add("SP2", "canvas", "Lab report: energy bar charts [SP2]", 6, Math.round(pct(0) / 10), 10, null);
  });
  return out;
}

/** "Sync Canvas" on a sample course: a new, fictional quiz grade for each
 *  student, so the demo shows the hub reacting. Keyed by date, so each run
 *  adds one quiz. */
export function sampleCanvasRun(people: string[], now: Date, run: number): EvidenceDraft[] {
  const topics = [["3.3", "3.4"], ["3.5", "SP2"], ["3.1", "3.2"]][run % 3];
  const title = `Unit 3 quiz [${topics.join(", ")}] (${now.toISOString().slice(0, 10)})`;
  return people.flatMap((person, pi) => {
    const r = rng(pi * 31 + run * 977 + 5);
    const score = Math.max(3, Math.min(10, Math.round((STRENGTH[pi % STRENGTH.length] + (r() - 0.4) * 0.3) * 10)));
    return topics.map((code) => ({
      person_id: person,
      standard_code: code,
      source: "canvas" as const,
      title,
      score,
      max_score: 10,
      level: null,
      occurred_at: now.toISOString(),
      external_key: `sample:canvas:${title}:${code}`.toLowerCase(),
    }));
  });
}
