import { test } from "node:test";
import assert from "node:assert/strict";
import { classKey, suggestionsByClass, validateResourceSuggestion } from "../lib/sor/class-resources.ts";

const classes = [
  { key: "blackbaud:S-1", title: "Spanish III", schoolYear: "2026 - 2027", offeringType: "Academics" },
  { key: "blackbaud:S-2", title: "AP Chemistry", schoolYear: "2026 - 2027", offeringType: "Academics" },
];
const ok = { classKey: "blackbaud:S-1", title: "  Verb drills ", url: "https://example.org/verbs?set=2", kind: "Practice", note: " helped me with preterite " };

test("a suggestion is cleaned, and its class comes from the student's schedule", () => {
  const r = validateResourceSuggestion({ ...ok, classTitle: "Somebody else's class", status: "approved", person_id: "x" }, classes);
  assert.deepEqual(r, {
    ok: true,
    suggestion: { classTitle: "Spanish III", title: "Verb drills", url: "https://example.org/verbs?set=2", kind: "Practice", note: "helped me with preterite" },
  });
});

test("only the student's own classes, and it needs a name", () => {
  assert.equal(validateResourceSuggestion({ ...ok, classKey: "blackbaud:S-999" }, classes).ok, false);
  assert.equal(validateResourceSuggestion({ ...ok, classKey: undefined }, classes).ok, false);
  assert.equal(validateResourceSuggestion({ ...ok, title: "   " }, classes).ok, false);
  assert.equal(validateResourceSuggestion(null, classes).ok, false);
});

test("only ordinary https links get through", () => {
  const url = (u) => validateResourceSuggestion({ ...ok, url: u }, classes);
  // What people actually paste.
  assert.equal(url("www.youtube.com/watch?v=abc123").suggestion.url, "https://www.youtube.com/watch?v=abc123");
  assert.equal(url("https://www.youtube.com/@channel").suggestion.url, "https://www.youtube.com/@channel");
  for (const bad of [
    "http://example.org/verbs",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "https://user:pw@example.org/",
    "not a link",
    "verbs",
    "",
    "https://example.org/" + "a".repeat(600),
  ]) {
    assert.equal(url(bad).ok, false, bad.slice(0, 40));
  }
});

test("an unknown kind falls back to Reference, and long text is capped", () => {
  const r = validateResourceSuggestion({ ...ok, kind: "Grades", title: "t".repeat(400), note: "n".repeat(900) }, classes);
  assert.equal(r.suggestion.kind, "Reference");
  assert.equal(r.suggestion.title.length, 160);
  assert.equal(r.suggestion.note.length, 300);
});

const row = (id, class_title, status, person_id) => ({
  id, class_title, class_key: classKey(class_title), status, person_id,
  title: id, url: "https://example.org/" + id, kind: "Video", note: "", created_at: "", reviewed_by_name: null, reviewed_at: null,
});

test("a student sees approved links for their classes, and their own that are waiting", () => {
  const rows = [
    row("a", "Spanish III", "approved", "someone-else"),
    row("b", "spanish iii", "pending", "me"),
    row("c", "Spanish III", "pending", "someone-else"),
    row("d", "Spanish III", "declined", "me"),
    row("e", "AP Chemistry", "approved", "me"),
    row("f", "Chemistry", "approved", "someone-else"),
  ];
  const by = suggestionsByClass(rows, "me", classes);
  assert.deepEqual(by.get("blackbaud:S-1").approved.map((r) => r.id), ["a"]);
  assert.deepEqual(by.get("blackbaud:S-1").waiting.map((r) => r.id), ["b"]); // not c (someone else's), not d (declined)
  assert.deepEqual(by.get("blackbaud:S-2").approved.map((r) => r.id), ["e"]); // not f: a different class title
  assert.deepEqual(by.get("blackbaud:S-2").waiting, []);
});
