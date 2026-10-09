import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classesForReflection,
  latestReflections,
  reflectionsForPrompt,
  validateClassReflections,
} from "../lib/sor/class-reflections.ts";

const history = [
  { source: "blackbaud", section_id: "S-1", school_year: "2026 - 2027", course_title: "Physics", offering_type: "Academics" },
  { source: "blackbaud", section_id: "S-2", school_year: "2026 - 2027", course_title: "Ceramics", offering_type: "Arts" },
  { source: "blackbaud", section_id: "S-0", school_year: "2025 - 2026", course_title: "Biology", offering_type: "Academics" },
];
const canvas = [
  { canvas_course_id: "301", course_name: "Honors Physics" },
  { canvas_course_id: "302", course_name: "ceramics" },
  { canvas_course_id: "303", course_name: "AP Art History" },
];

test("asks about this year's classes, plus Canvas courses not already there", () => {
  assert.deepEqual(classesForReflection(canvas, history), [
    { key: "blackbaud:S-1", title: "Physics", schoolYear: "2026 - 2027", offeringType: "Academics" },
    { key: "blackbaud:S-2", title: "Ceramics", schoolYear: "2026 - 2027", offeringType: "Arts" },
    // "Honors Physics" is the Physics already listed; "AP Art History" is new.
    { key: "canvas:303", title: "AP Art History", schoolYear: "2026 - 2027", offeringType: null },
  ]);
});

test("works from Canvas alone, and from nothing", () => {
  assert.deepEqual(classesForReflection(canvas.slice(0, 1), []), [
    { key: "canvas:301", title: "Honors Physics", schoolYear: null, offeringType: null },
  ]);
  assert.deepEqual(classesForReflection([], []), []);
});

test("reflections are cleaned, capped and need at least one class", () => {
  assert.equal(validateClassReflections({}).ok, false);
  assert.equal(validateClassReflections({ classes: "Physics" }).ok, false);
  const r = validateClassReflections({
    classes: [
      { key: "blackbaud:S-1", title: " Physics ", loved: 1, liked: ["Labs", "Labs", "", 7], note: "  building the launcher ", via: "voice", score: 97 },
      { key: "blackbaud:S-1", title: "Physics again" },
      { key: "", title: "No key" },
    ],
    extra: "ignored",
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.reflections, {
    classes: [
      { key: "blackbaud:S-1", title: "Physics", schoolYear: null, loved: true, liked: ["Labs"], note: "building the launcher", via: "voice" },
    ],
  });
});

test("only the student's own classes are kept, titled from their schedule", () => {
  const allowed = classesForReflection(canvas, history);
  const r = validateClassReflections(
    {
      classes: [
        { key: "blackbaud:S-2", title: "Somebody else's name", schoolYear: "1999", loved: false },
        { key: "blackbaud:S-999", title: "Not their class", loved: true },
      ],
    },
    allowed
  );
  assert.equal(r.ok, true);
  assert.deepEqual(r.reflections.classes.map((c) => [c.key, c.title, c.schoolYear]), [["blackbaud:S-2", "Ceramics", "2026 - 2027"]]);
  assert.equal(allowed.some((c) => c.key === "canvas:301"), false);
  assert.equal(validateClassReflections({ classes: [{ key: "blackbaud:S-999", title: "x" }] }, allowed).ok, false);
});

const cls = (key, title, extra = {}) => ({ key, title, schoolYear: "2026 - 2027", loved: false, liked: [], note: "", via: "text", ...extra });

test("a later sitting replaces a class and keeps the others; loved first", () => {
  const list = latestReflections([
    { created_at: "2026-10-09", reflections: { classes: [cls("a", "Physics", { note: "new" })] } },
    { created_at: "2026-10-01", reflections: { classes: [cls("a", "Physics", { note: "old" }), cls("b", "Ceramics", { loved: true })] } },
  ]);
  assert.deepEqual(list.map((c) => [c.title, c.note]), [["Ceramics", ""], ["Physics", "new"]]);
  assert.deepEqual(latestReflections([]), []);
});

test("reflections read as first-person evidence for the prompt, with no numbers", () => {
  const text = reflectionsForPrompt([
    cls("a", "Physics", { loved: true, liked: ["Labs and hands-on work", "Solving hard problems"], note: "building the launcher from spare parts" }),
    cls("b", "Ceramics", { schoolYear: null }),
  ]);
  assert.equal(
    text,
    '- Loves Physics (2026 - 2027); what makes it good for them: Labs and hands-on work, Solving hard problems; in their words: "building the launcher from spare parts"\n- Enjoys Ceramics'
  );
});
