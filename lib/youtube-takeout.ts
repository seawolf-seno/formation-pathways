// Reads a YouTube watch history from Google Takeout (watch-history.json) and
// returns the channels watched most. Runs in the STUDENT'S BROWSER only: the
// file is never uploaded. The student then picks the channels that are really
// them, and only those names are saved. Pure, so it's testable in node.

export interface ChannelCount {
  name: string;
  count: number;
}

interface TakeoutEntry {
  title?: unknown;
  subtitles?: { name?: unknown }[];
  details?: { name?: unknown }[];
}

/** Top channels by number of videos watched, ads and removed videos excluded. */
export function topChannels(json: unknown, limit = 15): ChannelCount[] {
  if (!Array.isArray(json)) throw new Error("That doesn't look like watch-history.json (choose JSON format in Takeout).");
  const counts = new Map<string, number>();
  for (const entry of json as TakeoutEntry[]) {
    if (!entry || typeof entry !== "object") continue;
    const isAd = Array.isArray(entry.details) && entry.details.some((d) => typeof d?.name === "string" && /ads/i.test(d.name));
    if (isAd) continue;
    const name = Array.isArray(entry.subtitles) ? entry.subtitles[0]?.name : undefined;
    if (typeof name !== "string" || !name.trim()) continue; // removed or private videos have no channel
    const key = name.trim();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}
