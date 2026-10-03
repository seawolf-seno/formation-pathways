import { test } from "node:test";
import assert from "node:assert/strict";
import { mapBlackbaudUser } from "../lib/sor/importers/blackbaud.ts";

test("the extended record's student_info gives grade and class year", () => {
  const { record, missing } = mapBlackbaudUser({
    id: 7677206, first_name: "Should", last_name: "NotMatter", preferred_name: "Sam",
    student_info: { id: 1, grad_year: "2028", grade_level: "10", grade_level_description: "10th Grade" },
  });
  assert.equal(record.externalId, "7677206");
  assert.equal(record.grade, 10);
  assert.equal(record.gradYear, 2028);
  assert.equal(record.preferredName, "Sam");
  assert.deepEqual(missing, []);
});

test("a grade written as a description still maps", () => {
  assert.equal(mapBlackbaudUser({ id: 1, student_info: { grade_level_description: "Grade 9" } }).record.grade, 9);
  assert.equal(mapBlackbaudUser({ id: 1, student_info: { grade_level: "12th Grade" } }).record.grade, 12);
});

test("the basic record (no student_info) reports grade and class year missing", () => {
  const { record, missing } = mapBlackbaudUser({ id: 2, first_name: "A", nick_name: "B" });
  assert.equal(record.grade, null);
  assert.deepEqual(missing, ["grade", "gradYear"]);
});
