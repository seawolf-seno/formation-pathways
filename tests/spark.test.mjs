import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_INTERESTS,
  MAX_NOTE_LENGTH,
  formatSparkContext,
  parseChoiceLines,
  parseVocabLines,
  validateSparkResponse,
} from "../lib/spark.ts";

// This is the app's one public write path, so the validator is the security
// boundary: everything it accepts must be safe to store and hand to Claude.
const interests = parseVocabLines(
  "Building & tinkering|🛠️\nMusic|🎵\nLeading a team|🧭\nMaking art|🎨\nDebating ideas|💬\nBeing outdoors|🌲\nPerforming|🎭\nNumbers & patterns|🔢\nFaith & big questions|🕊️\nSports|🏆\nScience experiments|🧪\nFixing what's broken|🔧"
);
const allLabels = interests.map((o) => o.label);
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

// A jack-of-all-trades must be able to say so: well past MIN_INTERESTS is a
// real answer, not an error, and nothing may be silently dropped.
test("accepts a wide pick far above the minimum, keeping every one", () => {
  const wide = allLabels.slice(0, MAX_INTERESTS);
  const r = validateSparkResponse(
    { interests: wide, choices: ["Build it yourself", "Quiet focus"] },
    interests, pairs
  );
  assert.deepEqual(r.interests, wide);
});

test("caps at MAX_INTERESTS even if more are sent", () => {
  assert.ok(allLabels.length > MAX_INTERESTS, "need a vocabulary bigger than the cap to test it");
  assert.throws(() =>
    validateSparkResponse(
      { interests: allLabels, choices: ["Build it yourself", "Quiet focus"] },
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

test("accepts null for a pair the student would not split, as a real answer", () => {
  const r = validateSparkResponse(
    { interests: ["Music", "Making art", "Debating ideas"], choices: [null, "Quiet focus"] },
    interests, pairs
  );
  assert.deepEqual(r.choices, [null, "Quiet focus"]);
});

test("a refused pair is reported as both, never as a preference or as missing", () => {
  const ctx = formatSparkContext(
    { interests: ["Music", "Making art"], choices: [null, "Quiet focus"], note: null },
    pairs
  );
  // Must not claim a lean on the pair they refused.
  assert.ok(!ctx.includes('"Build it yourself" over'));
  assert.ok(!ctx.includes('"Get everyone on the same page" over'));
  // Must say both sides of it, explicitly as "both".
  assert.ok(ctx.includes('"Build it yourself" vs "Get everyone on the same page"'));
  assert.ok(ctx.includes("both"));
  // The pair they did answer is still reported normally.
  assert.ok(ctx.includes('"Quiet focus" over "A room full of energy"'));
  assert.ok(!ctx.includes("null"));
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

// Without this the wide-evidence branch of prompts/unique-pathways.txt can
// never fire for an applicant: a long list reads just like a short one.
test("context names the breadth when the answer is wide, and stays quiet when it isn't", () => {
  const wide = formatSparkContext(
    { interests: allLabels.slice(0, 8), choices: [null, null], note: null },
    pairs
  );
  assert.ok(wide.includes("gave 8"));
  assert.ok(wide.includes("not a gap"));

  const narrow = formatSparkContext(
    { interests: ["Music", "Making art", "Debating ideas"], choices: ["Build it yourself", "Quiet focus"], note: null },
    pairs
  );
  assert.ok(!narrow.includes("not a gap"));
});

test("context still works with no choices and no note", () => {
  const ctx = formatSparkContext({ interests: ["Music"], choices: [], note: null }, pairs);
  assert.ok(ctx.includes("Music"));
  assert.ok(!ctx.includes("null"));
});
