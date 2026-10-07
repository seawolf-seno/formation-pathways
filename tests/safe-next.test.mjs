import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNext } from "../lib/safe-next.ts";

test("after sign-in, only paths on this site are kept", () => {
  for (const ok of ["/capture", "/pilot/people/abc?tab=spark", "/pathway/1/spark#start"]) assert.equal(safeNext(ok), ok);
  for (const bad of ["//evil.example", "/\\evil.example", "/\t/evil.example", "/\n/evil.example", "https://evil.example", "javascript:alert(1)", "", null, undefined, 42, "/%5C%5Cevil.example".replace(/%5C/g, "\\")])
    assert.equal(safeNext(bad), "/capture", String(bad));
  assert.equal(safeNext("evil", "/login"), "/login");
});
