/** STEM Scholars uses narratives and reviewed evidence, never student scores. */
export const STEM_STATUSES = ["draft", "submitted", "active", "paused", "distinction"] as const;
export type StemStatus = typeof STEM_STATUSES[number];
export const STEM_KINDS = ["project", "meeting", "mentor", "evidence", "summary"] as const;
export type StemKind = typeof STEM_KINDS[number];
export interface StemProgram {
  id: boolean;
  introduction: string;
  requirements: string[];
  approved_by: string | null;
  approved_at: string | null;
  application_deadline: string | null;
}
export interface StemMember {
  id: string;
  person_id: string;
  interest: string;
  goal: string;
  availability: string;
  student_email: string;
  status: StemStatus;
  review_note: string;
  reviewed_by: string | null;
  distinction_by: string | null;
  distinction_at: string | null;
  distinction_requirements: string[] | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}
export interface StemWork {
  id: string;
  person_id: string;
  kind: StemKind;
  title: string;
  body: string;
  next_step: string;
  due_date: string | null;
  url: string;
  status: "planned" | "active" | "completed";
  mentor_id: string | null;
  requirement: string;
  approved_by: string | null;
  approved_at: string | null;
  period_start: string | null;
  period_end: string | null;
  delivered_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}
export interface StemMentor { id: string; name: string; kind: "mentor" | "alumni"; expertise: string; contact: string; active: boolean }
export interface StemOpportunity { id: string; title: string; kind: "internship" | "research" | "event"; organization: string; description: string; url: string; deadline: string | null; published: boolean }
export interface StemHub { program: StemProgram; members: StemMember[]; work: StemWork[]; mentors: StemMentor[]; opportunities: StemOpportunity[] }
export interface StemStudentView {
  first_name: string;
  expires_at: string;
  program: StemProgram;
  member: Pick<StemMember, "interest" | "goal" | "availability" | "status" | "review_note" | "distinction_at">;
  work: Pick<StemWork, "id" | "kind" | "title" | "body" | "next_step" | "due_date" | "url" | "status" | "requirement" | "approved_at">[];
  mentors: Pick<StemMentor, "id" | "name" | "kind" | "expertise">[];
  opportunities: StemOpportunity[];
}

export function safeStemUrl(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  let url: URL;
  try { url = new URL(text); } catch { throw new Error("Use a complete https:// or http:// link."); }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || text.length > 2000)
    throw new Error("Use a complete https:// or http:// link without login details.");
  return url.href;
}

export function stemDate(value: unknown): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(Date.parse(`${text}T00:00:00Z`)) || new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) !== text)
    throw new Error("Choose a valid calendar date.");
  return text;
}

export function nextStemPeriod(member: StemMember, work: StemWork[], today: string) {
  const latest = work.filter(w => w.person_id === member.person_id && w.kind === "summary" && w.period_end)
    .map(w => w.period_end!).sort().at(-1);
  const start = latest ?? member.created_at.slice(0, 10);
  const date = new Date(`${start}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 14);
  const end = date.toISOString().slice(0, 10);
  return { start, end, due: end <= today && ["submitted", "active"].includes(member.status) };
}

/** Deterministic assistant: no student information is sent to an AI vendor. */
export function buildStemSummary(member: StemMember, program: StemProgram, work: StemWork[], opportunities: StemOpportunity[], period: { start: string; end: string }, today: string): string {
  const own = work.filter(w => w.person_id === member.person_id);
  const changed = own.filter(w => w.kind === "project" && w.updated_at.slice(0, 10) >= period.start && w.updated_at.slice(0, 10) < period.end);
  const verified = new Set(own.filter(w => w.kind === "evidence" && w.approved_at).map(w => w.requirement));
  const remaining = program.requirements.filter(r => !verified.has(r));
  const steps = own.filter(w => w.kind !== "summary" && w.status !== "completed" && w.next_step)
    .map(w => `${w.title}: ${w.next_step}${w.due_date ? ` (by ${w.due_date})` : ""}`);
  const openings = opportunities.filter(o => o.published && (!o.deadline || o.deadline >= today)).slice(0, 6);
  return [
    `Your STEM Scholars update · ${period.start} to ${period.end}`,
    `Application: ${member.status === "active" ? "accepted" : member.status}.`,
    "What has been happening", changed.length ? changed.map(w => `• ${w.title}: ${w.body}`).join("\n") : "No new project updates in this period. Bring your latest work to your next mentor conversation.",
    "Your next steps", steps.length ? steps.map(s => `• ${s}`).join("\n") : "Check in with your coordinator to choose your next step.",
    program.approved_at ? "Toward the STEM Scholars distinction" : "Suggested requirements · awaiting school approval",
    remaining.length ? remaining.map(r => `• Gather and review evidence for: ${r}`).join("\n") : "Your evidence is reviewed. Ask your coordinator to review your distinction.",
    "Opportunities to explore", openings.length ? openings.map(o => `• ${o.title} · ${o.organization}${o.deadline ? ` · apply by ${o.deadline}` : ""}\n${o.url}`).join("\n") : "Ask your coordinator about upcoming research and internships.",
  ].join("\n\n");
}
