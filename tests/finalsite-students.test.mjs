import { test } from "node:test";
import assert from "node:assert/strict";
import { mapFinalsiteStudent } from "../lib/sor/importers/finalsite-api.ts";

const contact = {
  id: "00000000-0000-0000-0000-000000acb123",
  first_name: "Should", last_name: "NotBeKept", email: "x@example.com", birth_date: "2010-06-01",
  status: "enrolled",
  previous_school_1: "Bishop Garriga Middle School",
  financial_aid_amount: "9000.00",
  prospect_entry_year: { name: "2025-2026", start_year: 2025 },
  prospect_entry_grade: { name: "9th", long_name: "9th Grade" },
  custom_attributes: [
    { field_name: "application_essay_1", field_display_name: "Tell us about a time you felt brave", value: "  I rebuilt my brother's RC car.  " },
    { field_name: "bsr_stdnt_q_2", field_display_name: "", value: "Robotics and choir" },
    { field_name: "inquiry_interests", value: "Robotics; Choir" },
    { field_name: "sports_inquiry_interests_ms", value: ["Cross Country", "Choir"] },
    { field_name: "bsr_prnt_q_1_txt", value: "Parent's words about family" },
    { field_name: "family_income_cur", value: "120000" },
    { field_name: "race_ms", value: "x" },
    { field_name: "gpa_num", value: "3.9" },
    { field_name: "bsr_family_circumstances_txt", value: "private" },
  ],
};

test("a pilot student's Finalsite contact keeps only the agreed fields", () => {
  const r = mapFinalsiteStudent(contact);
  assert.deepEqual(r, {
    contactId: "00000000-0000-0000-0000-000000acb123",
    entryYear: 2025,
    enteringGrade: 9,
    status: "enrolled",
    previousSchool: "Bishop Garriga Middle School",
    interests: ["Robotics", "Choir", "Cross Country"],
    responses: [
      { question: "Tell us about a time you felt brave", answer: "I rebuilt my brother's RC car." },
      { question: "bsr_stdnt_q_2", answer: "Robotics and choir" },
    ],
  });
  const text = JSON.stringify(r);
  for (const leaked of ["Parent's words", "120000", "3.9", "private", "x@example.com", "2010-06-01", "9000"]) {
    assert.ok(!text.includes(leaked), `must not import: ${leaked}`);
  }
});

test("missing fields map to empty, not errors", () => {
  assert.deepEqual(mapFinalsiteStudent({ id: 7 }), {
    contactId: "7", entryYear: null, enteringGrade: null, status: null, previousSchool: null, interests: [], responses: [],
  });
});
