import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WORLD_SOURCES,
  formatWorldSignals,
  parseFeedItems,
  signalsFromItems,
  splitTbpnChapters,
  stripPromo,
} from "../lib/world-signals.ts";

const tbpn = WORLD_SOURCES.find((s) => s.id === "tbpn");
const shortwave = WORLD_SOURCES.find((s) => s.id === "shortwave");
const now = new Date("2026-10-06T12:00:00Z");

const feed = `<?xml version="1.0"?><rss><channel><title>Show</title>
<item><title><![CDATA[Bats &amp; Bricks | Diet TBPN]]></title><pubDate>Mon, 05 Oct 2026 16:42:26 -0700</pubDate>
<description><![CDATA[<p>Diet TBPN delivers the best of today’s TBPN episode in 30 minutes.</p>]]></description></item>
<item><title>Full episode</title><pubDate>Mon, 05 Oct 2026 14:28:59 -0700</pubDate>
<description><![CDATA[<p>(01:17) - AI Video Game Mods (18:04) - 𝕏 Timeline Reactions (57:09) - Linda Du, co-founder of Valon Technologies, discusses how her team built a mortgage servicer to prove its software. (01:38:33) - Sigil Wen discusses Underdog, a free, private personal AI that runs directly on users’ devices. TBPN is made possible by: Ramp - https://ramp.com</p>]]></description></item>
<item><title>Old episode</title><pubDate>Mon, 01 Jun 2026 10:00:00 -0700</pubDate><description>(01:00) - Something from June that is no longer right now at all, long enough.</description></item>
<item><title>Truncated`;

test("parses items from the head of a feed, ignoring a truncated tail", () => {
  const items = parseFeedItems(feed);
  assert.equal(items.length, 3);
  assert.equal(items[0].title, "Bats & Bricks | Diet TBPN");
  assert.match(items[1].description, /^\(01:17\) - AI Video Game Mods/);
  assert.ok(!items[1].description.includes("https://"), "URLs are dropped");
});

test("TBPN: Diet cuts are skipped, guest segments lead, reactions and sponsors are dropped", () => {
  const [diet, full] = parseFeedItems(feed);
  assert.deepEqual(splitTbpnChapters(diet), []);
  const chapters = splitTbpnChapters(full);
  assert.deepEqual(
    chapters.map((c) => c.title),
    ["Linda Du, co-founder of Valon Technologies", "Sigil Wen", "AI Video Game Mods"]
  );
  assert.ok(chapters.every((c) => !/Timeline|Ramp|made possible/.test(c.note)));
});

test("only recent items count as the world right now", () => {
  const signals = signalsFromItems(tbpn, parseFeedItems(feed), now);
  assert.equal(signals.length, 3);
  assert.ok(signals.every((s) => s.date === "2026-10-05"));
});

test("unsuitable topics never reach the prompt", () => {
  const items = [
    { title: "The sportsbook boom", description: "Betting apps everywhere.", pubDate: "Mon, 05 Oct 2026 10:00:00 GMT" },
    { title: "100 Objects: AA Sobriety Chip", description: "Alcoholics Anonymous history.", pubDate: "Mon, 05 Oct 2026 10:00:00 GMT" },
    { title: "Bats survive an epidemic", description: "A genetic secret helps little brown bats.", pubDate: "Mon, 05 Oct 2026 10:00:00 GMT" },
  ];
  assert.deepEqual(
    signalsFromItems(shortwave, items, now).map((s) => s.title),
    ["Bats survive an epidemic"]
  );
});

test("promotional sentences are stripped wherever they are", () => {
  assert.equal(
    stripPromo("This episode is sponsored by Claude. The phone that changed everything. Subscribe to our feed today."),
    "The phone that changed everything."
  );
});

test("the prompt block is dated, numbered and names its sources", () => {
  const block = formatWorldSignals({
    fetchedAt: now.toISOString(),
    origin: "snapshot",
    signals: signalsFromItems(tbpn, parseFeedItems(feed), now),
  });
  assert.match(block, /^WORLD RIGHT NOW .*gathered 2026-10-06, from the saved snapshot/);
  assert.match(block, /\[W1\] 2026-10-05 · TBPN — Linda Du, co-founder of Valon Technologies, discusses/);
  assert.equal(formatWorldSignals({ fetchedAt: now.toISOString(), origin: "live", signals: [] }), "");
});
