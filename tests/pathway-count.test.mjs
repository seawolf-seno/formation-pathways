import { test } from "node:test";
import assert from "node:assert/strict";
import { pathwayMaxTokens, renderPathwayCount, whyNowMax } from "../lib/pathway-count.ts";
import { audienceForStage, PATHWAY_PLAN } from "../lib/types.ts";
import fs from "node:fs";

const prompts = ["unique-pathways.txt", "ruakh-today.txt", "admissions-pathways.txt"].map((f) => fs.readFileSync(`prompts/${f}`, "utf-8")).join("\n");

test("two for an inquiry, three for an application, six for a current student", () => {
  assert.equal(PATHWAY_PLAN.inquiry.draft, 2);
  assert.equal(PATHWAY_PLAN.application.draft, 3);
  assert.equal(PATHWAY_PLAN.student.draft, 6);
  assert.equal(audienceForStage("applicant"), "application");
  assert.equal(audienceForStage("admitted"), "application");
  assert.equal(audienceForStage("enrolled"), "student");
});

test("every count renders with no token left and the right number", () => {
  for (const [n, upper] of [[2, "TWO"], [3, "THREE"], [6, "SIX"]]) {
    const text = renderPathwayCount(prompts, n);
    assert.equal(/\{\{[A-Z_]+\}\}/.test(text), false, `token left for ${n}`);
    assert.match(text, new RegExp(`Write exactly ${upper} pathways`));
    assert.doesNotMatch(text, n === 6 ? /exactly (TWO|THREE) / : /\bSIX\b|\bsix pathways\b/);
  }
});

test("rules shrink with the count", () => {
  assert.match(renderPathwayCount("{{COMBO_RULE}}", 6), /At least two/);
  assert.match(renderPathwayCount("{{FIELD_RULE}}", 2), /No two pathways may share/);
  assert.deepEqual([2, 3, 6].map(whyNowMax), [1, 2, 3]);
  assert.equal(pathwayMaxTokens(6), 9000);
  assert.ok(pathwayMaxTokens(2) < 4000);
});
