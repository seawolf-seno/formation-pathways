import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

// A view-only account (role "viewer") must be stopped before an action does
// any work: the database refuses its writes, but an action may call Claude or
// another service first. These read the source, so a new action can't skip
// the check by accident.
const read = (f) => fs.readFileSync(path.join(import.meta.dirname, "..", f), "utf8");
const actions = read("lib/sor/actions.ts");

// Sign-in and sign-out, and the at-home family link (no sign-in; the database checks its token).
const NO_STAFF_CHECK = ["sendSignInLinkAction", "verifySignInCodeAction", "signInWithGoogleAction", "signOutAction", "submitFamilySparksAction"];

test("every staff action refuses a view-only account", () => {
  const parts = actions.split(/^export async function /m).slice(1);
  assert.ok(parts.length >= 40, "found the actions");
  for (const part of parts) {
    const name = part.match(/^[A-Za-z0-9_]+/)[0];
    if (NO_STAFF_CHECK.includes(name)) continue;
    assert.match(part, /await require(Role|ActingStaff)\(/, `${name}: start with requireRole(...) or requireActingStaff()`);
  }
});

test("actions never use requireStaff directly, which lets a viewer through", () => {
  assert.doesNotMatch(actions, /requireStaff\(/, "use requireActingStaff() in lib/sor/actions.ts");
  assert.match(actions, /async function requireRole\([^)]*\)[^{]*\{\s*const staff = await requireActingStaff\(\);/);
  assert.match(read("lib/sor/queries.ts"), /if \(staff\.role === "viewer"\) throw new Error\(VIEW_ONLY_MESSAGE\);/);
});

test("the fictional demo turns a view-only account away in production", () => {
  assert.match(read("lib/demo-access.ts"), /if \(staff\.role === "viewer"\) redirect\("\/capture"\);/);
});
