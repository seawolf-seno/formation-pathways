import { test } from "node:test";
import assert from "node:assert/strict";
import { topChannels } from "../lib/youtube-takeout.ts";

const watched = (channel, ad = false) => ({
  header: "YouTube",
  title: "Watched something",
  subtitles: channel ? [{ name: channel, url: "https://www.youtube.com/channel/x" }] : undefined,
  details: ad ? [{ name: "From Google Ads" }] : undefined,
  time: "2026-09-01T00:00:00Z",
});

test("top channels by count, ads and removed videos skipped", () => {
  const history = [watched("Mark Rober"), watched("Veritasium"), watched("Mark Rober"), watched("Some Brand", true), watched(null), watched("Veritasium"), watched("Mark Rober")];
  assert.deepEqual(topChannels(history), [
    { name: "Mark Rober", count: 3 },
    { name: "Veritasium", count: 2 },
  ]);
  assert.equal(topChannels(history, 1).length, 1);
});

test("a file that isn't watch history says so", () => {
  assert.throws(() => topChannels({ not: "an array" }), /watch-history\.json/);
});
