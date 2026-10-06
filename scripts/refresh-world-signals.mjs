// Refreshes fixtures/world-signals.json, the offline fallback for "the world
// right now" in pathway drafts (see lib/world-signals.ts). Public feeds only.
// Run: npm run world:refresh
import fs from "node:fs";
import path from "node:path";
import { fetchWorldSignalsLive } from "../lib/world-signals.ts";

const world = await fetchWorldSignalsLive();
if (world.signals.length === 0) {
  console.error("No signals fetched; leaving the existing snapshot alone.");
  process.exit(1);
}
const out = path.join(process.cwd(), "fixtures", "world-signals.json");
fs.writeFileSync(out, JSON.stringify({ fetchedAt: world.fetchedAt, signals: world.signals }, null, 2) + "\n");
const bySource = Object.entries(Object.groupBy(world.signals, (s) => s.source)).map(([k, v]) => `${k} ${v.length}`);
console.log(`Wrote ${world.signals.length} signals (${bySource.join(", ")}) to ${path.relative(process.cwd(), out)}`);
