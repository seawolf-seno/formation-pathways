import Anthropic from "@anthropic-ai/sdk";
import { withJourneyFields } from "./pathway-journey";
import { tidyDraftPathway } from "./draft-style";
import fs from "fs";
import path from "path";
import {
  FORMATION_TAGS,
  PATHWAY_COUNT,
  type ApplicantAnswer,
  type CourseSkill,
  type DraftObservationResult,
  type FormationTag,
  type GeneratedPathway,
  type GeneratedPathwaysResult,
  type Observation,
  type SeedObservationDraft,
  type SkillEvidenceItem,
  type SkillSnapshotDraft,
  type SuggestedTag,
} from "./types";
import type { CanvasSyncResult } from "./integrations/canvas";
import { formatWorldSignals, getWorldSignals, groundWhyNows, type WorldSignal } from "./world-signals";

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

/** Both pathway generators share one system prompt tail: the distinctiveness
 *  and world-signal rules (prompts/unique-pathways.txt), then the school. */
function pathwaySystemPrompt(lead: string): string {
  return [lead, "unique-pathways.txt", "pacifica-context.txt", "placeholders.txt"].map(readPrompt).join("\n\n---\n\n");
}

/** "The world right now" appended to a pathway prompt's user message. Public
 *  podcast show notes only; nothing about the student leaves for this. */
async function withWorldSignals(user: string): Promise<{ user: string; signals: WorldSignal[] }> {
  const world = await getWorldSignals();
  const block = formatWorldSignals(world);
  return { user: block ? `${user}\n\n---\n${block}` : user, signals: world.signals };
}

/** The model's pathways, each "why now" checked against the signals it was
 *  shown (lib/world-signals.ts groundWhyNows), then cleaned, capped and
 *  tidied of the phrasing tics the prompt bans (lib/draft-style.ts). */
function finishPathways(raw: unknown, signals: WorldSignal[]): GeneratedPathway[] {
  if (!Array.isArray(raw)) return [];
  return groundWhyNows(raw.filter(isGeneratedPathway), signals)
    .slice(0, PATHWAY_COUNT.draft)
    .map(withJourneyFields)
    .map(tidyDraftPathway);
}

// Six pathways with journeys, hooks and why-nows are long; leave headroom.
const PATHWAY_MAX_TOKENS = 9000;

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
    const system = [readPrompt("clean-and-tag.txt"), readPrompt("placeholders.txt")].join("\n\n---\n\n");
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

function quoteSnippet(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (!trimmed) return "something they're still discovering";
  const words = trimmed.split(" ");
  return words.length <= 14 ? trimmed : words.slice(0, 14).join(" ") + "…";
}

interface FallbackEmphasis {
  name: string;
  tag: FormationTag;
  mentor: string;
  firstSemester: (quote: string) => string;
  stretchChallenge: (quote: string) => string;
}

const FALLBACK_EMPHASES: FallbackEmphasis[] = [
  {
    name: "The Builder",
    tag: "Emerging Superpowers",
    mentor:
      "Dr. David Sumida (Engineering) — Pacifica's STEM Scholars program runs Drone Club, the Makers Space, and a Distinction track for students who put in real hours outside class.",
    firstSemester: (quote) =>
      `Their first semester lands in STEM Scholars, arriving as someone who says "${quote}" — and finding a Makers Space full of people who build things for the same reason.`,
    stretchChallenge: (quote) =>
      `Presenting what they built around "${quote}" to the Minchin Center's Insight Speaker Series, in front of working professionals, not just a teacher.`,
  },
  {
    name: "The Steady Servant",
    tag: "Love of Neighbor",
    mentor:
      "Trevor DeBenning (Chapel Director) — leads weekly all-school chapel and the annual All-School Retreat, Pacifica's deepest shared formation experience.",
    firstSemester: (quote) =>
      `Their first semester includes weekly chapel and an early nudge toward This Little Light Africa Club, arriving as someone who says "${quote}" — the kind of instinct that club exists for.`,
    stretchChallenge: (quote) =>
      `Turning "${quote}" into an actual ongoing commitment — showing up for the same person or cause every week, not just once.`,
  },
  {
    name: "The Asker of Real Questions",
    tag: "Intellectual Courage",
    mentor:
      "Devin Ketch (Philosophy/Theology/Psychology) — teaches in the Center for Philosophy & Theology's Oxford-style seminars, where students are trained in \"Intellectual Hospitality\": understanding a view rather than attacking it.",
    firstSemester: (quote) =>
      `Their first semester lands in an Oxford-style seminar in the Center for Philosophy & Theology, arriving as someone who says "${quote}" — exactly the kind of first-principles question the seminar is built for.`,
    stretchChallenge: (quote) =>
      `Defending "${quote}" out loud in seminar, then hearing the strongest possible case against it, and staying in the room.`,
  },
];

function fallbackAdmissionsPathways(
  answers: ApplicantAnswer[],
  sparkContext?: string | null
): GeneratedPathwaysResult {
  // When an essay is still blank, quote the Spark context instead so the
  // fallback pathway isn't built entirely on "something they're still
  // discovering" while real signal already exists.
  const a = (i: number) => answers[i]?.answer?.trim() || sparkContext || "";

  const pathways: GeneratedPathway[] = FALLBACK_EMPHASES.map(
    (emphasis, i) => ({
      name: emphasis.name,
      firstSemester: emphasis.firstSemester(quoteSnippet(a(i % answers.length))),
      mentorArchetype: emphasis.mentor,
      stretchChallenge: emphasis.stretchChallenge(
        quoteSnippet(a((i + 1) % answers.length))
      ),
      fourYearHorizon: [
        "a selective college or university, chosen for fit rather than prestige",
        "a gap-year fellowship or apprenticeship that tests the same instinct in the real world",
      ],
    })
  );

  const seedObservations: SeedObservationDraft[] = FALLBACK_EMPHASES.map(
    ({ tag }, i) => ({
      text: `In their application, they wrote about "${quoteSnippet(
        a(i % answers.length)
      )}" — worth watching for once they're in the building.`,
      tags: [tag],
    })
  );

  return { pathways, seedObservations };
}

function isGeneratedPathway(value: unknown): value is GeneratedPathway {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.name === "string" &&
    typeof p.firstSemester === "string" &&
    typeof p.mentorArchetype === "string" &&
    typeof p.stretchChallenge === "string" &&
    Array.isArray(p.fourYearHorizon) &&
    p.fourYearHorizon.every((r) => typeof r === "string")
  );
}

/**
 * Generates six named admissions Pathways plus seed observations from an
 * applicant's five short-answer responses. Always resolves — falls back to a
 * canned-but-still-quoting response if Claude is unreachable.
 */
export async function draftAdmissionsPathways(
  answers: ApplicantAnswer[],
  /**
   * Plain-language Spark-survey context (lib/spark.ts's formatSparkContext),
   * when the applicant has completed it. Self-reported interests only, never
   * essay text — appended, not blended into the Q/A block, so the model can
   * tell the two apart and lean on Spark only where essays are thin or empty.
   */
  sparkContext?: string | null
): Promise<{ result: GeneratedPathwaysResult; usedFallback: boolean }> {
  const anthropic = getClient();
  const fallback = fallbackAdmissionsPathways(answers, sparkContext);
  if (!anthropic) return { result: fallback, usedFallback: true };

  try {
    const system = pathwaySystemPrompt("admissions-pathways.txt");
    const answerBlock = answers
      .map((a, i) => `Q${i + 1}: ${a.question}\nA${i + 1}: ${a.answer}`)
      .join("\n\n");
    const { user, signals } = await withWorldSignals(
      sparkContext
        ? `${answerBlock}\n\n---\nAdditional context from a pre-essay interest survey (not an essay answer):\n${sparkContext}`
        : answerBlock
    );
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: PATHWAY_MAX_TOKENS,
      system,
      messages: [{ role: "user", content: user }],
    });
    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return { result: fallback, usedFallback: true };
    }

    const parsed = extractJson(textBlock.text) as {
      pathways?: unknown;
      seedObservations?: unknown;
    };

    const pathways = finishPathways(parsed.pathways, signals);

    const seedObservations: SeedObservationDraft[] = Array.isArray(
      parsed.seedObservations
    )
      ? parsed.seedObservations
          .filter(
            (o): o is { text: unknown; tags: unknown } =>
              typeof o === "object" && o !== null
          )
          .filter((o) => typeof o.text === "string")
          .slice(0, 5)
          .map((o) => ({
            text: o.text as string,
            tags: Array.isArray(o.tags)
              ? o.tags.filter(isFormationTag)
              : [],
          }))
      : [];

    if (pathways.length === 0) return { result: fallback, usedFallback: true };

    return {
      result: { pathways, seedObservations },
      usedFallback: false,
    };
  } catch {
    return { result: fallback, usedFallback: true };
  }
}

function isSkillEvidenceItem(value: unknown): value is SkillEvidenceItem {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    (e.source === "canvas" || e.source === "drive") &&
    typeof e.label === "string" &&
    typeof e.detail === "string"
  );
}

export function fallbackSkillSnapshots(
  skills: CourseSkill[],
  canvasData: CanvasSyncResult
): SkillSnapshotDraft[] {
  const drafts: SkillSnapshotDraft[] = [];
  canvasData.students.forEach((student, studentIndex) => {
    const graded = student.assignments.filter(
      (a) => a.score !== null && a.pointsPossible
    );
    const latest = graded[graded.length - 1] ?? student.assignments[0];
    const ratio =
      latest?.score !== null && latest?.pointsPossible
        ? latest.score! / latest.pointsPossible
        : null;
    const level =
      ratio === null
        ? "still finding their footing"
        : ratio >= 0.9
          ? "working with real confidence"
          : ratio >= 0.75
            ? "steady and improving"
            : "still building confidence, growth in progress";

    skills.forEach((skill, skillIndex) => {
      const evidence: SkillEvidenceItem[] = latest
        ? [
            {
              source: "canvas",
              label: latest.assignmentName,
              detail: latest.comment ?? "most recent submitted work",
            },
          ]
        : [];

      const withComment = student.assignments.find((a) => a.comment);
      const proposedObservation =
        withComment && (studentIndex + skillIndex) % 3 === 0
          ? {
              text: `On "${withComment.assignmentName}" in ${canvasData.courseName}, the teacher noted: "${withComment.comment}" — worth carrying into their Pathway.`,
              tags: [FORMATION_TAGS[(studentIndex + skillIndex) % FORMATION_TAGS.length]],
            }
          : null;

      drafts.push({
        studentName: student.studentName,
        skillName: skill.name,
        narrative: `On "${skill.name}," ${student.studentName.split(" ")[0]} is ${level}, based on their most recent work in ${canvasData.courseName}.`,
        evidence,
        proposedObservation,
      });
    });
  });
  return drafts;
}

/**
 * Maps Canvas coursework (and an optional Drive rubric/notes doc) onto a
 * course's teacher-defined skills, producing one narrative snapshot per
 * student per skill. Always resolves — falls back to a rule-based,
 * non-AI narrative if Claude is unreachable.
 */
export async function draftSkillSnapshots(
  courseName: string,
  skills: CourseSkill[],
  driveDocContent: string | null,
  canvasData: CanvasSyncResult
): Promise<{ drafts: SkillSnapshotDraft[]; usedFallback: boolean }> {
  const anthropic = getClient();
  const fallback = fallbackSkillSnapshots(skills, canvasData);
  if (!anthropic) return { drafts: fallback, usedFallback: true };

  try {
    const system = readPrompt("skill-mapping.txt");
    const skillsBlock = skills
      .map((s, i) => `${i + 1}. ${s.name} — ${s.description}`)
      .join("\n");
    const driveBlock = driveDocContent
      ? `\n\nTeacher's Drive doc ("${courseName}" rubric/notes):\n${driveDocContent}`
      : "";
    const studentsBlock = canvasData.students
      .map((s) => {
        const lines = s.assignments
          .map((a) => {
            const scoreStr =
              a.score !== null && a.pointsPossible
                ? `${a.score}/${a.pointsPossible}`
                : a.missing
                  ? "missing"
                  : "not yet submitted";
            const flags = [a.late && "late", a.missing && "missing"]
              .filter(Boolean)
              .join(", ");
            const comment = a.comment ? ` — teacher comment: "${a.comment}"` : "";
            return `  - ${a.assignmentName}: ${scoreStr}${flags ? ` (${flags})` : ""}${comment}`;
          })
          .join("\n");
        return `${s.studentName}:\n${lines}`;
      })
      .join("\n\n");

    const user = `Course: ${courseName}\n\nSkills:\n${skillsBlock}${driveBlock}\n\nCanvas data per student:\n${studentsBlock}`;

    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system,
      messages: [{ role: "user", content: user }],
    });
    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return { drafts: fallback, usedFallback: true };
    }

    const parsed = extractJson(textBlock.text) as { snapshots?: unknown };
    const snapshots: SkillSnapshotDraft[] = Array.isArray(parsed.snapshots)
      ? parsed.snapshots
          .filter(
            (s): s is Record<string, unknown> =>
              typeof s === "object" && s !== null
          )
          .filter(
            (s) =>
              typeof s.studentName === "string" &&
              typeof s.skillName === "string" &&
              typeof s.narrative === "string"
          )
          .map((s) => ({
            studentName: s.studentName as string,
            skillName: s.skillName as string,
            narrative: s.narrative as string,
            evidence: Array.isArray(s.evidence)
              ? s.evidence.filter(isSkillEvidenceItem)
              : [],
            proposedObservation:
              typeof s.proposedObservation === "object" &&
              s.proposedObservation !== null &&
              typeof (s.proposedObservation as Record<string, unknown>).text ===
                "string"
                ? {
                    text: (s.proposedObservation as Record<string, unknown>)
                      .text as string,
                    tags: Array.isArray(
                      (s.proposedObservation as Record<string, unknown>).tags
                    )
                      ? (
                          (s.proposedObservation as Record<string, unknown>)
                            .tags as unknown[]
                        ).filter(isFormationTag)
                      : [],
                  }
                : null,
          }))
      : [];

    if (snapshots.length === 0) return { drafts: fallback, usedFallback: true };
    return { drafts: snapshots, usedFallback: false };
  } catch {
    return { drafts: fallback, usedFallback: true };
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

/** What the system of record hands Claude for a "who they are today" draft.
 *  First name only, no ids, no timeliness data — see prompts/ruakh-today.txt. */
export interface RuakhInput {
  firstName: string;
  stage: string;
  grade: number | null;
  previousSchool: string | null;
  interests: string[];
  activities: string[];
  applicationResponses: ApplicantAnswer[];
  courses: { name: string; teacher: string | null }[];
  teacherComments: { course: string; assignment: string; comment: string }[];
  observations: { author: string; text: string; tags: string[]; date: string }[];
  /** The student's own sparks from a Spark conversation, as plain text. */
  studentSparks: string | null;
}

export interface RuakhDraft {
  portrait: string;
  pathways: GeneratedPathway[];
  usedFallback: boolean;
}

/** Ends a quoted snippet with exactly one period, never `…".` or `?".`. */
function quoteSentence(text: string): string {
  const snippet = quoteSnippet(text);
  return /[.!?…]$/.test(snippet) ? `"${snippet}"` : `"${snippet}."`;
}

// Unlike the admissions fallback, these never splice evidence into the
// pathway sentences: a teacher comment or a hard-season answer reads wrong
// dropped into a template, and this student may be years past "first semester".
const RUAKH_FALLBACK_STEPS: Record<string, { step: (when: string) => string; stretch: string }> = {
  "The Builder": {
    step: (when) => `${when}: time in the Makers Space or a STEM Scholars project, building something for someone else rather than for a grade.`,
    stretch: "Presenting something they built to the Minchin Center's Insight Speaker Series, in front of working professionals, not just a teacher.",
  },
  "The Steady Servant": {
    step: (when) => `${when}: weekly chapel and an invitation into a service club, somewhere their care for people has a regular place to go.`,
    stretch: "Turning a good instinct into an ongoing commitment: showing up for the same person or cause every week, not just once.",
  },
  "The Asker of Real Questions": {
    step: (when) => `${when}: a seat in an Oxford-style seminar in the Center for Philosophy & Theology, where real questions are the point.`,
    stretch: "Making a case out loud in seminar, then hearing the strongest possible case against it, and staying in the room.",
  },
};

function fallbackRuakh(input: RuakhInput): RuakhDraft {
  const evidence =
    input.applicationResponses.length + input.teacherComments.length + input.observations.length;
  const where = input.previousSchool
    ? `${input.firstName} came to us from ${input.previousSchool}`
    : `${input.firstName} is ${input.stage === "applicant" ? "applying to" : "at"} Pacifica`;
  const portrait =
    `${where}. ` +
    (input.applicationResponses[0]
      ? `In their own words: ${quoteSentence(input.applicationResponses[0].answer)} `
      : "") +
    (input.teacherComments[0]
      ? `A teacher recently wrote: ${quoteSentence(input.teacherComments[0].comment)} `
      : "") +
    (input.observations[0]
      ? `${input.observations[0].author} noticed: ${quoteSentence(input.observations[0].text)}`
      : "") +
    `\n\nAI assist is offline, so this is a template, not a synthesis. ` +
    `${evidence} ${evidence === 1 ? "piece" : "pieces"} of evidence are on file above for whoever writes the real one.`;
  const when =
    input.stage === "applicant" || input.stage === "admitted" ? "First semester" : "Next semester";
  return {
    portrait,
    pathways: FALLBACK_EMPHASES.map((e) => ({
      name: e.name,
      firstSemester: RUAKH_FALLBACK_STEPS[e.name].step(when),
      mentorArchetype: e.mentor,
      stretchChallenge: RUAKH_FALLBACK_STEPS[e.name].stretch,
      fourYearHorizon: [
        "a selective college or university, chosen for fit rather than prestige",
        "a gap-year fellowship or apprenticeship that tests the same instinct in the real world",
      ],
    })),
    usedFallback: true,
  };
}

/**
 * Drafts "who this student is today" plus six Ruakh 2.0 pathways from the
 * system of record. Always resolves — canned fallback if Claude is
 * unreachable. Callers must check ai_drafting consent BEFORE calling (the
 * pathway_drafts insert trigger enforces it again on save).
 */
export async function draftRuakhPathways(input: RuakhInput): Promise<RuakhDraft> {
  const anthropic = getClient();
  const fallback = fallbackRuakh(input);
  if (!anthropic) return fallback;

  try {
    const system = pathwaySystemPrompt("ruakh-today.txt");
    // Courses last: nearly every classmate shares them, so they're backdrop
    // (see prompts/ruakh-today.txt), not the first thing the model reads.
    const { courses, ...distinctive } = input;
    const { user, signals } = await withWorldSignals(JSON.stringify({ ...distinctive, courses }, null, 2));
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: PATHWAY_MAX_TOKENS,
      system,
      messages: [{ role: "user", content: user }],
    });
    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return fallback;
    const parsed = extractJson(textBlock.text) as { portrait?: unknown; pathways?: unknown };
    const pathways = finishPathways(parsed.pathways, signals);
    if (typeof parsed.portrait !== "string" || pathways.length < PATHWAY_COUNT.min) return fallback;
    return { portrait: parsed.portrait, pathways, usedFallback: false };
  } catch {
    return fallback;
  }
}
