import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPublicShareContent,
  parsePublicShareContent,
  publicProgramLine,
  splitSentences,
} from "../lib/share.ts";

// Guardrails for the only data that ever reaches the public web. `npm run test:share`
const pathways = [
  {
    name: "The Fixer",
    firstSemester:
      'Emma starts in STEM Scholars, where "not being afraid to open something up" becomes her Makers Space project. She joins Drone Club.',
    mentorArchetype:
      "Dr. David Sumida (Engineering) — teaches in the STEM Scholars program, home to the Makers Space.",
    stretchChallenge: "Present an unfinished build to a room of people.",
    fourYearHorizon: ["research track", "apprenticeship", "startup", "extra fourth"],
  },
];
const base = { pathwayIndex: 0, highlightIndex: 0, includeStretch: false, includeHorizon: false, includeProgram: false };

test("first name only, never the last name", () => {
  const c = buildPublicShareContent("Emma Reyes", pathways, base);
  assert.equal(c.firstName, "Emma");
  assert.ok(!JSON.stringify(c).includes("Reyes"));
});

test("mentor name never appears, only the department", () => {
  const c = buildPublicShareContent("Emma Reyes", pathways, { ...base, includeProgram: true });
  assert.equal(c.program, "Engineering");
  assert.ok(!JSON.stringify(c).includes("Sumida"));
});

test("optional fields are null unless the family opts in", () => {
  const c = buildPublicShareContent("Emma Reyes", pathways, base);
  assert.equal(c.stretchChallenge, null);
  assert.equal(c.horizon, null);
  assert.equal(c.program, null);
});

test("horizon is capped at three routes", () => {
  const c = buildPublicShareContent("Emma Reyes", pathways, { ...base, includeHorizon: true });
  assert.equal(c.horizon.length, 3);
});

test("only the chosen highlight sentence is included", () => {
  const c = buildPublicShareContent("Emma Reyes", pathways, { ...base, highlightIndex: 1 });
  assert.equal(c.highlight, "She joins Drone Club.");
});

test("out-of-range selections are rejected", () => {
  assert.throws(() => buildPublicShareContent("Emma Reyes", pathways, { ...base, pathwayIndex: 5 }));
  assert.throws(() => buildPublicShareContent("Emma Reyes", pathways, { ...base, highlightIndex: 9 }));
});

test("parsing stored content drops unknown keys, so extra fields can't leak", () => {
  const parsed = parsePublicShareContent({
    firstName: "Emma", pathwayName: "The Fixer", highlight: "Hi.",
    lastName: "Reyes", essay: "private", token: "x",
  });
  assert.deepEqual(Object.keys(parsed).sort(), ["firstName", "highlight", "horizon", "pathwayName", "program", "stretchChallenge"]);
  assert.equal(parsePublicShareContent({ firstName: "Emma" }), null);
  assert.equal(parsePublicShareContent("nope"), null);
});

test("helpers", () => {
  assert.equal(publicProgramLine("no parentheses here"), null);
  assert.deepEqual(splitSentences("One. Two!"), ["One.", "Two!"]);
});
