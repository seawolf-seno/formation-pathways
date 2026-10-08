// What the system of record sends to Anthropic, built in one place and always
// through the pseudonymizer (./anonymize.ts): every known name and contact
// detail is replaced before it leaves, and put back in what comes back. The
// person and inquiry pages show staff this exact text.
import type { RuakhInput } from "../claude";
import { inquiryDraftInput } from "../discover.ts";
import { Pseudonymizer } from "./anonymize.ts";
import { mergeSparks, sparksForPrompt } from "./sparks.ts";
import type { Inquiry, Person, PersonProfile } from "./types";

/** The student, everyone else on the roster this staff member can see, and
 *  every staff name in the record. */
export function personPseudonymizer(profile: PersonProfile, roster: Person[], staffName?: string | null): Pseudonymizer {
  const { person } = profile;
  return new Pseudonymizer({
    student: { first: person.first_name, last: person.last_name, preferred: person.preferred_name },
    others: roster
      .filter((p) => p.id !== person.id)
      .map((p) => ({ first: p.first_name, last: p.last_name, preferred: p.preferred_name })),
    staff: [
      staffName,
      profile.enrollment?.advisor_name,
      ...profile.courses.map((c) => c.teacher_name),
      ...profile.observations.map((o) => o.author_name),
    ],
  });
}

function toRuakhInput(profile: PersonProfile): RuakhInput {
  const { person, admissions, enrollment, courses, classHistory, evidence, observations } = profile;
  const courseName = new Map(courses.map((c) => [c.canvas_course_id, c.course_name]));
  return {
    firstName: person.preferred_name || person.first_name,
    stage: person.stage,
    grade: enrollment?.grade ?? person.current_grade,
    previousSchool: admissions?.previous_school ?? null,
    interests: admissions?.interests ?? [],
    activities: admissions?.activities ?? [],
    applicationResponses: admissions?.responses ?? [],
    // Canvas courses (with teacher), then Blackbaud class history: titles and
    // school year only, no grades.
    courses: [
      ...courses.map((c) => ({ name: c.course_name, teacher: c.teacher_name })),
      ...classHistory
        .filter((h) => !courses.some((c) => c.course_name === h.course_title))
        .slice(0, 40)
        .map((h) => ({ name: `${h.course_title} (${h.school_year}${h.offering_type ? `, ${h.offering_type}` : ""})`, teacher: null })),
    ],
    teacherComments: evidence
      .filter((e) => e.teacher_comment)
      .map((e) => ({
        course: courseName.get(e.canvas_course_id) ?? "a course",
        assignment: e.assignment_name,
        comment: e.teacher_comment!,
      })),
    observations: observations.map((o) => ({
      author: o.author_name,
      text: o.body,
      tags: o.tags,
      date: o.created_at.slice(0, 10),
    })),
    // What lights them up, in their own words: needs student_voice consent to
    // exist at all, and reaches Claude only under the same AI rules as the rest.
    // All sessions, so at-home answers add to the in-person ones.
    studentSparks: profile.sparks.length ? sparksForPrompt(mergeSparks(profile.sparks)!) : null,
  };
}

/** A pathway draft's input with no names in it. */
export function pathwayInput(profile: PersonProfile, roster: Person[], staffName?: string | null) {
  const anon = personPseudonymizer(profile, roster, staffName);
  const input = { ...anon.scrubDeep(toRuakhInput(profile)), firstName: "[STUDENT]" };
  return { input, anon };
}

export function inquiryPseudonymizer(i: Inquiry): Pseudonymizer {
  return new Pseudonymizer({
    student: { first: i.child_first_name, last: i.child_last_name },
    parents: [{ first: i.parent_first_name, last: i.parent_last_name }],
  });
}

/** An inquiry draft's input: the family's own words, with no names in it. */
export function inquiryInput(i: Inquiry) {
  const anon = inquiryPseudonymizer(i);
  return { ...anon.scrubDeep(inquiryDraftInput(i)), anon };
}

/** Exactly what would be sent, for staff to check. */
export function describeSent(payload: unknown, anon: Pseudonymizer): { text: string; leaks: number } {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  return { text, leaks: anon.findNames(text).length };
}
