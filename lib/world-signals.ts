// "The world right now" for pathway drafting: dated items from public podcast
// show notes (TBPN first, as in seno's TeenAlpha project, plus a few shows
// that cover entrepreneurship, design and science, so a kid who loves bats or
// bricks gets a timely signal too, not only the startup kids).
//
// Privacy: this module only READS public RSS feeds. Nothing about a student
// is ever sent anywhere from here; the signals are added to the Claude prompt
// next to the student's evidence, and the prompt decides what fits.
//
// Feeds are large (TBPN is ~7 MB), too big for Next's data cache, so we read
// only the head of each feed (newest items first) and stop. Results are kept
// in memory per server instance for a few hours. If every feed fails, the
// checked-in snapshot (fixtures/world-signals.json, refreshed by
// `npm run world:refresh`) keeps drafting working offline. WORLD_SIGNALS=off
// skips the network entirely and uses the snapshot.
//
// No `@/` imports: tests and scripts/refresh-world-signals.mjs load this file
// directly with Node's type stripping.
import fs from "fs";
import path from "path";

export interface WorldSource {
  id: string;
  name: string;
  url: string;
  /** What this show tends to cover, so the prompt can match lenses to kids. */
  lens: string;
  /** Newest episodes to read from the head of the feed. */
  episodes: number;
}

export interface WorldSignal {
  source: string;
  lens: string;
  /** YYYY-MM-DD */
  date: string;
  title: string;
  note: string;
}

export interface WorldSignals {
  fetchedAt: string;
  signals: WorldSignal[];
  /** "live" from the feeds, or "snapshot" from the checked-in fallback. */
  origin: "live" | "snapshot";
}

export const WORLD_SOURCES: WorldSource[] = [
  {
    id: "tbpn",
    name: "TBPN",
    url: "https://feeds.transistor.fm/technology-brother",
    lens: "startups, AI, hardware, defense, space, what founders are building this week",
    episodes: 8,
  },
  {
    id: "hibt",
    name: "How I Built This",
    url: "https://rss.art19.com/how-i-built-this",
    lens: "entrepreneurs across food, fashion, outdoors, consumer products, family businesses",
    episodes: 4,
  },
  {
    id: "99pi",
    name: "99% Invisible",
    url: "https://feeds.simplecast.com/BqbsxVfO",
    lens: "design, architecture, cities, everyday objects, history hiding in plain sight",
    episodes: 4,
  },
  {
    id: "shortwave",
    name: "Short Wave (NPR)",
    url: "https://feeds.npr.org/510351/podcast.xml",
    lens: "new science: biology, health, space, climate, animals",
    episodes: 5,
  },
  {
    id: "radiolab",
    name: "Radiolab",
    url: "https://feeds.simplecast.com/EmVW7VGp",
    lens: "curious science and human stories, music, the brain",
    episodes: 3,
  },
];

/** Only items this recent count as "right now". */
export const MAX_AGE_DAYS = 45;
const MAX_SIGNALS = 40;
const NOTE_MAX = 340;
const TBPN_GUESTS_PER_EPISODE = 4;
const TBPN_HEADLINES_PER_EPISODE = 2;
const HEAD_BYTES_MAX = 1_500_000;
const FETCH_TIMEOUT_MS = 6000;
const CACHE_MS = 6 * 60 * 60 * 1000;

// Not for a Christian high school's pathway drafts, or simply not a pathway.
const UNSUITABLE =
  /\b(gambl\w*|betting|sportsbook|casino|prediction market\w*|polymarket|kalshi|memecoin\w*|onlyfans|porn\w*|sex\w*|murder\w*|suicide|overdose|drunk\w*|alcohol\w*|sobriety|cannabis|marijuana|vap(e|ing)|election\w*|trump|biden|harris|democrat\w*|republican\w*|partisan)\b/i;
// Old episodes re-released: not "right now", whatever the feed date says.
const RERUN = /\b(first aired|originally aired|first published|rebroadcast|encore|from the archives?|we're revisiting|a replay)\b/i;
// Money as the point (raises, valuations, funds): dropped sentence by sentence,
// so a guest segment keeps what they're building and loses what they raised.
const MONEY = /(\$\s?\d|\b\d+(\.\d+)?\s?(million|billion)\b|\braise[sd]?\b|\bfundrais\w*|\bseries [a-f]\b|\bvaluation\b|\bventure (fund|capital|firm)\b|\binvest(s|ing|ment|ments|or|ors)?\b)/i;
const MIN_NOTE = 40;

// TBPN chapters that are reactions or banter rather than something a kid could grow toward.
const TBPN_NOISE = /timeline reactions|mansion section|white pill|^intro$|^outro$|ad read|sponsor/i;
// A whole promotional sentence anywhere in the notes.
const PROMO_SENTENCE = /\b(sponsored by|subscribe|ad-free|free trial|ad choices|newsletter|patreon|become a member|leadership support|tickets)\b/i;
// Promotional tails in show notes.
const PROMO =
  /(TBPN is made possible by|Subscribe to |Learn more about your ad choices|See omnystudio|Sign up for |Support (the show|NPR|Radiolab)|Become a member|Listen (to|ad-free)|Follow (us|TBPN|the show)|Want more |Leadership support for |This episode was produced|Interested in sponsoring|Email us at|Check out our|Our newsletter|Get tickets).*$/i;

export function decodeEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&rsquo;|&#8217;/g, "'")
    .replace(/&lsquo;|&#8216;/g, "'")
    .replace(/&ldquo;|&rdquo;|&#822[01];/g, '"')
    .replace(/&mdash;|&#8212;/g, "—")
    .replace(/&ndash;|&#8211;/g, "–")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
}

/** Plain text: entities decoded, tags and URLs dropped, whitespace collapsed. */
export function cleanText(text: string): string {
  return decodeEntities(decodeEntities(text))
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Drops sentences about money raised, valuations and investing. */
export function stripMoney(text: string): string {
  const sentences = text.match(/[^.!?]+(?:[.!?]+\s*|$)/g) ?? [];
  return sentences
    .filter((sentence) => !MONEY.test(sentence))
    .join("")
    .trim();
}

/** Drops promotional sentences and the boilerplate tail. */
export function stripPromo(text: string): string {
  const sentences = text.replace(PROMO, "").match(/[^.!?]+(?:[.!?]+\s*|$)/g) ?? [];
  return sentences
    .filter((sentence) => !PROMO_SENTENCE.test(sentence))
    .join("")
    .trim();
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? m[1] : "";
}

export interface FeedItem {
  title: string;
  description: string;
  pubDate: string;
}

/** Items from RSS XML, newest first as the feed lists them. Tolerates a
 *  truncated document (we only read the head of each feed). */
export function parseFeedItems(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const item = m[1];
    const description = tag(item, "description") || tag(item, "itunes:summary") || tag(item, "content:encoded");
    items.push({
      title: cleanText(tag(item, "title")),
      description: cleanText(description),
      pubDate: cleanText(tag(item, "pubDate")),
    });
  }
  return items;
}

function isoDate(pubDate: string): string | null {
  const t = Date.parse(pubDate);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

/** TBPN show notes are chapters: "(01:29:21) - Linda Du … discusses …".
 *  Each guest chapter is its own signal; the "Diet TBPN" cut is boilerplate. */
export function splitTbpnChapters(item: FeedItem): { title: string; note: string }[] {
  if (/diet tbpn/i.test(item.title) || /^Diet TBPN delivers/i.test(item.description)) return [];
  const body = item.description.replace(PROMO, "").trim();
  const parts = body.split(/\(\d{1,2}:\d{2}(?::\d{2})?\)\s*[-–—]\s*/).map((p) => p.trim()).filter(Boolean);
  // Long chapters are guest segments (who is building what): the useful part.
  // Short ones are headlines ("Fiat's $15k Microcar"): keep a couple for flavour.
  const guests = parts.filter((p) => p.length >= 60 && !TBPN_NOISE.test(p));
  const headlines = parts.filter((p) => p.length < 60 && !TBPN_NOISE.test(p));
  return [
    ...guests.slice(0, TBPN_GUESTS_PER_EPISODE).map((p) => ({
      // "Linda Du, president … of Valon Technologies, discusses …" → the who.
      title: clip(p.split(/\s+(?:discusses|explains|talks|joins|shares)\b/)[0].replace(/[,;:\s]+$/, ""), 120),
      note: p,
    })),
    ...headlines.slice(0, TBPN_HEADLINES_PER_EPISODE).map((p) => ({ title: p, note: p })),
  ];
}

/** Signals from one feed's items, filtered for recency and suitability. */
export function signalsFromItems(source: WorldSource, items: FeedItem[], now: Date = new Date()): WorldSignal[] {
  const cutoff = now.getTime() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const signals: WorldSignal[] = [];
  for (const item of items.slice(0, source.episodes * 3)) {
    const date = isoDate(item.pubDate);
    if (!date || Date.parse(date) < cutoff) continue;
    const pieces =
      source.id === "tbpn"
        ? splitTbpnChapters(item)
        : [{ title: item.title, note: stripPromo(item.description) }];
    for (const p of pieces) {
      if (RERUN.test(`${p.title} ${p.note}`)) continue;
      const unmoneyed = stripMoney(p.note);
      // A note that was mostly about money leaves too little to stand on.
      if (!unmoneyed || (unmoneyed !== p.note.trim() && unmoneyed.length < MIN_NOTE)) continue;
      const note = clip(unmoneyed, NOTE_MAX);
      if (UNSUITABLE.test(`${p.title} ${note}`)) continue;
      signals.push({ source: source.name, lens: source.lens, date, title: clip(p.title, 140), note });
    }
    if (source.id !== "tbpn" && signals.length >= source.episodes) break;
  }
  // TBPN yields several chapters per episode; about four episodes' worth.
  return source.id === "tbpn" ? signals.slice(0, 24) : signals;
}

/** Reads only the head of a feed: stops once `episodes` items are in hand. */
async function fetchFeedHead(source: WorldSource): Promise<string> {
  const res = await fetch(source.url, {
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      Accept: "application/rss+xml, application/xml, text/xml",
      "User-Agent": "FormationPathways/1.0 (Pacifica Christian High School)",
    },
  });
  if (!res.ok || !res.body) throw new Error(`${source.name}: HTTP ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let xml = "";
  // Read double: TBPN's "Diet" cuts don't count, and some items get filtered.
  const want = source.episodes * 2;
  try {
    while (xml.length < HEAD_BYTES_MAX) {
      const { done, value } = await reader.read();
      if (done) break;
      xml += decoder.decode(value, { stream: true });
      if ((xml.match(/<\/item>/g)?.length ?? 0) >= want) break;
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return xml;
}

const SNAPSHOT_PATH = path.join(process.cwd(), "fixtures", "world-signals.json");

export function readSnapshot(): WorldSignals {
  try {
    const parsed = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf-8")) as WorldSignals;
    return { fetchedAt: parsed.fetchedAt, signals: parsed.signals ?? [], origin: "snapshot" };
  } catch {
    return { fetchedAt: new Date(0).toISOString(), signals: [], origin: "snapshot" };
  }
}

/** Interleave sources so no one show crowds the prompt, newest first within each. */
function interleave(groups: WorldSignal[][]): WorldSignal[] {
  const out: WorldSignal[] = [];
  for (let i = 0; out.length < MAX_SIGNALS; i++) {
    const row = groups.map((g) => g[i]).filter(Boolean);
    if (row.length === 0) break;
    out.push(...row);
  }
  return out.slice(0, MAX_SIGNALS);
}

/** Fetches every source in parallel; a failed feed is skipped, not fatal. */
export async function fetchWorldSignalsLive(now: Date = new Date()): Promise<WorldSignals> {
  const groups = await Promise.all(
    WORLD_SOURCES.map(async (source) => {
      try {
        return signalsFromItems(source, parseFeedItems(await fetchFeedHead(source)), now);
      } catch {
        return [];
      }
    })
  );
  return { fetchedAt: now.toISOString(), signals: interleave(groups), origin: "live" };
}

type Cache = { at: number; value?: WorldSignals; pending?: Promise<WorldSignals> };
const g = globalThis as unknown as { __worldSignals?: Cache };

/** Live signals (cached a few hours per instance), else the snapshot. Never throws. */
export async function getWorldSignals(): Promise<WorldSignals> {
  if (process.env.WORLD_SIGNALS === "off") return readSnapshot();
  const cache = (g.__worldSignals ??= { at: 0 });
  if (cache.value && Date.now() - cache.at < CACHE_MS) return cache.value;
  cache.pending ??= fetchWorldSignalsLive()
    .then((live) => {
      const value = live.signals.length > 0 ? live : readSnapshot();
      cache.value = value;
      cache.at = Date.now();
      return value;
    })
    .catch(() => readSnapshot())
    .finally(() => {
      cache.pending = undefined;
    });
  return cache.pending;
}

/** "TBPN · Oct 5, 2026" for a signal, the only form a pathway's source takes. */
export function signalSource(s: WorldSignal): string {
  const day = new Date(`${s.date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return `${s.source} · ${day}`;
}

// Words that say nothing about which item a sentence restates.
const GENERIC = new Set(
  "about after again people their there these those which while would could should being doing making through student students school pacifica episode recent recently podcast notes something someone everyone things right where other every still later today world".split(" ")
);
function contentWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 5 && !GENERIC.has(w))
      .map((w) => w.slice(0, 6))
  );
}
/** A why-now has to say something the cited item says: at least two of its
 *  distinctive words. Catches a line that cites W7 but talks about W12, or
 *  about nothing in the notes at all. */
export function restatesSignal(whyNow: string, s: WorldSignal): boolean {
  const theirs = contentWords(`${s.title} ${s.note}`);
  let shared = 0;
  for (const w of contentWords(whyNow)) if (theirs.has(w)) shared++;
  return shared >= 2;
}

/** At most this many pathways in one draft carry a "why now". */
export const MAX_WHY_NOWS = 3;

/**
 * Keeps a pathway's "why now" only when it cites a real signal ("whyNowRef":
 * "W7", numbered as in formatWorldSignals), that signal isn't already used by
 * an earlier pathway, the line actually restates it (restatesSignal), and the
 * draft is under MAX_WHY_NOWS. The source line is
 * rewritten from the signal itself, never the model's text. Everything else
 * loses its why-now. Pure; works on the model's raw pathway objects.
 */
export function groundWhyNows<T extends object>(pathways: T[], signals: WorldSignal[], max = MAX_WHY_NOWS): T[] {
  const used = new Set<number>();
  return pathways.map((p) => {
    const rest = { ...(p as Record<string, unknown>) };
    const { whyNow, whyNowRef } = rest;
    delete rest.whyNow;
    delete rest.whyNowRef;
    delete rest.whyNowSource;
    const n = typeof whyNowRef === "string" ? Number(whyNowRef.trim().match(/^\[?W(\d+)\]?$/i)?.[1]) : NaN;
    const signal = Number.isInteger(n) ? signals[n - 1] : undefined;
    if (typeof whyNow !== "string" || !whyNow.trim() || !signal || used.has(n) || used.size >= max) return rest as T;
    if (!restatesSignal(whyNow, signal)) return rest as T;
    used.add(n);
    return { ...rest, whyNow, whyNowSource: signalSource(signal) } as T;
  });
}

/** The block appended to the user message. Empty string when there's nothing. */
export function formatWorldSignals(world: WorldSignals): string {
  if (world.signals.length === 0) return "";
  const lines = world.signals.map(
    (s, i) => `[W${i + 1}] ${s.date} · ${s.source} — ${s.note.startsWith(s.title) ? s.note : `${s.title}: ${s.note}`}`
  );
  return (
    `WORLD RIGHT NOW (public podcast show notes, newest first; gathered ${world.fetchedAt.slice(0, 10)}` +
    `${world.origin === "snapshot" ? ", from the saved snapshot" : ""}). Shows and what they cover: ` +
    WORLD_SOURCES.map((s) => `${s.name} (${s.lens})`).join("; ") +
    ".\n" +
    lines.join("\n")
  );
}
