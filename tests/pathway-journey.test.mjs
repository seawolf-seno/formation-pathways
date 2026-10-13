import { test } from "node:test";
import assert from "node:assert/strict";
import { journeyFor, sanitizeGlimpse, sanitizeMilestones, withJourneyFields } from "../lib/pathway-journey.ts";

const base = {
  name: "The Fixer",
  firstSemester: "Emma starts in STEM Scholars. She builds in the Makers Space.",
  mentorArchetype: "Dr. David Sumida (Engineering) — teaches in STEM Scholars.",
  stretchChallenge: "Presenting an unfinished build to a room of people.",
  fourYearHorizon: ["an engineering research track", "a robotics apprenticeship"],
};

test("a pathway's own milestones are used, trimmed and capped", () => {
  const j = journeyFor({
    ...base,
    milestones: [
      { when: " Freshman fall ", title: "Open it up", detail: "Makers Space." },
      { when: "Sophomore year", title: "Build for someone", detail: "x".repeat(900) },
      { when: "Junior year", title: "Show it early", detail: "Present unfinished." },
      { when: "Senior year", title: "Launch", detail: "Toward research." },
    ],
  });
  assert.equal(j.derived, false);
  assert.equal(j.milestones.length, 4);
  assert.equal(j.milestones[0].when, "Freshman fall");
  assert.equal(j.milestones[1].detail.length, 400);
});

test("without milestones, four gentle steps are derived from the classic fields", () => {
  const j = journeyFor(base);
  assert.equal(j.derived, true);
  assert.deepEqual(j.milestones.map((m) => m.when), ["First semester", "Freshman & sophomore years", "Junior year", "Senior year"]);
  assert.equal(j.milestones[1].title, "Find your people in Engineering");
  assert.equal(j.milestones[2].detail, base.stretchChallenge);
  assert.match(j.milestones[3].detail, /one of these roads/);
});

test("a current student's derived steps start from now, not freshman year", () => {
  assert.deepEqual(journeyFor(base, "student").milestones.map((m) => m.when), ["Next semester", "This year", "Next year", "Before graduation"]);
});

test("malformed or too few milestones are dropped, not half-shown", () => {
  assert.equal(sanitizeMilestones("nope"), undefined);
  assert.equal(sanitizeMilestones([{ when: "a", title: "b", detail: "c" }, { when: "", title: "b", detail: "c" }, null]), undefined);
  assert.equal(journeyFor({ ...base, milestones: [{ when: "a", title: "b", detail: "c" }] }).derived, true);
});

test("generator output keeps only known fields, and empty glimpses vanish", () => {
  const p = withJourneyFields({ ...base, glimpse: "   ", milestones: [], extra: "dropped" });
  assert.deepEqual(Object.keys(p).sort(), ["firstSemester", "fourYearHorizon", "mentorArchetype", "name", "stretchChallenge"]);
  assert.equal(sanitizeGlimpse("  Picture a Thursday.  "), "Picture a Thursday.");
  assert.equal(sanitizeGlimpse("x".repeat(900)).length, 600);
});

test("a milestone keeps the student's spark thread, trimmed and optional", async () => {
  const { sanitizeMilestones } = await import("../lib/pathway-journey.ts");
  const steps = sanitizeMilestones([
    { when: "This spring", title: "Join the build team", detail: "Start in the Makers Space.", spark: "  restoring old tools  " },
    { when: "Next fall", title: "Lead a fix-it night", detail: "Host one for the neighborhood.", spark: "" },
    { when: "Senior year", title: "Restore something big", detail: "A capstone you choose." },
  ]);
  assert.equal(steps[0].spark, "restoring old tools");
  assert.ok(!("spark" in steps[1]));
  assert.ok(!("spark" in steps[2]));
});

test("hook and why-now are kept, trimmed, and a why-now never stands without its source", async () => {
  const { sanitizeUniqueness, countWord } = await import("../lib/pathway-journey.ts");
  assert.deepEqual(
    withJourneyFields({ ...base, hook: "  the bike shop at my uncle's garage ", whyNow: "Founders are building on-device AI.", whyNowSource: "TBPN · Oct 5, 2026" }),
    { ...base, hook: "the bike shop at my uncle's garage", whyNow: "Founders are building on-device AI.", whyNowSource: "TBPN · Oct 5, 2026" }
  );
  assert.deepEqual(sanitizeUniqueness({ whyNow: "An unsourced claim about the world." }), {});
  assert.deepEqual(sanitizeUniqueness({ hook: "x".repeat(400) }).hook.length, 160);
  assert.equal(countWord(6), "Six");
  assert.equal(countWord(12), "12");
});

// "Clear skill levels" was the ask (Fizzy #16); principle #2 forbids scoring a
// student. The resolution is a stage, not a rank: where they already stand,
// counted in things they actually did, with no scale to be anywhere on.
test("a starting point survives as a stage, and is dropped when it arrives as a rank", async () => {
  const { sanitizeStartingPoint, STARTING_POINT_MAX } = await import("../lib/pathway-journey.ts");

  // Counts of real work are the whole point, so digits alone must not trip it.
  for (const ok of [
    "You have rebuilt two bikes start to finish, including truing the wheels.",
    "You have run the sound board for three school productions.",
    "You weld at your uncle's shop most weekends.",
    "You have kept the tide pool log for two seasons.",
  ]) {
    assert.equal(sanitizeStartingPoint(ok), ok, `dropped a legitimate stage: ${ok}`);
  }

  for (const scored of [
    "Level 2 of 4 on fabrication.",
    "You are at stage 3 in this skill.",
    "Welding: 7 out of 10.",
    "Fabrication 3/5, design 2/5.",
    "About 80% of the way to independent work.",
    "Scored above most sophomores on lab technique.",
    "Ranked near the top of her class in debate.",
    "Holding a B+ average in the shop elective.",
    "Her percentile on practice sets is climbing.",
  ]) {
    assert.equal(sanitizeStartingPoint(scored), undefined, `kept a rank: ${scored}`);
  }

  assert.equal(sanitizeStartingPoint("  spaced   out  text  "), "spaced out text");
  assert.equal(sanitizeStartingPoint("x".repeat(400)).length, STARTING_POINT_MAX);
  assert.equal(sanitizeStartingPoint(""), undefined);
  assert.equal(sanitizeStartingPoint(undefined), undefined);
  assert.equal(sanitizeStartingPoint(3), undefined);
});

// withJourneyFields rebuilds a pathway field by field, so anything it does not
// name is silently dropped. That is what makes a new optional field easy to
// add to the type and still never reach the page.
test("a starting point survives the pathway rebuild, and a scored one does not", () => {
  const kept = withJourneyFields({ ...base, startingPoint: "You have rebuilt two bikes start to finish." });
  assert.equal(kept.startingPoint, "You have rebuilt two bikes start to finish.");
  const dropped = withJourneyFields({ ...base, startingPoint: "Level 3 of 5." });
  assert.ok(!("startingPoint" in dropped), "a scored starting point reached the pathway");
  assert.deepEqual(withJourneyFields({ ...base }), base, "an absent starting point invented one");
});
