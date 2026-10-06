export const FORMATION_TAGS = [
  "Spiritual Depth",
  "Intellectual Courage",
  "Character Under Pressure",
  "Love of Neighbor",
  "Emerging Superpowers",
  "Sense of Calling",
] as const;

export type FormationTag = (typeof FORMATION_TAGS)[number];

export interface Student {
  id: number;
  name: string;
  grade: number;
  created_at: string;
}

export interface StudentWithStats extends Student {
  observation_count: number;
  last_observed_at: string | null;
  days_since_observed: number | null;
  needs_attention: boolean;
}

export type ObservationSource = "voice" | "text" | "admissions" | "canvas";

export interface Observation {
  id: number;
  student_id: number;
  author: string;
  raw_text: string;
  clean_text: string;
  tags: FormationTag[];
  discipline_flag: string | null;
  source: ObservationSource;
  created_at: string;
}

export type PortraitType = "family" | "admissions";

export interface Portrait {
  id: number | string;
  student_id: number;
  type: PortraitType;
  content: string;
  signed_by: string | null;
  signed_at: string | null;
  created_at: string;
}

export interface SchoolClass {
  id: number;
  name: string;
  created_at: string;
}

export interface ClassWithStats extends SchoolClass {
  student_count: number;
}

export interface SuggestedTag {
  tag: FormationTag;
  rationale: string;
}

export interface DraftObservationResult {
  cleanText: string;
  suggestedTags: SuggestedTag[];
  disciplineFlag: string | null;
  usedFallback: boolean;
}

export type ApplicantStatus =
  | "in_progress"
  | "submitted"
  | "approved"
  | "enrolled";

export interface ApplicantAnswer {
  question: string;
  answer: string;
}

export interface PathwayMilestone {
  /** e.g. "Freshman fall", "Junior year", "This spring". */
  when: string;
  title: string;
  detail: string;
  /** Optional: the student's own spark this step grows from, in their words
   *  (from a Spark conversation), shown as "grew from your spark". */
  spark?: string;
}

export interface GeneratedPathway {
  name: string;
  firstSemester: string;
  mentorArchetype: string;
  stretchChallenge: string;
  fourYearHorizon: string[];
  /** Optional: about one step per year, for the journey visual. Older drafts
   *  don't have it; lib/pathway-journey.ts derives steps instead. */
  milestones?: PathwayMilestone[];
  /** Optional: 2–3 sentences, second person, a concrete moment ("Picture a
   *  Thursday in spring of junior year…"). An invitation, not a prediction. */
  glimpse?: string;
  /** Optional: the one distinctive detail this pathway grows from, in the
   *  student's own words (a prior school, a project, a hobby, one sentence). */
  hook?: string;
  /** Optional: one sentence on why this pathway is timely, from a dated
   *  public podcast item (lib/world-signals.ts). Never a promise or contact. */
  whyNow?: string;
  /** Where whyNow came from, e.g. "TBPN · Oct 5, 2026". Required with whyNow. */
  whyNowSource?: string;
}

/** How many pathways a draft offers. Many, so staff can keep the ones that
 *  are unmistakably this student's; editing can trim down to the minimum. */
export const PATHWAY_COUNT = { draft: 6, min: 3 } as const;

import type { SparkResponse } from "./spark";

export interface SeedObservationDraft {
  text: string;
  tags: FormationTag[];
}

export interface GeneratedPathwaysResult {
  pathways: GeneratedPathway[];
  seedObservations: SeedObservationDraft[];
}

export interface Applicant {
  id: number;
  name: string;
  grade: number | null;
  slug: string;
  token: string;
  answers: ApplicantAnswer[];
  generated: GeneratedPathwaysResult | null;
  status: ApplicantStatus;
  approved_by: string | null;
  approved_at: string | null;
  converted_student_id: number | null;
  created_at: string;
  /** Separate, longer token for the public Spark survey link. Null until sent. */
  spark_token: string | null;
  spark_response: SparkResponse | null;
  spark_completed_at: string | null;
}

export interface Course {
  id: number;
  name: string;
  teacher_name: string;
  canvas_course_id: string | null;
  drive_doc_name: string | null;
  drive_doc_content: string | null;
  last_synced_at: string | null;
  created_at: string;
}

export interface CourseWithStats extends Course {
  student_count: number;
  skill_count: number;
}

export interface CourseSkill {
  id: number;
  course_id: number;
  name: string;
  description: string;
  created_at: string;
}

export interface SkillEvidenceItem {
  source: "canvas" | "drive";
  label: string;
  detail: string;
}

export interface SkillSnapshot {
  id: number;
  student_id: number;
  skill_id: number;
  narrative: string;
  evidence: SkillEvidenceItem[];
  updated_at: string;
}

export interface SkillSnapshotDraft {
  studentName: string;
  skillName: string;
  narrative: string;
  evidence: SkillEvidenceItem[];
  proposedObservation: { text: string; tags: FormationTag[] } | null;
}
