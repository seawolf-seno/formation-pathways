// Pure share-card logic: no database, no I/O, so it is trivially testable.
//
// A parent-curated share is the ONLY thing that ever reaches the public web
// for an applicant. It is built by copying a short, explicit whitelist of
// fields into a snapshot (`PublicShareContent`) at the moment the family
// confirms the preview. Nothing is read from the applicant record afterwards,
// so what the family previewed is exactly what is public.
import type { GeneratedPathway } from "./types";

export interface ShareSelection {
  pathwayIndex: number;
  /** Index of the sentence from `firstSemester` the family chose as the highlight. */
  highlightIndex: number;
  includeStretch: boolean;
  includeHorizon: boolean;
  /** Department/program only. A teacher's name is never shareable. */
  includeProgram: boolean;
}

export interface PublicShareContent {
  firstName: string;
  pathwayName: string;
  highlight: string;
  stretchChallenge: string | null;
  horizon: string[] | null;
  /** Department name only, e.g. "Engineering". Never a person's name. */
  program: string | null;
}

/** Split a paragraph into sentences, keeping terminal punctuation. */
export function splitSentences(text: string): string[] {
  return (text.match(/[^.!?]+(?:[.!?]+["”')\]]*|$)/g) ?? [])
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * The generator formats mentors as "Name (Department) — one sentence about the
 * department." For the public card we keep only the department and drop the
 * person and everything after it. Returns null if the shape isn't recognised,
 * rather than guessing.
 */
export function publicProgramLine(mentorArchetype: string): string | null {
  const m = mentorArchetype.match(/\(([^)]{2,60})\)/);
  return m ? m[1].trim() : null;
}

export function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? "";
}

/** Build the public snapshot. Throws on an out-of-range selection. */
export function buildPublicShareContent(
  applicantName: string,
  pathways: GeneratedPathway[],
  selection: ShareSelection
): PublicShareContent {
  const pathway = pathways[selection.pathwayIndex];
  if (!pathway) throw new Error("Choose one of the Pathways to share");

  const sentences = splitSentences(pathway.firstSemester);
  const highlight = sentences[selection.highlightIndex];
  if (!highlight) throw new Error("Choose a highlight to share");

  const firstName = firstNameOf(applicantName);
  if (!firstName) throw new Error("A first name is required");

  return {
    firstName,
    pathwayName: pathway.name,
    highlight,
    stretchChallenge: selection.includeStretch ? pathway.stretchChallenge : null,
    horizon: selection.includeHorizon ? pathway.fourYearHorizon.slice(0, 3) : null,
    program: selection.includeProgram
      ? publicProgramLine(pathway.mentorArchetype)
      : null,
  };
}

/**
 * Validate content parsed back out of storage. The public route renders only
 * what passes here, so a malformed or tampered row can never leak extra keys.
 */
export function parsePublicShareContent(raw: unknown): PublicShareContent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
  const firstName = str(r.firstName);
  const pathwayName = str(r.pathwayName);
  const highlight = str(r.highlight);
  if (!firstName || !pathwayName || !highlight) return null;
  const horizon =
    Array.isArray(r.horizon) && r.horizon.every((h) => typeof h === "string")
      ? (r.horizon as string[]).slice(0, 3)
      : null;
  return {
    firstName,
    pathwayName,
    highlight,
    stretchChallenge: str(r.stretchChallenge),
    horizon,
    program: str(r.program),
  };
}

export type CardFormat = "feed" | "story" | "og";

export const CARD_SIZES: Record<CardFormat, { width: number; height: number }> = {
  feed: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
  og: { width: 1200, height: 630 },
};

export function isCardFormat(v: string | null): v is CardFormat {
  return v === "feed" || v === "story" || v === "og";
}
