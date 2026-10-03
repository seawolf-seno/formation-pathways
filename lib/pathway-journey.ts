// Pure pathway-journey logic, shared by the generators (lib/claude.ts), the
// staff editor (lib/sor/actions.ts) and the journey visual
// (components/PathwayJourney.tsx). No I/O, so it's tested in node
// (tests/pathway-journey.test.mjs).
//
// A pathway can carry optional `milestones` (about one per year) and a
// `glimpse` (a short second-person vignette). Older drafts, the seeded demo
// and the persisted demo snapshot don't have them, so the visual derives four
// gentle steps from the fields every pathway has. Invitations, not
// predictions: nothing here invents a fact.
import type { GeneratedPathway, PathwayMilestone } from "./types";

export const MILESTONE_LIMITS = { min: 3, max: 5, when: 40, title: 80, detail: 400 } as const;
export const GLIMPSE_MAX = 600;

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");

/** Keep only well-formed milestones, trimmed and capped. Fewer than three
 *  usable ones means "none": the derived journey is better than a stub. */
export function sanitizeMilestones(value: unknown): PathwayMilestone[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value
    .filter((m): m is Record<string, unknown> => typeof m === "object" && m !== null)
    .map((m) => ({
      when: clip(m.when, MILESTONE_LIMITS.when),
      title: clip(m.title, MILESTONE_LIMITS.title),
      detail: clip(m.detail, MILESTONE_LIMITS.detail),
    }))
    .filter((m) => m.when && m.title && m.detail)
    .slice(0, MILESTONE_LIMITS.max);
  return out.length >= MILESTONE_LIMITS.min ? out : undefined;
}

export function sanitizeGlimpse(value: unknown): string | undefined {
  const g = clip(value, GLIMPSE_MAX);
  return g || undefined;
}

/** A pathway with its optional journey fields cleaned (or dropped). */
export function withJourneyFields<T extends GeneratedPathway>(p: T): GeneratedPathway {
  const raw = p as unknown as Record<string, unknown>;
  const milestones = sanitizeMilestones(raw.milestones);
  const glimpse = sanitizeGlimpse(raw.glimpse);
  return {
    name: p.name,
    firstSemester: p.firstSemester,
    mentorArchetype: p.mentorArchetype,
    stretchChallenge: p.stretchChallenge,
    fourYearHorizon: p.fourYearHorizon,
    ...(milestones ? { milestones } : {}),
    ...(glimpse ? { glimpse } : {}),
  };
}

/** Applicants start in ninth grade; current students start from where they are. */
export type JourneyMode = "applicant" | "student";

const DERIVED_WHEN: Record<JourneyMode, [string, string, string, string]> = {
  applicant: ["First semester", "Freshman & sophomore years", "Junior year", "Senior year"],
  student: ["Next semester", "This year", "Next year", "Before graduation"],
};

/** The first sentence of a paragraph, for a milestone's short title line. */
function firstSentence(text: string): string {
  const m = text.trim().match(/^[^.!?]+[.!?]["”']?/);
  return (m ? m[0] : text).trim();
}

/** The person's department from "Name (Department) — …", if present. */
function department(mentor: string): string | null {
  const m = mentor.match(/\(([^)]{2,60})\)/);
  return m ? m[1].trim() : null;
}

export interface Journey {
  milestones: PathwayMilestone[];
  /** True when the steps were derived from the classic fields, so the
   *  "people" and "stretch" text already appears in them. */
  derived: boolean;
}

/** Milestones for any pathway: its own when present, else four derived steps. */
export function journeyFor(p: GeneratedPathway, mode: JourneyMode = "applicant"): Journey {
  const own = sanitizeMilestones(p.milestones);
  if (own) return { milestones: own, derived: false };
  const when = DERIVED_WHEN[mode];
  const dept = department(p.mentorArchetype);
  const horizon = p.fourYearHorizon.filter(Boolean);
  return {
    derived: true,
    milestones: [
      { when: when[0], title: "Begin here", detail: p.firstSemester.trim() },
      {
        when: when[1],
        title: dept ? `Find your people in ${dept}` : "Find your people",
        detail: p.mentorArchetype.trim(),
      },
      { when: when[2], title: "Take the stretch", detail: p.stretchChallenge.trim() },
      {
        when: when[3],
        title: "Choose what comes next",
        detail: horizon.length
          ? `Carry what you've built toward ${horizon.length > 1 ? "one of these roads" : "this road"}.`
          : firstSentence(p.firstSemester),
      },
    ],
  };
}
