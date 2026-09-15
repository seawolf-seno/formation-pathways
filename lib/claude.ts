import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import {
  FORMATION_TAGS,
  type DraftObservationResult,
  type FormationTag,
  type Observation,
  type SuggestedTag,
} from "./types";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const PROMPTS_DIR = path.join(process.cwd(), "prompts");

function readPrompt(fileName: string): string {
  return fs.readFileSync(path.join(PROMPTS_DIR, fileName), "utf-8");
}

let client: Anthropic | null | undefined;
function getClient(): Anthropic | null {
  if (client !== undefined) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  client = apiKey ? new Anthropic({ apiKey }) : null;
  return client;
}

function isFormationTag(value: unknown): value is FormationTag {
  return (
    typeof value === "string" &&
    (FORMATION_TAGS as readonly string[]).includes(value)
  );
}

function extractJson(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  return JSON.parse(trimmed);
}

function fallbackCleanText(rawText: string): string {
  return rawText.trim().replace(/\s+/g, " ").replace(/\b(um|uh),?\s+/gi, "");
}

/**
 * Cleans a teacher's raw dictation/text, suggests Formation Framework tags,
 * and checks for discipline framing. Always resolves — falls back to a
 * canned, honest response (usedFallback: true) if Claude is unreachable so
 * capture never blocks on the network.
 */
export async function draftObservation(
  rawText: string
): Promise<DraftObservationResult> {
  const anthropic = getClient();
  const fallback: DraftObservationResult = {
    cleanText: fallbackCleanText(rawText),
    suggestedTags: [],
    disciplineFlag: null,
    usedFallback: true,
  };

  if (!anthropic) return fallback;

  try {
    const system = readPrompt("clean-and-tag.txt");
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 700,
      system,
      messages: [{ role: "user", content: rawText }],
    });
    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return fallback;

    const parsed = extractJson(textBlock.text) as {
      cleanText?: unknown;
      suggestedTags?: unknown;
      disciplineFlag?: unknown;
    };

    const cleanText =
      typeof parsed.cleanText === "string" && parsed.cleanText.trim()
        ? parsed.cleanText.trim()
        : fallback.cleanText;

    const suggestedTags: SuggestedTag[] = Array.isArray(parsed.suggestedTags)
      ? parsed.suggestedTags
          .filter(
            (t): t is { tag: unknown; rationale: unknown } =>
              typeof t === "object" && t !== null
          )
          .filter((t) => isFormationTag(t.tag))
          .slice(0, 2)
          .map((t) => ({
            tag: t.tag as FormationTag,
            rationale:
              typeof t.rationale === "string" ? t.rationale : "",
          }))
      : [];

    const disciplineFlag =
      typeof parsed.disciplineFlag === "string" && parsed.disciplineFlag.trim()
        ? parsed.disciplineFlag.trim()
        : null;

    return { cleanText, suggestedTags, disciplineFlag, usedFallback: false };
  } catch {
    return fallback;
  }
}

function formatObservationsForPrompt(observations: Observation[]): string {
  return observations
    .map((o) => {
      const date = new Date(o.created_at).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
      const tags = o.tags.length ? ` [${o.tags.join(", ")}]` : "";
      return `- (${date}, noticed by ${o.author}${tags}): ${o.clean_text}`;
    })
    .join("\n");
}

function fallbackFamilyPortrait(
  name: string,
  grade: number,
  observations: Observation[]
): string {
  const highlights = observations.slice(0, 4);
  const lines = highlights
    .map((o) => `- ${o.author} noticed: "${o.clean_text}"`)
    .join("\n");
  return [
    `Here's what we've been noticing about ${name} this year (grade ${grade}).`,
    "",
    "This is an offline placeholder portrait — the Anthropic API was not reachable, so here are the raw moments teachers logged instead of a woven narrative:",
    "",
    lines || "No observations captured yet.",
    "",
    "Dinner-table questions:",
    `1. What's one thing you did recently that surprised you about yourself?`,
    `2. Who in your day did you go out of your way for this week?`,
  ].join("\n");
}

function fallbackAdmissionsStory(
  grade: number,
  observations: Observation[]
): string {
  const count = observations.length;
  return `A student in grade ${grade} arrived quiet and unsure of their own voice. Over the course of the year, ${count} separate moments — noticed independently by different teachers — traced a steady arc: a willingness to be wrong out loud, to show up for a classmate without being asked, and to ask harder questions about who they're becoming. None of it happened all at once. It happened in small, repeated choices that added up to a student increasingly willing to lead, to care, and to be honest about what they don't yet know. (Offline placeholder — the Anthropic API was not reachable when this was drafted.)`;
}

export async function draftFamilyPortrait(
  name: string,
  grade: number,
  observations: Observation[]
): Promise<{ content: string; usedFallback: boolean }> {
  const anthropic = getClient();
  if (!anthropic || observations.length === 0) {
    return {
      content: fallbackFamilyPortrait(name, grade, observations),
      usedFallback: true,
    };
  }

  try {
    const system = readPrompt("family-portrait.txt");
    const user = `Student: ${name}, grade ${grade}\n\nObservations (chronological, most recent first):\n${formatObservationsForPrompt(
      observations
    )}`;
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1200,
      system,
      messages: [{ role: "user", content: user }],
    });
    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return {
        content: fallbackFamilyPortrait(name, grade, observations),
        usedFallback: true,
      };
    }
    return { content: textBlock.text.trim(), usedFallback: false };
  } catch {
    return {
      content: fallbackFamilyPortrait(name, grade, observations),
      usedFallback: true,
    };
  }
}

export async function draftAdmissionsStory(
  grade: number,
  observations: Observation[]
): Promise<{ content: string; usedFallback: boolean }> {
  const anthropic = getClient();
  if (!anthropic || observations.length === 0) {
    return {
      content: fallbackAdmissionsStory(grade, observations),
      usedFallback: true,
    };
  }

  try {
    const system = readPrompt("admissions-story.txt");
    const user = `Student grade: ${grade}\n\nObservations (identifying details must not appear in your response):\n${formatObservationsForPrompt(
      observations
    )}`;
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 500,
      system,
      messages: [{ role: "user", content: user }],
    });
    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return {
        content: fallbackAdmissionsStory(grade, observations),
        usedFallback: true,
      };
    }
    return { content: textBlock.text.trim(), usedFallback: false };
  } catch {
    return {
      content: fallbackAdmissionsStory(grade, observations),
      usedFallback: true,
    };
  }
}
