import { test } from "node:test";
import assert from "node:assert/strict";
import { tidyPhrasing } from "../lib/draft-style.ts";

test("the banned contrast and emphasis tics come out, the meaning stays", () => {
  const cases = [
    ["Make the repair work audible, not just visible.", "Make the repair work audible."],
    ["Volunteer to facilitate — not just participate in — a small-group discussion.", "Volunteer to facilitate a small-group discussion."],
    ["A teardown that explains not just how the object works but why someone designed it.", "A teardown that explains how the object works and why someone designed it."],
    ["Defend not just an idea, but also why it works.", "Defend an idea and why it works."],
    ["It examines exactly the design decisions that lasted.", "It examines the design decisions that lasted."],
    ["That is exactly what seminar is for.", "That is what seminar is for."],
    ["Deliver a ten-minute chapel talk — not a performance, not a testimony, but a philosophical argument — making the case.", "Deliver a ten-minute chapel talk — a philosophical argument — making the case."],
    ["Someone laughs — not cruelly, but recognizing something.", "Someone laughs — recognizing something."],
    ["Bring that question after class, not to get an answer but to find out whose question it is.", "Bring that question after class, to find out whose question it is."],
    ["It became the default phone — not because it was flashy, but because someone solved a hard problem.", "It became the default phone — because someone solved a hard problem."],
    ["She did not stop but kept going.", "She did not stop but kept going."],
    ["Read it, not only for facts but also for tone.", "Read it, not only for facts but also for tone."],
    ["Nothing to change here.", "Nothing to change here."],
  ];
  for (const [input, expected] of cases) assert.equal(tidyPhrasing(input), expected);
});
