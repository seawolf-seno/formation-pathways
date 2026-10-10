import type { FormationTag, GeneratedPathway } from "@/lib/types";

export type LifecycleStage = "applicant" | "admitted" | "enrolled" | "alumni" | "withdrawn";
export type SourceSystem = "finalsite" | "blackbaud" | "canvas";
export type StaffRole = "admin" | "admissions" | "teacher" | "staff";
export type ConsentScope = "import_records" | "ai_drafting" | "staff_observations" | "student_voice";

export const CONSENT_SCOPES: { scope: ConsentScope; label: string; detail: string }[] = [
  {
    scope: "import_records",
    label: "Import school data",
    detail: "Pull this student's Finalsite, Blackbaud and Canvas data into Formation Pathways.",
  },
  {
    scope: "staff_observations",
    label: "Staff observations",
    detail: "Let Pacifica staff record short observations about this student.",
  },
  {
    scope: "student_voice",
    label: "Student voice",
    detail: "Let the student share what lights them up (their own words and picks) in a Spark conversation with staff.",
  },
  {
    scope: "ai_drafting",
    label: "AI drafting",
    detail: "Let Claude draft a private staff-only summary and pathway options from these records.",
  },
];

export interface StaffMember {
  user_id: string;
  email: string;
  display_name: string;
  role: StaffRole;
}

/** A row on the /pilot staff list: pending (active = false) or active. */
export interface StaffListEntry extends StaffMember {
  active: boolean;
  created_at: string;
}

export interface PilotSettings {
  real_data_enabled: boolean;
  /** New @pacificachristian.org sign-ins become active staff without approval. */
  auto_approve_staff: boolean;
  approved_by: string | null;
  approval_reference: string | null;
  approved_at: string | null;
  /** Live Finalsite admissions counts (no per-student data) may be shown. */
  funnel_live_enabled: boolean;
  funnel_approved_by: string | null;
  funnel_approval_reference: string | null;
  funnel_approved_at: string | null;
  /** The public /discover inquiry form is open (needs a recorded approval). */
  inquiries_open: boolean;
  inquiries_approved_by: string | null;
  inquiries_approval_reference: string | null;
  inquiries_approved_at: string | null;
  /** Referral thank-yous for real families (needs leadership's recorded decision). */
  referral_thanks_open: boolean;
  referral_thanks_what: string | null;
  referral_thanks_on: "applied" | "enrolled";
  referral_thanks_cap: number;
  referral_thanks_approved_by: string | null;
  referral_thanks_approval_reference: string | null;
  referral_thanks_approved_at: string | null;
}

export type InquiryStatus = "new" | "contacted" | "applied" | "enrolled" | "closed";
export const INQUIRY_STATUSES: InquiryStatus[] = ["new", "contacted", "applied", "enrolled", "closed"];

/** A family's inquiry from /discover (supabase/migrations/20261009000000_inquiries.sql). */
export interface Inquiry {
  id: string;
  created_at: string;
  status: InquiryStatus;
  source: "website" | "share" | "direct";
  referred_by_code: string | null;
  share_code: string;
  parent_first_name: string;
  parent_last_name: string;
  parent_relationship: string;
  parent_email: string;
  parent_phone: string | null;
  address_1: string;
  address_2: string | null;
  city: string;
  state: string;
  zip: string;
  country: string;
  child_first_name: string;
  child_last_name: string;
  child_grade: number;
  entry_year: number;
  current_school: string | null;
  one_thing: string | null;
  interests: string[];
  consent_contact: boolean;
  consent_pathway: boolean;
  consent_version: string;
  delete_after: string;
  is_sample: boolean;
  finalsite_external_id: string;
  finalsite_exported_at: string | null;
  finalsite_contact_id: string | null;
  applied_at: string | null;
}

/** A Formation Pathway draft for an inquiring family (inquiry_pathways). */
export interface InquiryPathway {
  id: string;
  inquiry_id: string;
  created_at: string;
  pathways: import("../types").GeneratedPathway[];
  used_fallback: boolean;
  status: "draft" | "approved";
  approved_by: string | null;
  approved_at: string | null;
}

/** A private link admissions sent an inquiring family (only its hash is stored). */
export interface InquiryFamilyLink {
  id: string;
  created_at: string;
  expires_at: string;
}

/** A confirmed referral and its thank-you (20261012000000_referral_thanks.sql). */
export type ReferralStatus = "confirmed" | "approved" | "sent" | "declined";
export interface ReferralThanks {
  id: string;
  referred_inquiry_id: string;
  referrer_inquiry_id: string;
  is_sample: boolean;
  status: ReferralStatus;
  confirmed_by: string;
  confirmed_at: string;
  what: string | null;
  approved_by: string | null;
  approved_at: string | null;
  sent_by: string | null;
  sent_at: string | null;
  note: string | null;
}

/** A pathway a family shared publicly at /w/[code]. */
export interface InquiryShare {
  id: string;
  pathway_index: number;
  style: "tide" | "paper" | "sky";
  code: string;
  created_at: string;
  stopped_at: string | null;
}

export interface Person {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  stage: LifecycleStage;
  grad_year: number | null;
  current_grade: number | null;
  is_sample: boolean;
  created_at: string;
}

export interface ExternalId {
  person_id: string;
  system: SourceSystem;
  external_id: string;
}

export interface Consent {
  id: string;
  person_id: string;
  scope: ConsentScope;
  granted_by: string;
  granted_on: string;
  evidence: string;
  revoked_at: string | null;
}

export interface AdmissionsRecord {
  person_id: string;
  entry_year: number | null;
  entering_grade: number | null;
  application_status: string | null;
  previous_school: string | null;
  interests: string[];
  activities: string[];
  responses: { question: string; answer: string }[];
  imported_at: string;
}

export interface Enrollment {
  person_id: string;
  grade: number | null;
  grad_year: number | null;
  advisor_name: string | null;
  enrolled_since: string | null;
  imported_at: string;
}

export interface CourseEnrollment {
  person_id: string;
  canvas_course_id: string;
  course_name: string;
  teacher_name: string | null;
}

export interface ClassHistoryRow {
  person_id: string;
  source: string;
  section_id: string;
  school_year: string;
  course_title: string;
  course_code: string | null;
  offering_type: string | null;
}

export interface AcademicEvidence {
  id: string;
  person_id: string;
  canvas_course_id: string;
  assignment_name: string;
  submitted_at: string | null;
  late: boolean;
  missing: boolean;
  teacher_comment: string | null;
}

export interface SorObservation {
  id: string;
  person_id: string;
  author_id: string | null;
  author_name: string;
  source: "voice" | "text" | "admissions" | "canvas";
  raw_text: string;
  body: string;
  tags: FormationTag[];
  discipline_flag: string | null;
  created_at: string;
}

export interface PathwayDraft {
  id: string;
  person_id: string;
  portrait: string;
  pathways: GeneratedPathway[];
  sources_used: string[];
  used_fallback: boolean;
  status: "draft" | "approved";
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

export interface ImportRun {
  id: string;
  system: SourceSystem;
  /** "people" enriches pilot participants; "funnel" refreshes season counts. */
  kind: "people" | "funnel";
  mode: "sample" | "live";
  started_at: string;
  finished_at: string | null;
  matched: number;
  skipped_no_consent: number;
  unmatched: number;
  error: string | null;
}

/** Everything the system of record knows about one person, as far as the
 *  signed-in staff member's role allows (RLS returns nothing otherwise). */
export interface PersonProfile {
  person: Person;
  externalIds: ExternalId[];
  consents: Consent[];
  admissions: AdmissionsRecord | null;
  enrollment: Enrollment | null;
  courses: CourseEnrollment[];
  classHistory: ClassHistoryRow[];
  /** Every Spark session, newest first ([] if none, or the role can't read them). */
  sparks: import("./sparks").SparkSession[];
  /** Every class-reflection sitting, newest first ([] if none, or the role can't read them). */
  classReflections: import("./class-reflections").ClassReflectionSession[];
  /** False until the class_reflections migration is applied: hide the feature. */
  classReflectionsReady: boolean;
  evidence: AcademicEvidence[];
  observations: SorObservation[];
  drafts: PathwayDraft[];
}

export function displayName(p: Pick<Person, "first_name" | "last_name" | "preferred_name">): string {
  return `${p.preferred_name || p.first_name} ${p.last_name}`;
}
