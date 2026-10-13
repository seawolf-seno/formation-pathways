import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeSparks, sparkUses, sparksForPrompt, validateStudentSparks } from "../lib/sor/sparks.ts";

test("sparks are cleaned, capped and need at least one spark", () => {
  assert.equal(validateStudentSparks({}).ok, false);
  const r = validateStudentSparks({
    answers: [{ prompt: "What would you research at 2am?", text: "  how jet engines work ", via: "voice" }, { prompt: "x", text: "" }],
    picks: [{ label: "Building & tinkering", obsessed: true }, { label: "" }],
    leanings: [{ a: "Build it yourself", b: "Get everyone on the same page", choice: "Build it yourself" }, { a: "a", b: "b", choice: "c" }],
    channels: ["Veritasium", "Veritasium", " Mark Rober "],
    genres: ["Science & how things work", " Science & how things work ", ""],
    canTeach: [" replace a bike chain ", "replace a bike chain", ""],
    growing: ["speaking in front of a class"],
    extra: "ignored",
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.sparks, {
    answers: [{ prompt: "What would you research at 2am?", text: "how jet engines work", via: "voice" }],
    picks: [{ label: "Building & tinkering", obsessed: true }],
    leanings: [{ a: "Build it yourself", b: "Get everyone on the same page", choice: "Build it yourself" }],
    channels: ["Veritasium", "Mark Rober"],
    genres: ["Science & how things work"],
    canTeach: ["replace a bike chain"],
    growing: ["speaking in front of a class"],
  });
});

// The skills card asks two questions and neither is a level. A student only
// volunteers the second one if the card feels safe, so the prompt has to be
// told it's an intention before a draft reads it as a deficit to fix.
test("skills reach the prompt as the student's own claim, never as a weakness", () => {
  const text = sparksForPrompt({
    answers: [],
    picks: [],
    leanings: [],
    channels: [],
    canTeach: ["replace a bike chain"],
    growing: ["speaking in front of a class"],
  });
  assert.match(text, /could teach someone: replace a bike chain/);
  assert.match(text, /solid on/);
  assert.match(text, /Still growing on, in their words: speaking in front of a class/);
  assert.match(text, /intention and not a deficit/);
  assert.match(text, /Never call it a weakness/);
  // No rung of the Mastery Hub's ladder, and nothing a student could read as a
  // score: these two lines are words about themselves, not a placement. (The
  // bare word "rank" does appear — in the instruction never to do it.)
  assert.doesNotMatch(text, /\b(level|levels|beginning|developing|proficient|extending|score|ranked|ranking)\b/i);
});

test("mergeSparks: skills accumulate across sittings and default on older rows", () => {
  const m = mergeSparks([
    // Saved before the skills card existed: no keys at all, must not throw.
    { created_at: "2026-10-01T15:00:00Z", source: "in_person", sparks: { answers: [], picks: [], leanings: [], channels: [] } },
    { created_at: "2026-10-02T15:00:00Z", source: "in_person", sparks: { answers: [], picks: [], leanings: [], channels: [], canTeach: ["replace a bike chain"], growing: [] } },
    { created_at: "2026-10-04T20:00:00Z", source: "family_link", sparks: { answers: [], picks: [], leanings: [], channels: [], canTeach: ["true a wheel"], growing: ["speaking up"] } },
  ]);
  assert.deepEqual(m.canTeach, ["replace a bike chain", "true a wheel"]);
  assert.deepEqual(m.growing, ["speaking up"]);
});

// Sessions saved before the media step existed have no `genres` at all, and
// reading one must not throw on the person page or in a draft.
test("sparks saved without genres still read and merge", () => {
  const old = { answers: [], picks: [{ label: "Music", obsessed: false }], leanings: [], channels: [] };
  assert.doesNotMatch(sparksForPrompt(old), /fills their feed/);
  assert.deepEqual(mergeSparks([{ created_at: "2026-10-01T00:00:00Z", source: "in_person", sparks: old }]).genres, []);
});

// A feed is half chosen and half fed to them, so the prompt has to say what
// genres are worth before a draft turns "watches gaming videos" into a plan.
test("genres reach the prompt as texture, with their weakness stated", () => {
  const text = sparksForPrompt({
    answers: [{ prompt: "q", text: "a", via: "text" }],
    picks: [],
    leanings: [],
    channels: [],
    genres: ["Gaming & let's plays", "Video essays & deep dives"],
  });
  assert.match(text, /What fills their feed: Gaming & let's plays, Video essays & deep dives/);
  assert.match(text, /not what they want/);
  assert.match(text, /never build a pathway on a genre alone/);
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
  // Two picks is not a wide file; don't editorialize about shape.
  assert.doesNotMatch(text, /The shape of that/);
});

// The jack-of-all-trades case: without this the draft reads a long flat list
// as a thin file and crowns one item "their passion".
test("a wide set of picks with no obsession is named as breadth, not as a gap", () => {
  const text = sparksForPrompt({
    answers: [],
    picks: ["Music", "Being outdoors", "Welding", "Debate", "Film", "Fishing"].map((label) => ({ label, obsessed: false })),
    leanings: [],
    channels: [],
  });
  assert.match(text, /6 things tapped/);
  assert.match(text, /none of them marked an obsession/);
  assert.match(text, /not a gap in it/);
  assert.doesNotMatch(text, /obsessed with/);
});

test("many picks still reports shape when some are obsessions", () => {
  const text = sparksForPrompt({
    answers: [],
    picks: ["Music", "Welding", "Debate", "Film", "Fishing", "Robotics", "Cooking", "Running"].map((label, i) => ({
      label,
      obsessed: i === 0,
    })),
    leanings: [],
    channels: [],
  });
  assert.match(text, /8 things tapped/);
  assert.doesNotMatch(text, /none of them marked an obsession/);
});

test('"both" is kept as a real leaning and reported as both, never as a side', () => {
  const r = validateStudentSparks({
    picks: [{ label: "Music", obsessed: false }],
    leanings: [
      { a: "Quiet focus", b: "A room full of energy", choice: "" },
      { a: "Plan every step", b: "Figure it out as you go", choice: "Plan every step" },
      { a: "x", b: "y", choice: "nonsense" },
    ],
  });
  assert.equal(r.ok, true);
  // The "both" survives; only the unknown label is dropped.
  assert.deepEqual(r.sparks.leanings, [
    { a: "Quiet focus", b: "A room full of energy", choice: "" },
    { a: "Plan every step", b: "Figure it out as you go", choice: "Plan every step" },
  ]);

  const text = sparksForPrompt(r.sparks);
  assert.match(text, /would not pick a side on: Quiet focus vs A room full of energy/);
  assert.match(text, /genuinely both/);
  assert.match(text, /How they lean: Plan every step \(over Figure it out as you go\)/);
  // Must never assert a lean on the pair they refused.
  assert.doesNotMatch(text, /Quiet focus \(over/);
  assert.doesNotMatch(text, /A room full of energy \(over/);
});

const inPerson = {
  created_at: "2026-10-02T15:00:00Z",
  source: "in_person",
  sparks: {
    answers: [{ prompt: "What do you research at 2am?", text: "How old hand tools were made, and restoring old tools from estate sales.", via: "voice" }],
    picks: [{ label: "Woodworking", obsessed: false }, { label: "Music", obsessed: true }],
    leanings: [{ a: "Build", b: "Perform", choice: "Build" }],
    channels: ["Rex Krueger"],
  },
};
const atHome = {
  created_at: "2026-10-04T20:00:00Z",
  source: "family_link",
  sparks: {
    answers: [{ prompt: "What do you practice when it's boring?", text: "Bass scales.", via: "text" }],
    picks: [{ label: "Woodworking", obsessed: true }],
    leanings: [{ a: "Perform", b: "Build", choice: "Perform" }],
    channels: ["Rex Krueger", "Scott's Bass Lessons"],
  },
};

test("mergeSparks: home answers add to in-person ones; obsessed anywhere stays; newest lean wins", () => {
  const m = mergeSparks([atHome, inPerson]);
  assert.equal(m.answers.length, 2);
  assert.deepEqual(m.picks, [{ label: "Woodworking", obsessed: true }, { label: "Music", obsessed: true }]);
  assert.deepEqual(m.leanings, [{ a: "Perform", b: "Build", choice: "Perform" }]);
  assert.deepEqual(m.channels, ["Rex Krueger", "Scott's Bass Lessons"]);
  assert.equal(mergeSparks([]), null);
});

test("sparkUses: finds the hook and the ✦ steps that grew from a student's words, and nothing else", () => {
  const pathways = [
    {
      name: "Second Life for Old Tools",
      firstSemester: "Makers Space.",
      mentorArchetype: "x",
      stretchChallenge: "x",
      fourYearHorizon: [],
      hook: "restoring old tools from estate sales",
      milestones: [
        { when: "This spring", title: "A bench of your own", detail: "Makers Space.", spark: "restoring old tools" },
        { when: "Next fall", title: "Teach it", detail: "STEM Scholars.", spark: "woodworking" },
      ],
    },
    { name: "The Low End", firstSemester: "Join the jazz band and play bass.", mentorArchetype: "x", stretchChallenge: "x", fourYearHorizon: [], hook: "bass scales when it's boring" },
  ];
  assert.deepEqual(sparkUses(inPerson.sparks.answers[0].text, pathways), [
    { pathway: "Second Life for Old Tools", where: "grows from it" },
    { pathway: "Second Life for Old Tools", where: "This spring: A bench of your own" },
  ]);
  assert.deepEqual(sparkUses("Woodworking", pathways, { short: true }), [
    { pathway: "Second Life for Old Tools", where: "Next fall: Teach it" },
  ]);
  assert.deepEqual(sparkUses("Bass scales.", pathways), [{ pathway: "The Low End", where: "grows from it" }]);
  assert.deepEqual(sparkUses("Rex Krueger", pathways, { short: true }), []);
  assert.deepEqual(sparkUses("Music", pathways, { short: true }), []);
});
