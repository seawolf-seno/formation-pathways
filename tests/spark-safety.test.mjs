import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

/**
 * Card #16: "students should feel safe enough to be honest." A teenager decides
 * how honest to be before the first question, so two things have to be true of
 * every surface where they answer: they are told who reads it, and they can
 * take an answer back. Both live in copy and small handlers, which is exactly
 * the kind of thing a later refactor drops without noticing.
 */

const read = (p) => fs.readFileSync(p, "utf-8");
/** Only what a student could actually see. The comments above this copy say the
 *  same words, and a test that passes because of a comment is worthless. */
const copy = (p) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/** Every place a student types or taps an answer into Spark. */
const ENTRIES = [
  "components/sor/SparkSky.tsx", // in person, and the at-home family link
  "components/sor/SparkLab.tsx", // two formats back to back; skips SparkSky's intro
  "components/SparkSurvey.tsx", // the applicant's quick spark
];

test("every Spark surface tells the student who reads it", () => {
  for (const file of ENTRIES) {
    const src = copy(file);
    assert.match(src, /reads this|read your sparks/, `${file} never says who reads it`);
    assert.match(src, /graded|scored/, `${file} never says it isn't graded or scored`);
  }
});

test("the audience is named before the first question, not after the last", () => {
  // In SparkSky the claim belongs to the intro step, which is the screen before
  // any question. If it drifted into the reveal it would be an apology, not a
  // choice the student got to make.
  const sky = copy("components/sor/SparkSky.tsx");
  const intro = sky.indexOf('step === "intro"');
  const ask = sky.indexOf('step === "ask"');
  const who = sky.indexOf("read your sparks");
  assert.ok(intro > 0 && ask > intro, "SparkSky's intro and ask steps moved");
  assert.ok(who > intro && who < ask, "the audience line is no longer on the intro step");
});

test("an answer can be taken back on every step that keeps one", () => {
  const sky = copy("components/sor/SparkSky.tsx");
  // Open questions and either/or pairs both append, so both need a way back.
  // Without these, a student who says the real thing cannot unsay it.
  assert.match(sky, /function goBack\(\)/, "no way back from an open question");
  assert.match(sky, /function leanBack\(\)/, "no way back from an either/or pair");
  // goBack has to pull the answer out of the sky, not just change the question.
  const body = sky.slice(sky.indexOf("function goBack()"), sky.indexOf("function toggleMic()"));
  assert.match(body, /setAnswers/, "goBack leaves the old answer in the sky");
  assert.match(body, /setDraft/, "goBack doesn't put the answer back in the box to edit");
});

test("skipping a question is offered, not just allowed", () => {
  for (const file of [...ENTRIES, "components/sor/SparkStarters.tsx", "components/sor/SparkSwipe.tsx"]) {
    const src = read(file);
    assert.match(src, /Skip/, `${file} offers no way to skip`);
  }
});
