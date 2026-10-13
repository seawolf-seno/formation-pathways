import { test } from "node:test";
import assert from "node:assert/strict";
import { LAB_PAIRS, pairFor, parsePair, specificDetails, summarizeLab } from "../lib/sor/spark-lab.ts";
import { validateStudentSparks } from "../lib/sor/sparks.ts";

test("the rotation covers every ordered pair once, so each format goes first equally often", () => {
  const seen = new Set(LAB_PAIRS.map((p) => p.join(">")));
  assert.equal(seen.size, 6);
  const firsts = LAB_PAIRS.map((p) => p[0]);
  for (const f of ["classic", "starters", "swipe"]) assert.equal(firsts.filter((x) => x === f).length, 2);
  assert.deepEqual(pairFor(0), pairFor(6));
  assert.notDeepEqual(pairFor(0), pairFor(1));
});

test("a pair from the URL must name two different known formats", () => {
  assert.deepEqual(parsePair("swipe,starters"), ["swipe", "starters"]);
  assert.equal(parsePair("swipe,swipe"), null);
  assert.equal(parsePair("swipe,tiktok"), null);
  assert.equal(parsePair(undefined), null);
});

test("specific details: names, places and numbers, not sentence starts or 'I'", () => {
  assert.equal(specificDetails("I like music."), 0);
  assert.equal(specificDetails("I rebuilt Dad's 1998 Trek at Bike Kitchen."), 5);
  assert.equal(specificDetails("Fishing. I'm out at the Harbor most Saturdays."), 2);
});

test("validation keeps the format and lab reaction, and drops anything malformed", () => {
  const base = { answers: [{ prompt: "p", text: "t", via: "text" }], picks: [], leanings: [], channels: [] };
  const ok = validateStudentSparks({
    ...base,
    format: "swipe",
    lab: { labId: "abc", order: 2, seconds: 312.4, feltLikeMe: "kind_of", comparedWith: "starters", preferred: "this", extra: "x" },
  });
  assert.ok(ok.ok);
  assert.equal(ok.sparks.format, "swipe");
  assert.deepEqual(ok.sparks.lab, { labId: "abc", order: 2, seconds: 312, feltLikeMe: "kind_of", comparedWith: "starters", preferred: "this" });
  const odd = validateStudentSparks({ ...base, format: "quiz", lab: { labId: "abc", order: 1 } });
  assert.equal(odd.sparks.format, undefined);
  assert.equal(odd.sparks.lab, undefined);
  assert.equal(validateStudentSparks({ ...base, format: "starters", lab: { labId: "", order: 3 } }).sparks.lab, undefined);
});

test("summarizeLab: reactions, head to head on both sides, and sparks used by a later draft", () => {
  const leg = (person, at, format, lab, sparks) => ({
    person_id: person,
    created_at: at,
    sparks: { answers: [], picks: [], leanings: [], channels: [], ...sparks, format, lab: { labId: person, seconds: 300, ...lab } },
  });
  const sessions = [
    leg("p1", "2026-10-06T10:00:00Z", "starters", { order: 1, feltLikeMe: "yes" }, {
      answers: [{ prompt: "I could teach a class on…", text: "Restoring old tools from estate sales in Ventura", via: "voice" }],
    }),
    leg("p1", "2026-10-06T10:06:00Z", "swipe", { order: 2, feltLikeMe: "kind_of", comparedWith: "starters", preferred: "other" }, {
      picks: [{ label: "Taking care of animals", obsessed: false }],
    }),
    // Not a lab session: ignored.
    { person_id: "p2", created_at: "2026-10-01T00:00:00Z", sparks: { answers: [], picks: [{ label: "Music", obsessed: true }], leanings: [], channels: [] } },
  ];
  const drafts = [
    {
      person_id: "p1",
      created_at: "2026-10-06T11:00:00Z",
      pathways: [{ name: "Second Life", firstSemester: "x", mentorArchetype: "x", stretchChallenge: "x", fourYearHorizon: [], hook: "restoring old tools from estate sales" }],
    },
  ];
  const byFormat = Object.fromEntries(summarizeLab(sessions, drafts).map((f) => [f.format, f]));
  assert.equal(byFormat.starters.sessions, 1);
  assert.deepEqual(byFormat.starters.felt, { yes: 1, kind_of: 0, not_really: 0 });
  assert.equal(byFormat.starters.preferred, 1);
  assert.equal(byFormat.swipe.notPreferred, 1);
  assert.equal(byFormat.starters.specificDetails, 1);
  assert.equal(byFormat.starters.usedShare, 1);
  assert.equal(byFormat.swipe.usedShare, 0);
  assert.equal(byFormat.starters.pathwaysShaped, 1);
  assert.equal(byFormat.classic.sessions, 0);
  assert.equal(byFormat.classic.usedShare, null);
});

// Genres are counted on their own so that "did asking about their feed do
// anything?" has an answer, and kept out of `usedShare` so a tapped genre can
// never flatter a format or reward the inference the prompt forbids.
test("summarizeLab: genres counted separately, never folded into sparks used", () => {
  const leg = (format, sparks) => ({
    person_id: "p1",
    created_at: "2026-10-06T10:00:00Z",
    sparks: { answers: [], picks: [], leanings: [], channels: [], ...sparks, format, lab: { labId: "p1", seconds: 300, order: 1 } },
  });
  const drafts = [
    {
      person_id: "p1",
      created_at: "2026-10-06T11:00:00Z",
      pathways: [{ name: "Second Life", firstSemester: "x", mentorArchetype: "x", stretchChallenge: "x", fourYearHorizon: [], hook: "making & fixing on a workbench" }],
    },
  ];
  const sessions = [
    // One genre the draft echoed, one it didn't, and no other sparks at all.
    leg("starters", { genres: ["Making & fixing", "Anime"] }),
    // A session from before the media step existed: no `genres` key at all.
    leg("swipe", { picks: [{ label: "Music", obsessed: false }] }),
  ];
  const byFormat = Object.fromEntries(summarizeLab(sessions, drafts).map((f) => [f.format, f]));
  assert.equal(byFormat.starters.genres, 2);
  assert.equal(byFormat.starters.genresUsed, 0.5);
  assert.equal(byFormat.starters.genresDrafted, 1);
  // The echoed genre must not count as a spark a pathway grew from.
  assert.equal(byFormat.starters.sparks, 0);
  assert.equal(byFormat.starters.usedShare, null);
  // Old sessions read as zero genres rather than throwing.
  assert.equal(byFormat.swipe.genres, 0);
  assert.equal(byFormat.swipe.genresUsed, null);
  assert.equal(byFormat.swipe.genresDrafted, 0);
});

// The skills card is shared by all three formats, so it is counted the same
// way genres are: on its own, never inside `usedShare`. The two shares are
// reported apart because the gap between them is the signal — if far fewer
// students answer "what are you working on" than "what could you teach", the
// card doesn't feel safe enough to be honest in.
test("summarizeLab: skills counted separately, and the two questions apart", () => {
  const leg = (format, sparks, person = "p1") => ({
    person_id: person,
    created_at: "2026-10-06T10:00:00Z",
    sparks: { answers: [], picks: [], leanings: [], channels: [], ...sparks, format, lab: { labId: person, seconds: 300, order: 1 } },
  });
  const drafts = ["p1", "p2"].map((person_id) => ({
    person_id,
    created_at: "2026-10-06T11:00:00Z",
    pathways: [{ name: "Second Life", firstSemester: "x", mentorArchetype: "x", stretchChallenge: "x", fourYearHorizon: [], hook: "replace a bike chain" }],
  }));
  const sessions = [
    // Both questions answered; the draft echoed the proud one only.
    leg("starters", { canTeach: ["replace a bike chain"], growing: ["speaking in front of a class"] }),
    // Skipped the second question, which is exactly what the gap measures.
    leg("starters", { canTeach: ["true a wheel"], growing: [] }, "p2"),
    // Saved before the skills card existed: no keys at all.
    leg("swipe", { picks: [{ label: "Music", obsessed: false }] }),
  ];
  const byFormat = Object.fromEntries(summarizeLab(sessions, drafts).map((f) => [f.format, f]));
  assert.equal(byFormat.starters.saidCanTeach, 1);
  assert.equal(byFormat.starters.saidGrowing, 0.5);
  assert.equal(byFormat.starters.skillsDrafted, 2);
  // p1: 1 of 2 echoed, p2: 0 of 1. Averaged across sessions, not pooled.
  assert.equal(byFormat.starters.skillsUsed, 0.25);
  // A skill a pathway grew from must not count as a spark for the format.
  assert.equal(byFormat.starters.sparks, 0);
  assert.equal(byFormat.starters.usedShare, null);
  // Old sessions read as nothing said rather than throwing.
  assert.equal(byFormat.swipe.saidCanTeach, 0);
  assert.equal(byFormat.swipe.saidGrowing, 0);
  assert.equal(byFormat.swipe.skillsUsed, null);
});
