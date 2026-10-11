import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

// Supabase keys migrations by the timestamp before the first underscore, so
// two files with the same one collide (`supabase db push` refuses, and the
// SQL-editor history can't tell them apart). Contributors' PRs are rebased
// on main before seno applies them: a reused timestamp fails CI here.
const dir = path.join(import.meta.dirname, "../supabase/migrations");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql"));

test("every migration file starts with a 14-digit timestamp", () => {
  for (const f of files) assert.match(f, /^\d{14}_[a-z0-9_]+\.sql$/, `${f}: name it YYYYMMDDHHMMSS_what_it_does.sql`);
});

test("no two migrations share a timestamp", () => {
  const seen = new Map();
  for (const f of files) {
    const version = f.slice(0, 14);
    assert.ok(!seen.has(version), `${f} reuses ${version} (already ${seen.get(version)}): rename it to a later timestamp`);
    seen.set(version, f);
  }
});
