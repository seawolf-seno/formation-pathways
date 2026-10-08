import { test } from "node:test";
import assert from "node:assert/strict";
import { Pseudonymizer } from "../lib/sor/anonymize.ts";

const make = () =>
  new Pseudonymizer({
    student: { first: "Levi", last: "Okonkwo", preferred: null },
    parents: [{ first: "Dana", last: "Okonkwo" }],
    others: [{ first: "Maya", last: "Chen-Ruiz" }, { first: "Grace", last: "Park" }],
    staff: ["Mrs. Alvarez", "Steven Eno"],
  });

test("replaces the student, family, classmates and staff", () => {
  const a = make();
  const out = a.scrub("Levi Okonkwo helped Maya with the lab. Mrs. Alvarez said Levi's notes were the best. Dana emailed.");
  assert.equal(out, "[STUDENT] helped [PERSON 1] with the lab. [STAFF 1] said [STUDENT]'s notes were the best. [PARENT 1] emailed.");
  assert.deepEqual(a.findNames(out), []);
});

test("the student's surname is the family's, and a parent keeps their own name", () => {
  const a = make();
  assert.equal(a.scrub("The Okonkwo family. Dana Okonkwo wrote, and Levi Okonkwo replied."), "The [FAMILY] family. [PARENT 1] wrote, and [STUDENT] replied.");
  assert.equal(a.restore("The [FAMILY] family, [PARENT 1]"), "The Okonkwo family, Dana");
});

test("hyphenated names and lowercase dictation", () => {
  const a = make();
  assert.equal(a.scrub("chen-ruiz and levi stayed late"), "[PERSON 1] and [STUDENT] stayed late");
});

test("names that are ordinary words are only replaced when capitalized", () => {
  const a = make();
  assert.equal(a.scrub("Grace showed grace under pressure in the park."), "[PERSON 2] showed grace under pressure in the park.");
});

test("contact details and ids", () => {
  const a = make();
  const out = a.scrub("Reach me at dana.okonkwo@gmail.com or (949) 555-0182, 1450 Ocean View Drive. ID 20231187. See https://x.com/levi");
  assert.equal(out, "Reach me at [EMAIL] or [PHONE], [ADDRESS]. ID [NUMBER]. See [LINK]");
});

test("near-miss spellings only in dictation", () => {
  const a = make();
  assert.equal(a.scrub("Okonko stayed after class", { dictation: true }), "[FAMILY] stayed after class");
  assert.equal(a.scrub("Levy stayed", { dictation: true }), "Levy stayed"); // under five letters: too risky to guess
  assert.equal(a.scrub("Okonko stayed after class"), "Okonko stayed after class");
  assert.equal(a.scrub("Christ is risen", { dictation: true }), "Christ is risen");
});

test("restore puts names back, including possessives and odd casing", () => {
  const a = make();
  assert.equal(
    a.restore("[STUDENT]'s notebook, with [Person 1] and [STAFF 2]; [PERSON 9] too"),
    "Levi's notebook, with Maya and Steven Eno; someone too",
  );
  const deep = a.restoreDeep({ pathways: [{ name: "[STUDENT]'s Lab", steps: ["Ask [STAFF 1]"] }], n: 3 });
  assert.deepEqual(deep, { pathways: [{ name: "Levi's Lab", steps: ["Ask Mrs. Alvarez"] }], n: 3 });
});

test("scrubDeep covers every string, and the final check refuses a leak", () => {
  const a = make();
  const input = a.scrubDeep({ firstName: "Levi", observations: [{ author: "Steven Eno", text: "Levi led chapel" }] });
  assert.equal(JSON.stringify(input).includes("Levi"), false);
  assert.doesNotThrow(() => a.assertNoNames(JSON.stringify(input)));
  assert.throws(() => a.assertNoNames('{"note":"from Levi"}'), /Nothing was sent/);
});

test("preferred name is used when restoring", () => {
  const a = new Pseudonymizer({ student: { first: "Jonathan", last: "Reyes", preferred: "Jojo" } });
  assert.equal(a.scrub("Jojo Reyes (Jonathan)"), "[STUDENT] ([STUDENT])");
  assert.equal(a.restore("[STUDENT] builds"), "Jojo builds");
});

// ---- the real input builders (lib/sor/ai-input.ts)
import { inquiryInput, pathwayInput } from "../lib/sor/ai-input.ts";

const person = (id, first, last, extra = {}) => ({
  id, first_name: first, last_name: last, preferred_name: null, stage: "current", grad_year: 2028,
  current_grade: 10, is_sample: false, created_at: "2026-09-01T00:00:00Z", ...extra,
});

test("a pathway input carries no known name anywhere", () => {
  const profile = {
    person: person("p1", "Levi", "Okonkwo"),
    externalIds: [], consents: [], drafts: [], classHistory: [], sparks: [],
    admissions: {
      person_id: "p1", entry_year: 2025, entering_grade: 9, application_status: null, previous_school: "Harbor View Middle",
      interests: ["Robotics"], activities: ["Built a go-kart with my brother Sam"],
      responses: [{ question: "Tell us about you", answer: "I'm Levi Okonkwo. My mom (dana.o@gmail.com) says I fix everything. Maya Chen and I run a repair stand." }],
      imported_at: "2025-03-01T00:00:00Z",
    },
    enrollment: { person_id: "p1", grade: 10, grad_year: 2028, advisor_name: "Mrs. Alvarez", enrolled_since: null, imported_at: "" },
    courses: [{ canvas_course_id: 1, course_name: "Physics", teacher_name: "Steven Eno" }],
    evidence: [{ canvas_course_id: 1, assignment_name: "Lab 3", teacher_comment: "Great work, Levi! Help Maya next time." }],
    observations: [{ author_name: "Steven Eno", body: "Levi stayed after to help Okonkwo's lab partner, Maya.", tags: [], created_at: "2026-10-01T00:00:00Z" }],
  };
  const { input, anon } = pathwayInput(profile, [person("p1", "Levi", "Okonkwo"), person("p2", "Maya", "Chen")], "Steven Eno");
  const sent = JSON.stringify(input);
  for (const name of ["Levi", "Okonkwo", "Maya", "Chen", "Alvarez", "Steven", "Eno", "dana.o"]) {
    assert.equal(sent.includes(name), false, `${name} leaked`);
  }
  assert.equal(input.firstName, "[STUDENT]");
  assert.match(sent, /\[STUDENT\]/);
  assert.match(sent, /Harbor View Middle/); // the previous school stays: it's what makes the pathway theirs
  assert.doesNotThrow(() => anon.assertNoNames(sent));
  // A name not in our records can't be known. Documented, and visible to staff.
  assert.match(sent, /brother Sam/);
  assert.equal(anon.restore("[STUDENT] and [PERSON 1] at [STAFF 1]'s bench"), "Levi and Maya at Steven Eno's bench");
});

test("an inquiry input carries neither the child's nor the parent's name", () => {
  const { answers, context, anon } = inquiryInput({
    child_first_name: "Wren", child_last_name: "Okafor", parent_first_name: "Grace", parent_last_name: "Okafor",
    child_grade: 9, entry_year: 2027, current_school: "Paul Revere Middle School", interests: ["STEM"],
    one_thing: "Wren rewired our garage. Call me at 949-555-0100, Grace Okafor.",
  });
  const sent = JSON.stringify({ answers, context });
  for (const name of ["Wren", "Okafor", "Grace", "949"]) assert.equal(sent.includes(name), false, `${name} leaked`);
  assert.match(sent, /\[STUDENT\] would start in grade 9/);
  assert.match(sent, /\[PARENT 1\]/);
  assert.equal(anon.restore("[STUDENT]'s garage"), "Wren's garage");
});
