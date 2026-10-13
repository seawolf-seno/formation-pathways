// Teacher-shared next steps (Fizzy #37): what goes to Claude, and how its
// answer is checked. Pure; tested in tests/mastery.test.mjs.
//
// What leaves: the course name, the class's finished unit, a handful of
// candidate standards with their level IN WORDS, the newest evidence titles
// and sources (no scores, no teacher notes, no names), and the course's own
// links, numbered. What comes back is kept only if it points at one of those
// candidates and one of those links. It is always a draft the teacher edits
// and shares (product principle 1).

import { levelLabel, type MasteryConfig, type Resource, type Video } from "./config.ts";
import { evidenceLevel, nextSteps, type EvidenceLike, type StandardStatus } from "./rules.ts";

export interface StepLink {
  ref: string;
  kind: string;
  label: string;
  url: string;
}

export interface NextStepsInput {
  course: string;
  finishedThrough: string | null;
  candidates: {
    code: string;
    title: string;
    unit: string;
    coveredInClass: boolean;
    level: string;
    recent: { source: string; title: string; when: string; level: string }[];
    links: { ref: string; kind: string; label: string }[];
  }[];
  solid: string[];
}

export interface DraftStep {
  standard: string;
  text: string;
  links: { label: string; url: string }[];
}

const videoUrl = (v: Video) => `https://www.youtube.com/watch?v=${v.id}`;

/** The candidates (the rule-based next steps, a few more than are shown)
 *  and their links, numbered L1, L2… across the whole payload. */
export function nextStepsInput(
  config: MasteryConfig,
  courseTitle: string,
  statuses: Map<string, StandardStatus>,
  evidence: (EvidenceLike & { title: string })[],
  finishedThrough: number | null,
): { input: NextStepsInput; links: Map<string, StepLink> } {
  const links = new Map<string, StepLink>();
  const add = (kind: string, label: string, url: string) => {
    const ref = `L${links.size + 1}`;
    links.set(ref, { ref, kind, label, url });
    return { ref, kind, label };
  };
  const steps = nextSteps(config, statuses, evidence, 5, finishedThrough);
  const candidates = steps.map((s) => ({
    code: s.standard.code,
    title: s.standard.title,
    unit: s.groupTitle,
    coveredInClass: s.covered,
    level: s.level ? levelLabel(config, s.level) : "not started",
    recent: evidence
      .filter((e) => e.standard_code === s.standard.code)
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
      .slice(0, 3)
      .map((e) => ({ source: e.source, title: e.title.slice(0, 120), when: e.occurred_at.slice(0, 10), level: levelLabel(config, evidenceLevel(e, config.rules)) })),
    links: [
      ...s.videos.slice(0, 3).map((v) => add("video", `${v.title} (${v.channel})`, videoUrl(v))),
      ...s.resources.slice(0, 4).map((r: Resource) => add(r.kind, r.label, r.url)),
    ],
  }));
  const unit = finishedThrough == null ? null : config.groups.find((g) => g.unitNumber === finishedThrough)?.title ?? null;
  const solid = config.groups
    .flatMap((g) => g.standards)
    .filter((s) => ["proficient", "extending"].includes(statuses.get(s.code)?.level ?? ""))
    .map((s) => s.title)
    .slice(0, 10);
  return { input: { course: courseTitle, finishedThrough: unit, candidates, solid }, links };
}

/** Claude's answer → at most three steps, each tied to a real candidate and
 *  real links. Anything else is dropped. */
export function parseDraftSteps(raw: unknown, input: NextStepsInput, links: Map<string, StepLink>): DraftStep[] {
  const steps = raw && typeof raw === "object" && Array.isArray((raw as { steps?: unknown }).steps) ? (raw as { steps: unknown[] }).steps : [];
  const out: DraftStep[] = [];
  for (const s of steps) {
    if (out.length >= 3 || !s || typeof s !== "object") continue;
    const { standard, text, links: refs } = s as { standard?: unknown; text?: unknown; links?: unknown };
    const candidate = input.candidates.find((c) => c.code === standard);
    if (!candidate || typeof text !== "string" || !text.trim() || out.some((o) => o.standard === candidate.code)) continue;
    const allowed = new Set(candidate.links.map((l) => l.ref));
    const picked = (Array.isArray(refs) ? refs : [])
      .filter((r): r is string => typeof r === "string" && allowed.has(r))
      .slice(0, 2)
      .map((r) => links.get(r)!)
      .map(({ label, url }) => ({ label, url }));
    out.push({ standard: candidate.code, text: text.trim().replace(/\s+/g, " ").slice(0, 600), links: picked });
  }
  return out;
}

/** Without AI (no key, no consent, or a failure): the rule-based steps in
 *  plain words, for the teacher to edit before sharing. */
export function fallbackDraftSteps(input: NextStepsInput, links: Map<string, StepLink>): DraftStep[] {
  return input.candidates.slice(0, 3).map((c) => {
    const ready = c.recent[0] && ["Proficient", "Extending"].includes(c.recent[0].level) && !["Proficient", "Extending"].includes(c.level);
    const first = c.links.slice(0, 2).map((l) => links.get(l.ref)!);
    return {
      standard: c.code,
      text: ready
        ? `Your newest work on ${c.title.toLowerCase()} already shows it. Ask for an oral exam to confirm it.`
        : `Work on ${c.title.toLowerCase()} next${c.coveredInClass ? ", since we've covered it in class" : ""}. Start with the first link, then try a few practice problems.`,
      links: first.map(({ label, url }) => ({ label, url })),
    };
  });
}

/** A saved row's steps, checked on read (it's teacher-edited jsonb). */
export function readSavedSteps(value: unknown): DraftStep[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((s) => {
    if (!s || typeof s !== "object") return [];
    const { standard, text, links } = s as Record<string, unknown>;
    if (typeof standard !== "string" || typeof text !== "string") return [];
    const ls = Array.isArray(links)
      ? links.flatMap((l) => {
          const { label, url } = (l ?? {}) as Record<string, unknown>;
          return typeof label === "string" && typeof url === "string" && url.startsWith("https://") ? [{ label, url }] : [];
        })
      : [];
    return [{ standard, text: text.slice(0, 600), links: ls.slice(0, 3) }];
  });
}
