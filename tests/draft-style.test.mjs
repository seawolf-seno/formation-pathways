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
    ["Nothing to change here.", "Nothing to change here."],
  ];
  for (const [input, expected] of cases) assert.equal(tidyPhrasing(input), expected);
});
