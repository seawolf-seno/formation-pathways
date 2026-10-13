import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStemSummary, nextStemPeriod, safeStemUrl, stemDate } from "../lib/stem.ts";
import { pathwayInput } from "../lib/sor/ai-input.ts";

const member = { person_id: "one", status: "active", created_at: "2026-01-01T12:00:00Z" };
test("biweekly cadence is anchored to enrollment and deduplicates existing periods", () => {
  assert.deepEqual(nextStemPeriod(member, [], "2026-01-14"), { start: "2026-01-01", end: "2026-01-15", due: false });
  assert.equal(nextStemPeriod(member, [], "2026-01-15").due, true);
  const work = [{ person_id: "one", kind: "summary", period_end: "2026-01-15" }, { person_id: "other", kind: "summary", period_end: "2030-01-15" }];
  assert.deepEqual(nextStemPeriod(member, work, "2026-01-20"), { start: "2026-01-15", end: "2026-01-29", due: false });
  assert.equal(nextStemPeriod({ ...member, status: "paused" }, [], "2026-02-15").due, false);
});
test("summary keeps private notes and other students out, includes next steps and open opportunities", () => {
  const program = { requirements: ["Build", "Reflect"], approved_at: null };
  const work = [
    { person_id: "one", kind: "project", title: "Filter", body: "Tried a material", next_step: "Test the prototype", due_date: "2026-01-20", status: "active", updated_at: "2026-01-10" },
    { person_id: "one", kind: "meeting", title: "Mentor meeting", body: "PRIVATE NOTES", next_step: "Bring your prototype", status: "active" },
    { person_id: "one", kind: "evidence", requirement: "Build", approved_at: "2026-01-10" },
    { person_id: "other", kind: "project", title: "OTHER STUDENT", body: "OTHER WORK", updated_at: "2026-01-10" },
  ];
  const opportunities = [
    { title: "Open lab", organization: "Example", published: true, deadline: "2026-02-01", url: "https://example.test" },
    { title: "EXPIRED", published: true, deadline: "2025-01-01" },
    { title: "UNPUBLISHED", published: false },
  ];
  const result = buildStemSummary(member, program, work, opportunities, { start: "2026-01-01", end: "2026-01-15" }, "2026-01-15");
  for (const text of ["PRIVATE NOTES", "OTHER STUDENT", "OTHER WORK", "EXPIRED", "UNPUBLISHED", "Gather and review evidence for: Build"]) assert.ok(!result.includes(text));
  for (const text of ["Filter", "Test the prototype", "Bring your prototype", "Reflect", "Open lab", "awaiting school approval"]) assert.ok(result.includes(text));
});
test("links and dates reject malformed values", () => {
  assert.equal(safeStemUrl("https://example.test/work"), "https://example.test/work");
  for (const url of ["javascript:alert(1)", "data:text/html,x", "https://user:secret@example.test", "/relative"]) assert.throws(() => safeStemUrl(url));
  assert.equal(stemDate("2028-02-29"), "2028-02-29");
  for (const date of ["2026-02-29", "2026-13-01", "tomorrow"]) assert.throws(() => stemDate(date));
});
test("STEM project evidence enters pathway drafting with known names and contacts removed", () => {
  const person = { id: "one", first_name: "Casey", last_name: "Rivera", preferred_name: null, stage: "enrolled", current_grade: 10 };
  const profile = { person, admissions: null, enrollment: null, courses: [], classHistory: [], evidence: [], observations: [], sparks: [], classReflections: [],
    stem: { mentorNames: ["Jordan Ellis"], work: [{ kind: "project", title: "Sensor project", body: "Casey Rivera tested the sensor with Jordan Ellis. Email casey@example.test.", next_step: "", approved_by: "Taylor Smith", updated_at: "2026-10-01" }] } };
  const { input, anon } = pathwayInput(profile, [person], "Taylor Smith");
  const serialized = JSON.stringify(input);
  for (const text of ["Casey", "Rivera", "Jordan", "Ellis", "casey@example.test"]) assert.ok(!serialized.includes(text), text);
  assert.ok(serialized.includes("Sensor project"));
  assert.ok(serialized.includes("[STUDENT]"));
  assert.deepEqual(anon.findNames(serialized), []);
});
