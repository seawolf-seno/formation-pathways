import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

// What a signed-in student saves on their own Study Hub (/study). These read
// the source, so a new student action can't skip the sign-in check or start
// taking "whose row is this" from the browser by accident.
const read = (f) => fs.readFileSync(path.join(import.meta.dirname, "..", f), "utf8");
const actions = read("lib/sor/student-actions.ts");
const parts = actions.split(/^export async function /m).slice(1);

test("every student action starts from the signed-in student", () => {
  assert.ok(parts.length >= 2, "found the actions");
  for (const part of parts) {
    const name = part.match(/^[A-Za-z0-9_]+/)[0];
    assert.match(part, /^[^{]*\{\s*try \{\s*const student = await requireStudent\(\);/, `${name}: start with requireStudent()`);
    assert.match(part, /person_id: student\.personId/, `${name}: the row belongs to the signed-in student`);
    assert.doesNotMatch(part.split("{")[0], /personId/i, `${name}: never take the student from the browser`);
  }
});

test("a student's row is saved with no staff member recorded", () => {
  for (const part of parts) assert.match(part, /created_by: null/);
  assert.doesNotMatch(actions, /requireStaff|requireActingStaff|logAccess/, "staff checks belong in lib/sor/actions.ts");
});

test("the student pages ask who is signed in before reading anything", () => {
  for (const f of ["app/study/layout.tsx", "app/study/page.tsx", "app/study/classes/page.tsx"]) {
    assert.match(read(f), /const student = await requireStudent\(\);/, f);
  }
  assert.match(read("proxy.ts"), /SOR_PREFIXES = \[[^\]]*"\/study"/, "signed-out visitors to /study go to sign-in");
});

test("approved links reach a student only through the function that leaves out who suggested them", () => {
  const reads = read("lib/sor/student-study.ts");
  assert.match(reads, /rpc\("class_links_for_student"\)/);
  // The one direct read of class_resources is the student's own waiting rows.
  const direct = reads.match(/from\("class_resources"\)[^\n]*/g) ?? [];
  assert.equal(direct.length, 1);
  assert.match(direct[0], /\.eq\("person_id", personId\)\.eq\("status", "pending"\)/);
});
