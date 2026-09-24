import test from "node:test";
import assert from "node:assert/strict";
import { buildNurtureDrafts, pickStories, schoolKey } from "../lib/inquiry.ts";

// `npm run test:share` (runs alongside the share tests)
const story = (over) => ({
  id: 1, school_key: "paul-revere", first_name: "Jordan", grad_year: 2024,
  headline: "H", story: "S", pathway_name: "The Builder", where_now: "Engineering",
  is_fictional: 1, consent_confirmed: 1, ...over,
});

test("schools match regardless of generic words and punctuation", () => {
  assert.equal(schoolKey("Paul Revere Middle School"), "paul-revere");
  assert.equal(schoolKey("paul revere"), "paul-revere");
  assert.equal(schoolKey("Paul Revere Charter Middle School!"), "paul-revere-charter");
  assert.equal(schoolKey(""), "");
});

test("stories without recorded consent are never picked", () => {
  const all = [story({ id: 1 }), story({ id: 2, consent_confirmed: 0, first_name: "Hidden" })];
  const { stories } = pickStories(all, "Paul Revere Middle School");
  assert.deepEqual(stories.map((s) => s.first_name), ["Jordan"]);
});

test("falls back to general stories when the school has none", () => {
  const all = [story({ id: 1 }), story({ id: 2, school_key: "all", first_name: "Priya" })];
  const r = pickStories(all, "Unknown Middle School");
  assert.equal(r.sameSchool, false);
  assert.deepEqual(r.stories.map((s) => s.first_name), ["Priya"]);
  assert.equal(pickStories(all, "").sameSchool, false);
});

test("drafts never claim to know the child and never name an unconsented story", () => {
  const stories = [story()];
  const d = buildNurtureDrafts(
    { first_name: "Sofia", prior_school: "Paul Revere Middle School", interests: null },
    stories, true, "https://x/from/paul-revere", "https://x/admissions"
  );
  assert.equal(d.length, 3);
  const text = d.map((x) => x.subject + x.body).join("\n");
  assert.ok(text.includes("Paul Revere Middle School"));
  assert.ok(text.includes("https://x/from/paul-revere"));
  assert.ok(!/we know you|we can tell you/i.test(text));
});

test("drafts still work with no stories and no interest", () => {
  const d = buildNurtureDrafts(
    { first_name: "Ava", prior_school: "Lincoln", interests: null }, [], false, "u", "a"
  );
  assert.equal(d.length, 3);
  assert.ok(d.every((x) => x.subject && x.body));
});
