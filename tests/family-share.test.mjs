import { test } from "node:test";
import assert from "node:assert/strict";
import { cardContent, defaultCaption, fitSentences, parsePublicShare, shareTargets } from "../lib/family-share.ts";

const raw = {
  first_name: "Wren", style: "tide", ref: "ABCD1234",
  pathway: {
    name: "Things She Wants to Take Apart",
    glimpse: "The stage lights flicker, then hold. You're on the catwalk with your notebook open. A sophomore reads your safety sheet out loud to the crew, and nobody laughs.",
    firstSemester: "Wren joins the build team.",
    fourYearHorizon: ["Runs lights for the musical", "x".repeat(120), "c", "d"],
    mentorArchetype: "Jane Doe (Science) — builds things with students.",
    secret: "never",
  },
};

test("a public share keeps only what's meant to be shared", () => {
  const s = parsePublicShare(raw);
  assert.equal(s.firstName, "Wren");
  assert.equal(s.pathway.fourYearHorizon.length, 3);
  assert.equal("secret" in s.pathway, false);
});

test("bad shares are refused", () => {
  assert.equal(parsePublicShare({ ...raw, style: "neon" }), null);
  assert.equal(parsePublicShare({ ...raw, ref: "lower123" }), null);
  assert.equal(parsePublicShare({ ...raw, first_name: "" }), null);
  assert.equal(parsePublicShare(null), null);
});

test("the card shows the department, never the teacher's name", () => {
  const c = cardContent(parsePublicShare(raw));
  assert.equal(c.program, "Science");
  assert.equal(JSON.stringify(c).includes("Jane"), false);
});

test("card text is whole sentences that fit", () => {
  const c = cardContent(parsePublicShare(raw), 120);
  assert.ok(c.line.length <= 120);
  assert.match(c.line, /\.$/);
  assert.ok(c.horizon.every((h) => h.length <= 70));
  assert.equal(fitSentences("One very long sentence ".repeat(20), 60).endsWith("…"), true);
});

test("the caption and every share link carry the link", () => {
  const url = "https://example.org/w/0123456789ab";
  const caption = defaultCaption("Wren", "Things She Wants to Take Apart", url);
  assert.ok(caption.endsWith(url));
  for (const t of shareTargets(url, caption, "Wren")) {
    assert.ok(t.href.includes(encodeURIComponent(url)), t.id);
  }
});
