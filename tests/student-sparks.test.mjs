import { test } from "node:test";
import assert from "node:assert/strict";
import { sparksForPrompt, validateStudentSparks } from "../lib/sor/sparks.ts";

test("sparks are cleaned, capped and need at least one spark", () => {
  assert.equal(validateStudentSparks({}).ok, false);
  const r = validateStudentSparks({
    answers: [{ prompt: "What would you research at 2am?", text: "  how jet engines work ", via: "voice" }, { prompt: "x", text: "" }],
    picks: [{ label: "Building & tinkering", obsessed: true }, { label: "" }],
    leanings: [{ a: "Build it yourself", b: "Get everyone on the same page", choice: "Build it yourself" }, { a: "a", b: "b", choice: "c" }],
    channels: ["Veritasium", "Veritasium", " Mark Rober "],
    extra: "ignored",
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.sparks, {
    answers: [{ prompt: "What would you research at 2am?", text: "how jet engines work", via: "voice" }],
    picks: [{ label: "Building & tinkering", obsessed: true }],
    leanings: [{ a: "Build it yourself", b: "Get everyone on the same page", choice: "Build it yourself" }],
    channels: ["Veritasium", "Mark Rober"],
  });
});

test("sparks read as first-person evidence for the prompt", () => {
  const text = sparksForPrompt({
    answers: [{ prompt: "What would you do with a free Saturday?", text: "fix bikes with my cousin", via: "text" }],
    picks: [{ label: "Music", obsessed: true }, { label: "Being outdoors", obsessed: false }],
    leanings: [{ a: "Plan every step", b: "Figure it out as you go", choice: "Figure it out as you go" }],
    channels: ["Mark Rober"],
  });
  assert.match(text, /fix bikes with my cousin/);
  assert.match(text, /obsessed with: Music/);
  assert.match(text, /Figure it out as you go \(over Plan every step\)/);
  assert.match(text, /Mark Rober/);
});
