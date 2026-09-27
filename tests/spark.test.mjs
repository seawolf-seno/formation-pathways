import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_NOTE_LENGTH,
  formatSparkContext,
  parseChoiceLines,
  parseVocabLines,
  validateSparkResponse,
} from "../lib/spark.ts";

// This is the app's one public write path, so the validator is the security
// boundary: everything it accepts must be safe to store and hand to Claude.
const interests = parseVocabLines("Building & tinkering|🛠️\nMusic|🎵\nLeading a team|🧭\nMaking art|🎨\nDebating ideas|💬\nBeing outdoors|🌲\nPerforming|🎭");
const pairs = parseChoiceLines("Build it yourself|Get everyone on the same page\nQuiet focus|A room full of energy");

test("parses vocab and choice files, skipping blank lines", () => {
  assert.deepEqual(interests[0], { label: "Building & tinkering", emoji: "🛠️" });
  assert.equal(parseVocabLines("\n\n").length, 0);
  assert.deepEqual(pairs[0], { a: "Build it yourself", b: "Get everyone on the same page" });
});

test("accepts a well-formed response", () => {
  const r = validateSparkResponse(
    { interests: ["Music", "Making art", "Debating ideas"], choices: ["Build it yourself", "Quiet focus"], note: "hi" },
    interests, pairs
  );
  assert.deepEqual(r.interests, ["Music", "Making art", "Debating ideas"]);
  assert.equal(r.note, "hi");
});

test("rejects unknown interest labels instead of storing them", () => {
  const r = validateSparkResponse(
    { interests: ["Music", "Making art", "Debating ideas", "<script>alert(1)</script>"], choices: ["Build it yourself", "Quiet focus"], note: null },
    interests, pairs
  );
  assert.ok(!r.interests.includes("<script>alert(1)</script>"));
});

test("requires at least MIN_INTERESTS", () => {
  assert.throws(() => validateSparkResponse({ interests: ["Music"], choices: ["Build it yourself", "Quiet focus"] }, interests, pairs));
});

test("caps at MAX_INTERESTS even if more are sent", () => {
  assert.throws(() =>
    validateSparkResponse(
      { interests: ["Building & tinkering", "Music", "Leading a team", "Making art", "Debating ideas", "Being outdoors", "Performing"], choices: ["Build it yourself", "Quiet focus"] },
      interests, pairs
    )
  );
});

test("rejects a choice value not in its own pair", () => {
  assert.throws(() =>
    validateSparkResponse({ interests: ["Music", "Making art", "Debating ideas"], choices: ["Build it yourself", "Something else"] }, interests, pairs)
  );
});

test("rejects a missing or wrong-length choices array", () => {
  assert.throws(() => validateSparkResponse({ interests: ["Music", "Making art", "Debating ideas"], choices: ["Build it yourself"] }, interests, pairs));
});

test("note is optional and truncated, never thrown on", () => {
  const r = validateSparkResponse({ interests: ["Music", "Making art", "Debating ideas"], choices: ["Build it yourself", "Quiet focus"], note: "x".repeat(1000) }, interests, pairs);
  assert.equal(r.note.length, MAX_NOTE_LENGTH);
  const r2 = validateSparkResponse({ interests: ["Music", "Making art", "Debating ideas"], choices: ["Build it yourself", "Quiet focus"] }, interests, pairs);
  assert.equal(r2.note, null);
});

test("garbage input throws rather than storing anything", () => {
  assert.throws(() => validateSparkResponse(null, interests, pairs));
  assert.throws(() => validateSparkResponse("nope", interests, pairs));
  assert.throws(() => validateSparkResponse({}, interests, pairs));
});

test("context block is plain language and never invents data", () => {
  const ctx = formatSparkContext({ interests: ["Music", "Making art"], choices: ["Build it yourself"], note: "loves drums" }, pairs);
  assert.ok(ctx.includes("Music, Making art"));
  assert.ok(ctx.includes('"Build it yourself" over "Get everyone on the same page"'));
  assert.ok(ctx.includes("loves drums"));
});

test("context still works with no choices and no note", () => {
  const ctx = formatSparkContext({ interests: ["Music"], choices: [], note: null }, pairs);
  assert.ok(ctx.includes("Music"));
  assert.ok(!ctx.includes("null"));
});
