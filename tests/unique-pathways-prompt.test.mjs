import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { renderPathwayCount } from "../lib/pathway-count.ts";

const raw = fs.readFileSync("prompts/unique-pathways.txt", "utf-8");
// The counts in lib/types.ts PATHWAY_PLAN: inquiry, application, student.
const COUNTS = [2, 3, 6];

test("the prompt renders with no placeholder left behind at every pathway count", () => {
  for (const n of COUNTS) {
    const left = renderPathwayCount(raw, n).match(/\{\{[A-Z_]+\}\}/g) ?? [];
    assert.deepEqual(left, [], `count ${n} left ${left.join(", ")} unreplaced`);
  }
});

// A generalist's file used to fall through to the thin-evidence rule, whose
// instruction is literally "zero in harder, not wider" — which is how one of
// nine interests got promoted to "their passion". The wide branch is the fix,
// so losing it silently would bring the bug back.
test("the wide-evidence branch survives rendering at every count", () => {
  for (const n of COUNTS) {
    const t = renderPathwayCount(raw, n);
    assert.match(t, /WIDE, NOT THIN/, `count ${n} lost the wide-evidence branch`);
    assert.match(t, /Never tell this student to narrow down/, `count ${n} lost the no-narrowing rule`);
    assert.match(t, /pattern across several of their interests/, `count ${n} lost the pattern-hook rule`);
  }
});

// The wide branch tells the model to prefer combination hooks "staying inside
// the per-interest cap in Step 2". It first said "up to the limit set above",
// which pointed at a rule 20 lines BELOW it, and called a minimum a limit.
test("the wide branch's cross-reference points at a rule that exists, and in the right direction", () => {
  for (const n of COUNTS) {
    const t = renderPathwayCount(raw, n);
    const ref = t.indexOf("per-interest cap in Step 2");
    assert.notEqual(ref, -1, `count ${n}: the combination-hook rule lost its cross-reference`);
    const step2 = t.indexOf("STEP 2");
    assert.notEqual(step2, -1, `count ${n}: there is no Step 2 to point at`);
    assert.ok(step2 > ref, `count ${n}: Step 2 is above the clause that calls it "in Step 2"`);
    // And the cap it points at must actually be a number by now.
    // The cap wraps across lines in the prompt, so allow the line break.
    assert.match(t.slice(step2), /may carry more than\s+(one|two|three|four|five|six)\s+of the (two|three|six)\b/);
  }
});

// Nothing may tell a student who is into many things to pick one.
test("no rendering of the prompt tells the student to narrow or specialise", () => {
  const BAD = /\b(pick a lane|narrow it down|choose just one|settle on one|focus on just one)\b/i;
  for (const n of COUNTS) {
    const t = renderPathwayCount(raw, n);
    // The one allowed mention is the rule forbidding it.
    const lines = t.split("\n").filter((l) => BAD.test(l) && !/Never tell this student/.test(l));
    assert.deepEqual(lines, [], `count ${n}: ${lines.join(" | ")}`);
  }
});
