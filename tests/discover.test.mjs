import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanRef, cleanSource, entryYears, validateInquiry, INQUIRY_CONSENT_VERSION } from "../lib/discover.ts";

const now = new Date("2026-10-08T12:00:00Z");
const good = {
  child_first_name: " Sam ", child_last_name: "Rivera", child_grade: "9", entry_year: "2027",
  current_school: "Harbor View Middle School", one_thing: "Fixes every bike on our street.",
  interests: ["STEM", "Surf", "Surf", "Juggling"],
  parent_first_name: "Pat", parent_last_name: "Rivera", parent_relationship: "Mother",
  parent_email: " Pat@Example.com ", parent_phone: "", address_1: "1 Ocean Ave", city: "Newport Beach",
  state: "CA", zip: "92660", consent_contact: "on", source: "website", ref: "ab12cd34",
};

test("a complete inquiry is cleaned into the shape the database accepts", () => {
  const r = validateInquiry(good, now);
  assert.ok(r.ok);
  assert.equal(r.payload.child_first_name, "Sam");
  assert.equal(r.payload.parent_email, "pat@example.com");
  assert.deepEqual(r.payload.interests, ["STEM", "Surf"], "unknown and duplicate interests dropped");
  assert.equal(r.payload.child_grade, 9);
  assert.equal(r.payload.country, "United States");
  assert.equal(r.payload.consent_version, INQUIRY_CONSENT_VERSION);
  assert.equal(r.payload.consent_pathway, false);
  assert.equal(r.payload.ref, "AB12CD34");
  assert.equal(r.payload.source, "website");
});

test("missing or wrong fields come back as plain messages, one per field", () => {
  const r = validateInquiry({ ...good, child_first_name: "", parent_email: "nope", consent_contact: undefined, child_grade: "7", address_1: "" }, now);
  assert.ok(!r.ok);
  assert.deepEqual(Object.keys(r.errors).sort(), ["address_1", "child_first_name", "child_grade", "consent_contact", "parent_email"]);
  assert.match(r.errors.consent_contact, /permission/);
});

test("entry years start with next fall once spring has passed", () => {
  assert.deepEqual(entryYears(new Date("2026-10-08")), [2027, 2028, 2029]);
  assert.deepEqual(entryYears(new Date("2027-02-01")), [2027, 2028, 2029]);
  assert.equal(validateInquiry({ ...good, entry_year: "2026" }, now).ok, false);
});

test("a link can only claim the website as its source; codes must look like codes", () => {
  assert.equal(cleanSource("share"), "direct");
  assert.equal(cleanSource("website"), "website");
  assert.equal(cleanRef("ab12cd34"), "AB12CD34");
  for (const bad of ["", "short", "AB12CD34X", "AB12-CD3", null, 42]) assert.equal(cleanRef(bad), null);
});
