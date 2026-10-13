// Resources a teacher tagged for one course (the browser extension, or the
// course page), merged into that course's standards for its pages: a tagged
// YouTube video joins the standard's (or unit's) videos, anything else its
// study links. The shared standard set itself is untouched. Pure; tested in
// tests/mastery.test.mjs.

import { RESOURCE_KINDS, type MasteryConfig, type ResourceKind } from "./config.ts";

export interface CourseResourceRow {
  id: string;
  standard_code: string | null;
  group_code: string | null;
  kind: string;
  title: string;
  url: string;
  video_id: string | null;
  channel: string | null;
  note: string | null;
  created_at?: string;
}

export function withCourseResources(config: MasteryConfig, rows: CourseResourceRow[]): MasteryConfig {
  if (!rows.length) return config;
  const groups = config.groups.map((g) => ({
    ...g,
    resources: [...g.resources],
    videos: [...g.videos],
    standards: g.standards.map((s) => ({ ...s, resources: [...s.resources], videos: [...s.videos] })),
  }));
  for (const r of rows) {
    const group = groups.find((g) => g.code === r.group_code) ?? null;
    const standard = groups.flatMap((g) => g.standards).find((s) => s.code === r.standard_code) ?? null;
    const target = standard ?? group;
    if (!target) continue; // a standard that was renamed away: hidden, not lost
    if (r.kind === "video" && r.video_id) {
      if (!target.videos.some((v) => v.id === r.video_id))
        target.videos.unshift({ id: r.video_id, title: r.title, channel: r.channel ?? "YouTube", topics: r.note });
    } else {
      const kind: ResourceKind = RESOURCE_KINDS.includes(r.kind as ResourceKind) ? (r.kind as ResourceKind) : "other";
      if (!target.resources.some((x) => x.url === r.url)) target.resources.unshift({ kind, label: r.title, url: r.url });
    }
  }
  return { ...config, groups };
}

/** What kind of resource a page is, from its address. */
export function kindForUrl(url: string): "video" | ResourceKind {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "other";
  }
  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be") return "video";
  if (host.endsWith("khanacademy.org")) return "khan";
  if (host === "phet.colorado.edu") return "phet";
  if (host === "openstax.org") return "openstax";
  if (host.endsWith("collegeboard.org")) return "ap_classroom";
  return "other";
}
