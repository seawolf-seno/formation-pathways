import "server-only";
import { youtubeId } from "./config";
import { kindForUrl } from "./course-resources";

/** A tagged link → what gets saved: https only, no sign-in details; a YouTube
 *  video gets its id, title and channel from YouTube's oEmbed. Throws a plain
 *  message. */
export async function describeLink(rawUrl: string, rawTitle: string) {
  let u: URL;
  try {
    u = new URL(rawUrl.trim());
  } catch {
    throw new Error("That isn't a web address.");
  }
  if (u.protocol !== "https:" || u.username || u.password) throw new Error("Only https addresses, with no sign-in details in them.");
  const url = u.toString().slice(0, 500);
  const kind = kindForUrl(url);
  if (kind === "video") {
    const id = youtubeId(url);
    if (!id) throw new Error("That YouTube address isn't a single video.");
    let title = rawTitle.replace(/\s*-\s*YouTube$/, "").trim();
    let channel: string | null = null;
    try {
      const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const d = (await res.json()) as { title?: string; author_name?: string };
        title = d.title || title;
        channel = d.author_name ?? null;
      }
    } catch {
      // Offline or slow: keep the page title.
    }
    if (!title) throw new Error("Give it a title.");
    return { kind, url: `https://www.youtube.com/watch?v=${id}`, video_id: id, title: title.slice(0, 200), channel: channel?.slice(0, 100) ?? null };
  }
  const title = rawTitle.trim() || u.hostname;
  return { kind, url, video_id: null, title: title.slice(0, 200), channel: null };
}
