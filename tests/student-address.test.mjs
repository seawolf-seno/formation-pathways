import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeStudentAddress } from "../lib/sor/student-address.ts";

// Keep these cases in step with private.is_student_address, tested in
// supabase/tests/rls.test.mjs.
test("a number before the @ marks a student address", () => {
  for (const student of ["kid28@pacificachristian.org", "Sam.Ple2028@pacificachristian.org", "28sample@pacificachristian.org"])
    assert.equal(looksLikeStudentAddress(student), true, student);
  for (const staff of ["teacher@pacificachristian.org", "new.teacher@pacificachristian.org", "you+wren@pacificachristian.org"])
    assert.equal(looksLikeStudentAddress(staff), false, staff);
});

// The school's shapes: a student address ends in a two-digit number before
// the @; a teacher's is the same kind of name without it.
test("the same name with a number is a student, without is staff", () => {
  assert.equal(looksLikeStudentAddress("ssample30@pacificachristian.org"), true);
  assert.equal(looksLikeStudentAddress("ssample@pacificachristian.org"), false);
});

test("only the part before the @ counts", () => {
  assert.equal(looksLikeStudentAddress("teacher@school2.example"), false);
  for (const odd of ["", null, undefined, 28]) assert.equal(looksLikeStudentAddress(odd), false, String(odd));
});
