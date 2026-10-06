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
