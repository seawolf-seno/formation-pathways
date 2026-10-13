import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { COURSE_SLUG, allStandards, parseMasteryConfig, resourcesFor, videosFor, youtubeId } from "../lib/mastery/config.ts";
import { groupLevel, levelFromScore, nextSteps, standardLevel, studentStatuses } from "../lib/mastery/rules.ts";
import { exportEvidence, matchStudent, parseExport, readScore, standardsInTitle } from "../lib/mastery/exports.ts";
import { canvasEvidence } from "../lib/mastery/canvas-map.ts";
import { sampleCanvasRun, sampleEvidence } from "../lib/mastery/sample.ts";
import { parseCsv } from "../lib/sor/importers/csv.ts";

const raw = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "../fixtures/mastery/ap-physics-1.json"), "utf8"));
const config = parseMasteryConfig(raw);
const raw0 = () => structuredClone(raw);
const rules = config.rules;
const ev = (code, source, at, extra) => ({ standard_code: code, source, score: null, max_score: null, level: null, occurred_at: at, ...extra });

test("the AP Physics 1 file reads: eight units plus science practices, unique codes, https links", () => {
  assert.equal(config.groups.length, 9);
  const codes = allStandards(config).map((s) => s.code);
  assert.equal(new Set(codes).size, codes.length);
  assert.ok(codes.includes("2.5") && codes.includes("8.4") && codes.includes("SP3"));
  for (const s of allStandards(config)) for (const r of resourcesFor(config, s.code)) assert.match(r.url, /^https:\/\//);
});

test("a broken standards file says where", () => {
  assert.throws(() => parseMasteryConfig({ ...raw, key: "Bad Key" }), /key/);
  const dup = structuredClone(raw);
  dup.groups[1].standards[0].code = "1.1";
  assert.throws(() => parseMasteryConfig(dup), /1\.1: used twice/);
  const http = structuredClone(raw);
  http.groups[0].resources[0].url = "http://example.com";
  assert.throws(() => parseMasteryConfig(http), /https/);
  const thresholds = structuredClone(raw);
  thresholds.rules.scoreThresholds.proficient = 95;
  assert.throws(() => parseMasteryConfig(thresholds), /extending > proficient/);
});

test("scores become levels at the file's thresholds", () => {
  assert.equal(levelFromScore(9, 10, rules), "extending");
  assert.equal(levelFromScore(7.5, 10, rules), "proficient");
  assert.equal(levelFromScore(5, 10, rules), "developing");
  assert.equal(levelFromScore(4, 10, rules), "beginning");
});

test("no evidence: not started", () => {
  assert.deepEqual(standardLevel([], rules), { level: null, basis: "none", count: 0, lastAt: null });
});

test("the teacher's newest judgment stands until newer evidence", () => {
  const quiz = ev("2.5", "canvas", "2026-10-01", { score: 4, max_score: 10 });
  const oral = ev("2.5", "oral", "2026-10-05", { level: "proficient" });
  assert.equal(standardLevel([quiz, oral], rules).level, "proficient");
  assert.equal(standardLevel([quiz, oral], rules).basis, "teacher");
  // A later quiz reopens it to the weighted rule, where the oral exam still counts most.
  const later = ev("2.5", "khan", "2026-10-08", { level: "developing" });
  const after = standardLevel([quiz, oral, later], rules);
  assert.equal(after.basis, "evidence");
  assert.equal(after.level, "developing");
  const laterGood = ev("2.5", "canvas", "2026-10-08", { score: 8, max_score: 10 });
  assert.equal(standardLevel([quiz, oral, laterGood], rules).level, "proficient");
});

test("recent evidence counts more than old", () => {
  const old = ["09-01", "09-02", "09-03"].map((d) => ev("1.2", "canvas", `2026-${d}`, { score: 3, max_score: 10 }));
  const recent = ["10-01", "10-02"].map((d) => ev("1.2", "canvas", `2026-${d}`, { score: 9, max_score: 10 }));
  assert.equal(standardLevel([...old, ...recent], rules).level, "proficient");
});

test("a unit's level is the lower middle of its started standards", () => {
  assert.equal(groupLevel([null, null]), null);
  assert.equal(groupLevel(["beginning", "proficient", "extending", null]), "proficient");
  assert.equal(groupLevel(["developing", "extending"]), "developing");
});

test("next steps: started-but-not-yet first, then the current unit, never a unit not reached", () => {
  const evidence = [
    ev("1.1", "canvas", "2026-09-01", { score: 9, max_score: 10 }),
    ev("1.2", "canvas", "2026-09-02", { score: 5, max_score: 10 }),
    ev("2.1", "canvas", "2026-10-01", { score: 6, max_score: 10 }),
    ev("2.1", "khan", "2026-10-03", { level: "proficient" }),
  ];
  const statuses = studentStatuses(config, evidence);
  const steps = nextSteps(config, statuses, evidence, 4);
  assert.deepEqual(steps.map((s) => s.standard.code), ["1.2", "2.1", "1.3", "1.4"]);
  assert.ok(steps.every((s) => !s.standard.code.startsWith("8")));
  assert.equal(steps.find((s) => s.standard.code === "2.1").readyToShow, true);
  assert.equal(steps.find((s) => s.standard.code === "1.2").readyToShow, false);
  assert.ok(steps[0].resources.some((r) => r.kind === "phet"));
});

test("reading score cells", () => {
  assert.deepEqual(readScore("8/10"), { score: 8, max: 10 });
  assert.deepEqual(readScore(" 7.5 / 9 "), { score: 7.5, max: 9 });
  assert.deepEqual(readScore("85%"), { score: 85, max: 100 });
  assert.equal(readScore("excellent"), null);
  assert.equal(readScore("120"), null);
});

test("standards named in a title, or a whole unit", () => {
  assert.deepEqual(standardsInTitle("Quiz [2.5, 2.7]", config), ["2.5", "2.7"]);
  assert.deepEqual(standardsInTitle("SP1 lab check", config), ["SP1"]);
  assert.equal(standardsInTitle("Unit 4 Progress Check: MCQ", config).length, 4);
  assert.deepEqual(standardsInTitle("Week 3 homework", config), []);
  // "2.50 points" isn't standard 2.5; "12.5" isn't 2.5.
  assert.deepEqual(standardsInTitle("Bonus 12.5", config), []);
});

const roster = [
  { person_id: "p1", first_name: "Wren", last_name: "Okafor", preferred_name: null, email: "wokafor29@pacificachristian.org" },
  { person_id: "p2", first_name: "Theodore", last_name: "Lane", preferred_name: "Teddy", email: null },
  { person_id: "p3", first_name: "Sam", last_name: "Ruiz", preferred_name: null, email: null },
  { person_id: "p4", first_name: "Sam", last_name: "Ruiz", preferred_name: null, email: null },
];

test("students match only exactly", () => {
  assert.equal(matchStudent({ studentEmail: "wokafor29@pacificachristian.org", studentName: null }, roster)?.person_id, "p1");
  assert.equal(matchStudent({ studentEmail: null, studentName: "Okafor, Wren" }, roster)?.person_id, "p1");
  assert.equal(matchStudent({ studentEmail: null, studentName: "Teddy Lane" }, roster)?.person_id, "p2");
  assert.equal(matchStudent({ studentEmail: null, studentName: "Wren Okafur" }, roster), null, "no fuzzy matching");
  assert.equal(matchStudent({ studentEmail: null, studentName: "Sam Ruiz" }, roster), null, "two students share the name");
});

test("a long export (one row per assessment) with a level column", () => {
  const csv = `Student Name,Email,Assignment,Score,Points Possible,Date
"Okafor, Wren",wokafor29@pacificachristian.org,Unit 2 Progress Check: MCQ,14,18,2026-10-02
Teddy Lane,,Quiz [2.5],7,10,2026-10-03
Teddy Lane,,Week 3 homework,9,10,2026-10-04
Nobody Here,,Quiz [2.5],7,10,2026-10-03`;
  const parsed = parseExport(parseCsv(csv), config);
  assert.equal(parsed.layout, "long");
  assert.equal(parsed.rows.length, 4);
  assert.deepEqual(parsed.unmappedTitles, ["Week 3 homework"]);
  const { evidence, unmatched } = exportEvidence(parsed, roster, "ap_classroom", null, "2026-10-12T00:00:00.000Z");
  assert.deepEqual(unmatched, ["Nobody Here"]);
  assert.equal(evidence.filter((e) => e.person_id === "p1").length, 9, "a unit progress check counts on each topic of the unit");
  assert.deepEqual(evidence.filter((e) => e.person_id === "p2").map((e) => e.standard_code), ["2.5"]);
  const withFallback = exportEvidence(parsed, roster, "ap_classroom", "SP2", "2026-10-12T00:00:00.000Z");
  assert.ok(withFallback.evidence.some((e) => e.title === "Week 3 homework" && e.standard_code === "SP2"));
  // Re-reading the same report gives the same keys, so nothing is added twice.
  const again = exportEvidence(parseExport(parseCsv(csv), config), roster, "ap_classroom", null, "2026-10-13T00:00:00.000Z");
  assert.deepEqual(again.evidence.map((e) => e.external_key), evidence.map((e) => e.external_key));
});

test("a wide export (a column per skill) with Khan's mastery words", () => {
  const csv = `First Name,Last Name,2.5 Newton's second law,2.7 Friction,Unit 3 quiz,Notes column
Wren,Okafor,Mastered,Familiar,80%,
Teddy,Lane,Attempted,Not started,6/10,see me`;
  const parsed = parseExport(parseCsv(csv), config);
  assert.equal(parsed.layout, "wide");
  const levels = parsed.rows.filter((r) => r.level).map((r) => `${r.studentName}:${r.standardCodes[0]}:${r.level}`);
  assert.deepEqual(levels, ["Wren Okafor:2.5:extending", "Wren Okafor:2.7:developing", "Teddy Lane:2.5:beginning"]);
  assert.ok(parsed.rows.some((r) => r.title === "Unit 3 quiz" && r.score === 6 && r.maxScore === 10));
  assert.deepEqual(parsed.skipped, ["see me"]);
});

test("Canvas: graded work naming a standard counts; the rest is listed, never guessed", () => {
  const people = new Map([["101", "p1"]]);
  const { evidence, unmapped } = canvasEvidence(
    [
      { user_id: "101", assignment_id: "9", assignment_name: "Unit 2 quiz [2.5, 2.7]", points_possible: 10, score: 8, graded_at: "2026-10-01T00:00:00Z", workflow_state: "graded" },
      { user_id: "101", assignment_id: "10", assignment_name: "Lab safety form", points_possible: 5, score: 5, graded_at: null, workflow_state: "graded" },
      { user_id: "101", assignment_id: "11", assignment_name: "Quiz [3.1]", points_possible: 10, score: null, graded_at: null, workflow_state: "submitted" },
      { user_id: "999", assignment_id: "9", assignment_name: "Unit 2 quiz [2.5, 2.7]", points_possible: 10, score: 2, graded_at: null, workflow_state: "graded" },
    ],
    [{ user_id: "101", outcome_id: "o1", outcome_title: "SP1 Creating representations", score: 3, possible: 4, submitted_or_assessed_at: "2026-10-02T00:00:00Z" }],
    people,
    config,
    "2026-10-12T00:00:00Z",
  );
  assert.deepEqual(evidence.map((e) => e.standard_code), ["2.5", "2.7", "SP1"]);
  assert.deepEqual(unmapped, ["Lab safety form"]);
  assert.ok(evidence.every((e) => e.person_id === "p1"));
});

test("the sample class is repeatable and stays in the units reached", () => {
  const now = new Date("2026-10-12T12:00:00Z");
  const a = sampleEvidence(config, ["s1", "s2", "s3"], now);
  const b = sampleEvidence(config, ["s1", "s2", "s3"], now);
  assert.deepEqual(a, b);
  assert.ok(a.every((e) => /^(1|2|3)\.|^SP/.test(e.standard_code)));
  assert.equal(new Set(a.map((e) => `${e.person_id}|${e.standard_code}|${e.external_key}`)).size, a.length, "no duplicate keys");
  const run = sampleCanvasRun(["s1", "s2"], now, 0);
  assert.ok(run.every((e) => e.score >= 3 && e.score <= 10));
});

test("a course has an address: the file's default is APPhysics1", () => {
  assert.equal(config.slug, "APPhysics1");
  for (const ok of ["APPhysics1", "APPhysics1-P3", "Chem-Honors"]) assert.match(ok, COURSE_SLUG);
  for (const bad of ["1Physics", "AP Physics", "a", "AP_Physics", "AP/Physics"]) assert.doesNotMatch(bad, COURSE_SLUG);
  const { slug, ...noSlug } = raw;
  assert.ok(slug);
  assert.throws(() => parseMasteryConfig(noSlug), /slug/);
});

test("YouTube links become ids; anything else is refused", () => {
  assert.equal(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s"), "dQw4w9WgXcQ");
  assert.equal(youtubeId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(youtubeId("https://m.youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(youtubeId("dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(youtubeId("http://www.youtube.com/watch?v=dQw4w9WgXcQ"), null, "https only");
  assert.equal(youtubeId("https://evil.example/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(youtubeId("https://www.youtube.com/watch?v=short"), null);
  const bad = structuredClone(raw);
  bad.groups[0].videos = [{ id: "https://example.com/x", title: "x", channel: "y" }];
  assert.throws(() => parseMasteryConfig(bad), /not a YouTube video/);
});

test("every unit in the course has videos, and a standard's own come first", () => {
  for (const g of config.groups.filter((g) => g.unitNumber !== null)) {
    const n = g.videos.length + g.standards.reduce((a, s) => a + s.videos.length, 0);
    assert.ok(n >= 2, `${g.code} has ${n} videos`);
  }
  const withOwn = allStandards(config).find((s) => s.videos.length);
  if (withOwn) {
    const list = videosFor(config, withOwn.code);
    assert.equal(list[0].id, withOwn.videos[0].id);
    assert.equal(new Set(list.map((v) => v.id)).size, list.length, "no repeats");
  }
});

test("finished units lead next steps, even where there's no evidence yet", () => {
  const evidence = [
    ev("1.1", "canvas", "2026-09-01", { score: 9, max_score: 10 }),
    ev("3.1", "canvas", "2026-10-08", { score: 5, max_score: 10 }),
  ];
  const statuses = studentStatuses(config, evidence);
  const steps = nextSteps(config, statuses, evidence, 4, 2);
  // Finished: Units 1–2. 1.1 is solid; 1.2 has no evidence yet and comes first.
  assert.equal(steps[0].standard.code, "1.2");
  assert.ok(steps.every((s) => s.covered));
  const without = nextSteps(config, statuses, evidence, 2, null);
  assert.deepEqual(without.map((s) => s.standard.code), ["3.1", "1.2"]);
  assert.ok(without.every((s) => !s.covered));
});

test("Khan-style skill names find their standard, the most specific one only", async () => {
  const { standardsByName, standardsInTitle } = await import("../lib/mastery/exports.ts");
  const cases = {
    "Newton's second law": ["2.5"],
    "Rotational form of Newton's second law": ["5.6"],
    "Kinetic energy": ["3.1"],
    "Rotational kinetic energy": ["6.1"],
    "Angular momentum": ["6.3"],
    "Conservation of angular momentum": ["6.4"],
    "Momentum and impulse": ["4.1", "4.2"],
    "Projectile motion practice": ["1.5"],
    "Free body diagrams": ["2.2"],
    "Newton’s third law": ["2.3"],
    "Frequency and period of SHM": ["7.2"],
    "Week 3 homework": [],
  };
  for (const [title, want] of Object.entries(cases)) assert.deepEqual(standardsByName(title, config).sort(), want, title);
  // A code or a unit in the title still wins over words.
  assert.deepEqual(standardsInTitle("Newton's second law quiz [2.7]", config), ["2.7"]);
  // Too general to trust: matches nothing.
  assert.deepEqual(standardsByName("Forces, friction, springs, momentum, torque and power review", config), []);
});

test("Khan Academy work that arrives through Canvas counts as Khan", async () => {
  const { isKhanAssignment } = await import("../lib/mastery/canvas-map.ts");
  assert.equal(isKhanAssignment({ tool_url: "https://www.khanacademy.org/lti/launch?x=1", assignment_name: "Newton's second law" }), true);
  assert.equal(isKhanAssignment({ tool_url: null, assignment_name: "Khan Academy: Projectile motion" }), true);
  assert.equal(isKhanAssignment({ tool_url: "https://evilkhanacademy.org.example.com/x", assignment_name: "Quiz" }), false);
  assert.equal(isKhanAssignment({ tool_url: null, assignment_name: "Unit 2 quiz [2.5]" }), false);
  const { evidence } = canvasEvidence(
    [{ user_id: "1", assignment_id: "7", assignment_name: "Newton's second law", points_possible: 100, score: 80, graded_at: "2026-10-12T00:00:00Z", workflow_state: "graded", tool_url: "https://www.khanacademy.org/lti/1" }],
    [], new Map([["1", "p1"]]), config, "2026-10-12T00:00:00Z");
  assert.deepEqual(evidence.map((e) => [e.standard_code, e.source]), [["2.5", "khan"]]);
});

test("next steps for AI: candidates from the rules, numbered links, no scores", async () => {
  const { nextStepsInput, parseDraftSteps, fallbackDraftSteps, readSavedSteps } = await import("../lib/mastery/next-steps.ts");
  const evidence = [
    { ...ev("2.5", "canvas", "2026-10-01", { score: 4, max_score: 10 }), title: "Unit 2 quiz [2.5]" },
    { ...ev("2.2", "canvas", "2026-10-03", { score: 9, max_score: 10 }), title: "FBD check [2.2]" },
    { ...ev("1.1", "canvas", "2026-09-01", { score: 9, max_score: 10 }), title: "Vectors quiz [1.1]" },
  ];
  const statuses = studentStatuses(config, evidence);
  const { input, links } = nextStepsInput(config, "AP Physics 1", statuses, evidence, 2);
  const text = JSON.stringify(input);
  assert.ok(!/"score"|"max_score"|\b4\/10\b|\b9\b\s*\/\s*10/.test(text), "no scores leave");
  assert.equal(input.finishedThrough, "Unit 2 · Force and translational dynamics");
  assert.ok(input.candidates.every((c) => c.coveredInClass), "finished units first");
  assert.ok(input.solid.includes("Scalars and vectors in one dimension"));
  assert.equal(links.size, input.candidates.reduce((n, c) => n + c.links.length, 0));

  const first = input.candidates[0];
  const answer = {
    steps: [
      { standard: first.code, text: "  Start   with the video. ", links: [first.links[0].ref, "L999"] },
      { standard: "9.9", text: "Invented standard", links: [] },
      { standard: first.code, text: "Duplicate", links: [] },
      { standard: input.candidates[1].code, text: "Second", links: [first.links[0].ref] },
      { standard: input.candidates[2].code, text: "Third", links: [] },
      { standard: input.candidates[3]?.code, text: "Fourth is one too many", links: [] },
    ],
  };
  const steps = parseDraftSteps(answer, input, links);
  assert.equal(steps.length, 3);
  assert.equal(steps[0].text, "Start with the video.");
  assert.deepEqual(steps[0].links.map((l) => l.url), [links.get(first.links[0].ref).url], "an invented link is dropped");
  assert.deepEqual(steps[1].links, [], "another standard's link is dropped");
  assert.deepEqual(parseDraftSteps("nonsense", input, links), []);

  const fb = fallbackDraftSteps(input, links);
  assert.ok(fb.length > 0 && fb.every((s) => s.text && !/\d+\s*\/\s*\d+|%/.test(s.text)));
  assert.deepEqual(readSavedSteps([{ standard: "2.5", text: "x", links: [{ label: "a", url: "javascript:alert(1)" }, { label: "b", url: "https://phet.colorado.edu/x" }] }, { bad: true }]), [
    { standard: "2.5", text: "x", links: [{ label: "b", url: "https://phet.colorado.edu/x" }] },
  ]);
});

test("mastery for a Pathway draft: words only, solid first, growing named gently", async () => {
  const { masterySummary, masteryForPrompt } = await import("../lib/mastery/rules.ts");
  const evidence = [
    ev("2.5", "oral", "2026-10-05", { level: "extending" }),
    ev("2.2", "canvas", "2026-10-03", { score: 8, max_score: 10 }),
    ev("2.7", "canvas", "2026-10-03", { score: 6, max_score: 10 }),
  ];
  const m = masterySummary(config, "AP Physics 1", evidence);
  assert.deepEqual(m.strong, ["Newton's second law", "Forces and free-body diagrams"]);
  assert.deepEqual(m.growing, ["Kinetic and static friction"]);
  const text = masteryForPrompt([m]);
  assert.match(text, /^AP Physics 1: solid on Newton's second law; Forces and free-body diagrams\. Still growing on Kinetic and static friction\.$/);
  assert.ok(!/\d/.test(text.replace("AP Physics 1", "")), "no numbers");
  assert.equal(masteryForPrompt([masterySummary(config, "AP Physics 1", [])]), null);
});

test("tagged resources join their standard or unit, videos as videos", async () => {
  const { withCourseResources, kindForUrl } = await import("../lib/mastery/course-resources.ts");
  const merged = withCourseResources(config, [
    { id: "a", standard_code: "2.7", group_code: null, kind: "other", title: "Friction demo", url: "https://example.org/f", video_id: null, channel: null, note: null },
    { id: "b", standard_code: null, group_code: "U3", kind: "video", title: "Energy song", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", video_id: "dQw4w9WgXcQ", channel: "Someone", note: "fun" },
    { id: "c", standard_code: "9.9", group_code: null, kind: "other", title: "Gone", url: "https://example.org/g", video_id: null, channel: null, note: null },
  ]);
  const f = merged.groups.flatMap((g) => g.standards).find((s) => s.code === "2.7");
  assert.equal(f.resources[0].url, "https://example.org/f");
  assert.equal(merged.groups.find((g) => g.code === "U3").videos[0].id, "dQw4w9WgXcQ");
  assert.equal(config.groups.find((g) => g.code === "U3").videos[0].id === "dQw4w9WgXcQ", false, "the shared set isn't changed");
  assert.equal(kindForUrl("https://youtu.be/dQw4w9WgXcQ"), "video");
  assert.equal(kindForUrl("https://www.khanacademy.org/science/ap-physics-1"), "khan");
  assert.equal(kindForUrl("https://phet.colorado.edu/en/simulations/collision-lab"), "phet");
  assert.equal(kindForUrl("https://apclassroom.collegeboard.org/"), "ap_classroom");
  assert.equal(kindForUrl("https://example.org/"), "other");
});

test("the extension matches Khan students exactly and keeps only proficient / mastered", async () => {
  const { matchRoster, countedLevel } = await import("../extensions/mastery-hub/match.js");
  const roster = [
    { id: "p1", first: "Wren", last: "Okafor", preferred: null },
    { id: "p2", first: "Theodore", last: "Lane", preferred: "Teddy" },
    { id: "p3", first: "Sam", last: "Ruiz", preferred: null },
    { id: "p4", first: "Sam", last: "Ruiz", preferred: null },
  ];
  assert.equal(matchRoster("Wren Okafor", roster)?.id, "p1");
  assert.equal(matchRoster("Okafor, Wren", roster)?.id, "p1");
  assert.equal(matchRoster("Teddy Lane", roster)?.id, "p2");
  assert.equal(matchRoster("Wren", roster), null, "first name alone isn't enough");
  assert.equal(matchRoster("Sam Ruiz", roster), null, "two students share the name");
  assert.equal(matchRoster("", roster), null);
  assert.equal(countedLevel("MASTERED"), "mastered");
  assert.equal(countedLevel("proficient"), "proficient");
  for (const w of ["familiar", "attempted", "unstarted", "", null]) assert.equal(countedLevel(w), null, String(w));
});

test("Canvas objectives become the backbone, unit by unit, keeping each unit's videos", async () => {
  const { objectivesFromCanvas, outcomeCodes, unitNumberOf, ratingLabel, suggestObjective } = await import("../lib/mastery/canvas-outcomes.ts");
  const links = [
    { outcome_group: { id: 20, title: "Unit 2: Forces" }, outcome: { id: 201, title: "LO 2.1", display_name: "Apply Newton's laws to a single object", description: "<p>Uses Newton&#39;s second law and free body diagrams</p>", ratings: [{ description: "Exceeds", points: 4 }, { description: "Meets Mastery", points: 3 }, { description: "Approaching", points: 2 }] } },
    { outcome_group: { id: 20, title: "Unit 2: Forces" }, outcome: { id: 202, title: "Analyze systems and Newton's third law pairs" } },
    { outcome_group: { id: 20, title: "Unit 2: Forces" }, outcome: { id: 203, title: "Circular motion and gravitation" } },
    { outcome_group: { id: 10, title: "Unit 1 Kinematics" }, outcome: { id: 101, title: "Describe motion with graphs and equations" } },
    { outcome_group: { id: 1, title: "AP Physics 1 P5" }, outcome: { id: 900, title: "Science practices" } },
    { outcome_group: { id: 10, title: "Unit 1 Kinematics" }, outcome: { id: 101, title: "duplicate link" } },
  ];
  const raw = objectivesFromCanvas(links, { key: "canvas-123", slug: "APPhysics1", title: "AP Physics 1 objectives", courseTitle: "AP Physics 1 P5", base: config, baseRaw: raw0() });
  const cfg = parseMasteryConfig(raw);
  assert.deepEqual(cfg.groups.map((g) => [g.title, g.unitNumber, g.standards.length]), [["Unit 1 Kinematics", 1, 1], ["Unit 2: Forces", 2, 3], ["Course objectives", null, 1]]);
  const lo21 = cfg.groups[1].standards[0];
  assert.equal(lo21.code, "o201");
  assert.equal(lo21.title, "Apply Newton's laws to a single object");
  assert.equal(lo21.description, "Uses Newton's second law and free body diagrams");
  assert.ok(cfg.groups[1].videos.length >= 5, "Unit 2's videos come along");
  assert.equal(cfg.groups[2].videos.length, 0);
  assert.equal(outcomeCodes(cfg).get("201"), "o201");
  assert.equal(unitNumberOf("Unit 7 - Oscillations"), 7);
  assert.equal(unitNumberOf("Kinematics"), null);
  assert.equal(ratingLabel(3.4, links[0].outcome.ratings), "Meets Mastery");
  assert.equal(ratingLabel(1, links[0].outcome.ratings), null);
  assert.equal(suggestObjective("Newton's second law", 2, cfg), "o201");
  assert.equal(suggestObjective("Newton's third law", 2, cfg), "o202");
  assert.equal(suggestObjective("Centripetal acceleration and circular motion", 2, cfg), "o203");
  assert.equal(suggestObjective("Something unrelated entirely", 2, cfg), null);
});

test("Canvas work lands on objectives through its rubric; rollups become objective scores", async () => {
  const { canvasEvidence, rollupGrades } = await import("../lib/mastery/canvas-map.ts");
  const codes = new Map([["201", "o201"], ["202", "o202"]]);
  const people = new Map([["7", "p1"]]);
  const { evidence } = canvasEvidence(
    [
      { user_id: "7", assignment_id: "50", assignment_name: "Unit 2 lab", points_possible: 8, score: 7, graded_at: "2026-10-10T00:00:00Z", workflow_state: "graded",
        rubric: [{ id: "c1", points: 4, description: "Newton's laws", outcome_id: 201 }, { id: "c2", points: 4, description: "Systems", outcome_id: 202 }, { id: "c3", points: 2, description: "Neatness", outcome_id: null }],
        rubric_assessment: { c1: { points: 4 }, c2: { points: 3 } } },
      { user_id: "7", assignment_id: "51", assignment_name: "Unit 2 quiz", points_possible: 10, score: 6, graded_at: null, workflow_state: "graded",
        rubric: [{ id: "c9", points: 4, outcome_id: 202 }], rubric_assessment: null },
    ],
    [{ user_id: "7", outcome_id: "201", outcome_title: "whatever", score: 3, possible: 4, submitted_or_assessed_at: "2026-10-11T00:00:00Z" }],
    people, config, "2026-10-12T00:00:00Z", codes,
  );
  assert.deepEqual(evidence.map((e) => [e.standard_code, e.score, e.max_score]), [["o201", 4, 4], ["o202", 3, 4], ["o202", 6, 10], ["o201", 3, 4]]);
  const grades = rollupGrades(
    [{ user_id: "7", outcome_id: "201", score: 3 }, { user_id: "7", outcome_id: "999", score: 1 }, { user_id: "8", outcome_id: "201", score: 2 }],
    new Map([["201", { ratings: [{ description: "Exceeds", points: 4 }, { description: "Meets Mastery", points: 3 }] }]]),
    people, codes,
  );
  assert.deepEqual(grades, [{ person_id: "p1", standard_code: "o201", score: 3, max_score: 4, label: "Meets Mastery" }]);
});
