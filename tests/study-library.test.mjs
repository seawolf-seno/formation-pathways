import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { RESOURCE_KINDS, parseStudyLibrary, resourcesForClass, subjectForClass } from "../lib/sor/study-library.ts";

const file = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "../fixtures/study-library.json"), "utf8"));
const library = parseStudyLibrary(file);
const subjectOf = (title) => subjectForClass(title, library)?.id ?? null;

test("the real library file parses with nothing dropped", () => {
  assert.equal(library.subjects.length, file.subjects.length);
  for (const [i, s] of library.subjects.entries()) {
    assert.equal(s.resources.length, file.subjects[i].resources.length, `${s.id} lost a resource`);
    for (const r of s.resources) {
      assert.match(r.url, /^https:\/\//);
      assert.ok(RESOURCE_KINDS.includes(r.kind));
      assert.ok(r.source, `${r.title} has no source`);
    }
  }
});

test("a class finds its subject by the phrases in its title, most specific first", () => {
  assert.equal(subjectOf("Precalculus"), "algebra"); // not calculus, though "calc" is in it
  assert.equal(subjectOf("AP Calculus BC"), "calculus");
  assert.equal(subjectOf("U.S. History"), "ushistory");
  assert.equal(subjectOf("AP European History"), "history");
  assert.equal(subjectOf("English 11: American Voices"), "writing");
  assert.equal(subjectOf("Honors Physics"), "physics");
  assert.equal(subjectOf("Advanced Computer Science with AI Agents"), "computing");
});

test("a class the library doesn't cover gets nothing, never a guess", () => {
  for (const title of ["Spanish III", "Concert Choir", "Varsity Cross Country", "Theology: Christian Ethics"]) {
    assert.equal(resourcesForClass(title, library), null, title);
  }
});

test("course-specific resources show only for that course", () => {
  const ap = resourcesForClass("AP Chemistry", library);
  const regular = resourcesForClass("Chemistry", library);
  assert.deepEqual(ap.byKind.map((g) => g.kind), ["Past exam", "Practice", "Open reading"]);
  assert.equal(ap.byKind[0].resources.length, 5);
  assert.ok(ap.byKind[2].resources.some((r) => r.group === "Unit 7: Equilibrium"));
  assert.deepEqual(regular.byKind.map((g) => g.kind), ["Practice", "Open reading"]);
  assert.deepEqual(regular.byKind[1].resources.map((r) => r.title), ["Chemistry 2e"]);
  assert.equal(regular.count, 4);
  // AB papers don't appear for BC.
  const bc = resourcesForClass("AP Calculus BC", library);
  assert.equal(bc.byKind[0].resources.length, 1);
  assert.match(bc.byKind[0].resources[0].url, /ap-calculus-bc/);
});

test("a hand-edited file can't put an unsafe or malformed link on the page", () => {
  const parsed = parseStudyLibrary({
    subjects: [
      {
        id: "x", name: "X", match: ["Xylophone"],
        resources: [
          { title: "ok", url: "https://example.org/a", kind: "Reference", source: "Example" },
          { title: "script", url: "javascript:alert(1)", kind: "Reference", source: "Example" },
          { title: "plain http", url: "http://example.org/a", kind: "Reference", source: "Example" },
          { title: "credentials", url: "https://user:pw@example.org/", kind: "Reference", source: "Example" },
          { title: "unknown kind", url: "https://example.org/b", kind: "Grades", source: "Example" },
          { title: "", url: "https://example.org/c", kind: "Reference", source: "Example" },
        ],
      },
      { id: "x", name: "Duplicate id", match: ["y"], resources: [] },
      { id: "nomatch", name: "No phrases", match: [], resources: [] },
      "not an object",
    ],
  });
  assert.deepEqual(parsed.subjects.map((s) => s.id), ["x"]);
  assert.deepEqual(parsed.subjects[0].resources.map((r) => r.title), ["ok"]);
  assert.deepEqual(parsed.subjects[0].match, ["xylophone"]);
  assert.deepEqual(parseStudyLibrary(null), { subjects: [] });
  assert.equal(resourcesForClass("Xylophone Ensemble", parsed).count, 1);
});
