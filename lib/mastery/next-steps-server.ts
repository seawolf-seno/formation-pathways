import "server-only";
import { Pseudonymizer } from "@/lib/sor/anonymize";
import { studentStatuses } from "./rules";
import { nextStepsInput } from "./next-steps";
import type { CourseBundle } from "./queries";

/** What a next-steps draft for one student sends to Claude: the payload from
 *  next-steps.ts with every name we know (this student, their classmates on
 *  the roster, the teacher) replaced. Also what the teacher sees under
 *  "What the AI sees". */
export function nextStepsPayload(bundle: CourseBundle, personId: string, teacherName: string | null) {
  const student = bundle.roster.find((s) => s.id === personId);
  if (!student) throw new Error("That student isn't on this course's roster.");
  const evidence = bundle.evidence.filter((e) => e.person_id === personId);
  const { input, links } = nextStepsInput(
    bundle.config,
    bundle.course.title,
    studentStatuses(bundle.config, evidence),
    evidence,
    bundle.course.finished_through,
  );
  const anon = new Pseudonymizer({
    student: { first: student.first_name, last: student.last_name, preferred: student.preferred_name },
    others: bundle.roster.filter((s) => s.id !== personId).map((s) => ({ first: s.first_name, last: s.last_name, preferred: s.preferred_name })),
    staff: [teacherName],
  });
  const scrubbed = anon.scrubDeep(input);
  return { input: scrubbed, links, anon, text: JSON.stringify(scrubbed, null, 2) };
}
