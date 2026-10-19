import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { MAX_INTERESTS, checkAiPathways, fallbackPathways, parseCatalog, schoolLine, shareMessage } from "../lib/openhouse.ts";

const catalog = parseCatalog(JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "../fixtures/openhouse.json"), "utf8")));

test("the catalog is real and consistent", () => {
  assert.ok(catalog.mentors.length >= 20 && catalog.projects.length >= 10 && catalog.interests.length >= 10);
  assert.equal(catalog.keyText, "Formation pathways are more impactful in a community. Bring your friends along for the journey.");
  assert.equal(MAX_INTERESTS, 3);
});

test("the fallback gives two pathways from what was tapped, with real mentors and projects", () => {
  const p = fallbackPathways(catalog, ["science", "music"], "Wren");
  assert.equal(p.length, 2);
  assert.deepEqual(p.map((x) => x.title), ["The Builder's Path", "The Musician's Path"]);
  const mentors = new Map(catalog.mentors.map((m) => [m.id, m]));
  assert.ok(["Biology", "Chemistry", "Engineering", "Biology & Chemistry"].includes(mentors.get(p[0].mentors[0]).department));
  assert.equal(mentors.get(p[1].mentors[0]).department, "A Cappella Music");
  assert.ok(p.every((x) => x.projects.length >= 2));
  assert.deepEqual(fallbackPathways(catalog, ["science", "music"], "Wren"), p, "stable for the same family");
  assert.equal(fallbackPathways(catalog, [], "X").length, 2, "nothing tapped still gives two");
});

test("AI answers are kept only with real mentors and projects and clean words", () => {
  const fb = fallbackPathways(catalog, ["tech", "faith"], "Sam");
  const good = { title: "Code for Good", why: "[STUDENT] likes building apps; start in the Makers Space with Dr. Sumida.", mentors: ["david-sumida"], projects: ["makers-space", "drone-club"] };
  assert.deepEqual(checkAiPathways({ pathways: [good, { ...good, title: "Second", mentors: ["made-up-teacher"] }] }, catalog, fb), { pathways: [good, fb[1]], usedAi: true });
  const bad = [
    { ...good, projects: ["makers-space"] },
    { ...good, why: "We guarantee admission!" },
    { ...good, why: "See https://evil.example" },
    { ...good, title: "x".repeat(61) },
  ];
  assert.deepEqual(checkAiPathways({ pathways: bad }, catalog, fb), { pathways: fb, usedAi: false });
  assert.deepEqual(checkAiPathways("nonsense", catalog, fb).pathways, fb);
});

test("a feeder school shows only with five or more students", () => {
  assert.equal(schoolLine({ name: "Grace Lutheran", students: 4, highlights: ["robotics"] }), null);
  assert.equal(schoolLine({ name: "Grace Lutheran", students: 14, highlights: ["robotics", "choir", "soccer"] }), "14 students from Grace Lutheran are at Pacifica today, in robotics, choir and soccer.");
  assert.equal(schoolLine({ name: "Oak", students: 6, highlights: [] }), "6 students from Oak are at Pacifica today.");
});

test("the share message carries the key text, and the thank-you only when it's on", () => {
  const m = shareMessage(catalog, "Wren", "https://x/oh?ref=ABCD1234", null);
  assert.match(m, /Bring your friends along for the journey\./);
  assert.ok(!/application fee/.test(m));
  assert.match(shareMessage(catalog, "Wren", "u", "an application-fee waiver"), /If you apply through our link, Pacifica gives our family: an application-fee waiver/);
});
