import { test } from "node:test";
import assert from "node:assert/strict";
import { joinText, prefersShortSessions, readResults } from "../lib/dictation.ts";

const r = (transcript, isFinal = true) => ({ isFinal, 0: { transcript } });

test("desktop: separate phrases are joined once each", () => {
  assert.deepEqual(readResults([r("Maya stayed after class"), r(" to help a new student"), r(" find the", false)]), {
    final: "Maya stayed after class to help a new student",
    interim: "find the",
  });
});

test("Android: cumulative final results become one phrase, not three", () => {
  const out = readResults([r("Maya"), r("Maya stayed"), r("Maya stayed after class")]);
  assert.equal(out.final, "Maya stayed after class");
});

test("re-sent identical results are not duplicated", () => {
  assert.equal(readResults([r("Iris helped stack chairs"), r("Iris helped stack chairs")]).final, "Iris helped stack chairs");
  assert.equal(readResults([r("Iris helped stack chairs."), r("iris helped stack chairs")]).final, "Iris helped stack chairs.");
});

test("an interim that repeats the final text shows only what's new", () => {
  assert.deepEqual(readResults([r("Theo asked"), r("Theo asked a brave question", false)]), {
    final: "Theo asked",
    interim: "a brave question",
  });
});

test("empty results and text joining", () => {
  assert.deepEqual(readResults([r("  "), r("", false)]), { final: "", interim: "" });
  assert.equal(joinText("Maya stayed", "", " after class "), "Maya stayed after class");
});

test("short sessions only on Android", () => {
  assert.equal(prefersShortSessions("Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/140"), true);
  assert.equal(prefersShortSessions("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari"), false);
  assert.equal(prefersShortSessions("Mozilla/5.0 (X11; Linux x86_64) Chrome/140"), false);
});
