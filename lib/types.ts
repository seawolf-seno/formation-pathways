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

export interface Observation {
  id: number;
  student_id: number;
  author: string;
  raw_text: string;
  clean_text: string;
  tags: FormationTag[];
  discipline_flag: string | null;
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
