// What an inquiring family shares, and how it looks. Pure: no I/O.
//
// A public share (`public_share()` in supabase/migrations/
// 20261011000000_family_share.sql) carries the child's first name and one
// signed pathway's name, glimpse, first semester, horizon and mentor line.
// The card keeps less still: the mentor line becomes its department only (a
// teacher's name is never shareable), and the text is cut to fit.
import { publicProgramLine, splitSentences } from "./share.ts";

export type CardStyle = "tide" | "paper" | "sky";
export const CARD_STYLES: CardStyle[] = ["tide", "paper", "sky"];

export interface Palette {
  label: string;
  bg: string;
  bg2: string;
  ink: string;
  muted: string;
  accent: string;
  waveBack: string;
  waveFront: string;
  crest: string;
  logo: "white" | "navy";
}

export const PALETTES: Record<CardStyle, Palette> = {
  tide: {
    label: "Night tide", bg: "#16324f", bg2: "#0f2338", ink: "#ffffff", muted: "#c9d6e6", accent: "#d9b35c",
    waveBack: "#2e5784", waveFront: "#8fb3d9", crest: "#ffffff", logo: "white",
  },
  paper: {
    label: "Paper", bg: "#f8f5ed", bg2: "#efe7d6", ink: "#16324f", muted: "#526474", accent: "#9c7631",
    waveBack: "#8fb3d9", waveFront: "#16324f", crest: "#f8f5ed", logo: "navy",
  },
  sky: {
    label: "Morning sky", bg: "#eaf1f8", bg2: "#c9dcef", ink: "#16324f", muted: "#3d5670", accent: "#9c7631",
    waveBack: "#ffffff", waveFront: "#8fb3d9", crest: "#ffffff", logo: "navy",
  },
};

export function isCardStyle(v: unknown): v is CardStyle {
  return v === "tide" || v === "paper" || v === "sky";
}

export interface PublicShare {
  firstName: string;
  /** Pacifica thanks families for referrals: the post must say so. */
  thanks: boolean;
  style: CardStyle;
  /** The family's referral code: /discover?ref=… */
  ref: string;
  pathway: {
    name: string;
    glimpse: string | null;
    firstSemester: string;
    fourYearHorizon: string[];
    mentorArchetype: string;
  };
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Validates what public_share() or family_page() returned. Null if unusable. */
export function parsePublicShare(raw: unknown): PublicShare | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const p = (r.pathway ?? {}) as Record<string, unknown>;
  const firstName = str(r.first_name, 60);
  const name = str(p.name, 160);
  const ref = str(r.ref, 8);
  if (!firstName || !name || !/^[A-Z0-9]{8}$/.test(ref) || !isCardStyle(r.style)) return null;
  return {
    firstName,
    thanks: r.thanks === true,
    style: r.style,
    ref,
    pathway: {
      name,
      glimpse: str(p.glimpse, 1200) || null,
      firstSemester: str(p.firstSemester, 1500),
      fourYearHorizon: Array.isArray(p.fourYearHorizon)
        ? p.fourYearHorizon.map((h) => str(h, 200)).filter(Boolean).slice(0, 3)
        : [],
      mentorArchetype: str(p.mentorArchetype, 800),
    },
  };
}

/** Whole sentences up to `max` characters; one long sentence is cut at a word. */
export function fitSentences(text: string, max: number): string {
  const sentences = splitSentences(text);
  let out = "";
  for (const s of sentences) {
    if ((out ? out.length + 1 : 0) + s.length > max) break;
    out = out ? `${out} ${s}` : s;
  }
  if (out) return out;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max / 2)).trimEnd()}…`;
}

export interface CardContent {
  firstName: string;
  pathwayName: string;
  /** The glimpse (a moment inside the pathway), or the first semester. */
  line: string;
  horizon: string[];
  /** Department only, e.g. "Science". */
  program: string | null;
}

export function cardContent(share: PublicShare, lineMax = 230): CardContent {
  const source = share.pathway.glimpse || share.pathway.firstSemester;
  return {
    firstName: share.firstName,
    pathwayName: share.pathway.name,
    line: source ? fitSentences(source, lineMax) : "",
    horizon: share.pathway.fourYearHorizon.map((h) => (h.length > 70 ? `${h.slice(0, 68).trimEnd()}…` : h)),
    program: share.pathway.mentorArchetype ? publicProgramLine(share.pathway.mentorArchetype) : null,
  };
}

// DRAFT for comms/legal (card #29): a post made for a reward has to say so
// plainly (the FTC's endorsement rules). Shown only while thank-yous are on.
export const SHARE_DISCLOSURE = "(Pacifica may send our family a thank-you if you inquire through this link.)";
export const PAGE_DISCLOSURE =
  "The family who shared this may receive a small thank-you from Pacifica if you inquire through their link.";

/** The post a family starts from; they can rewrite it. */
export function defaultCaption(firstName: string, pathwayName: string, url: string, thanks = false): string {
  const post = `We're exploring Pacifica Christian, and they drew up a few ways ${firstName} could grow there. This one is "${pathwayName}." Wondering about Pacifica for your own family? Start here: ${url}`;
  return withDisclosure(post, thanks);
}

/** What's actually shared: the family's words, with the disclosure kept even
 *  if they edited it out. */
export function withDisclosure(text: string, thanks: boolean): string {
  if (!thanks || text.includes(SHARE_DISCLOSURE)) return text;
  return `${text.trimEnd()}\n\n${SHARE_DISCLOSURE}`;
}

export interface ShareTarget {
  id: "facebook" | "x" | "whatsapp" | "email" | "text";
  label: string;
  href: string;
}

/** Links that open each network's own share screen with the link filled in. */
export function shareTargets(url: string, caption: string, firstName: string): ShareTarget[] {
  const u = encodeURIComponent(url);
  const withoutUrl = caption.replace(url, "").replace(/\s+$/, "").replace(/:$/, ".");
  const t = encodeURIComponent(withoutUrl);
  const all = encodeURIComponent(caption.includes(url) ? caption : `${caption} ${url}`);
  return [
    { id: "facebook", label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { id: "x", label: "X", href: `https://x.com/intent/post?text=${t}&url=${u}` },
    { id: "whatsapp", label: "WhatsApp", href: `https://wa.me/?text=${all}` },
    { id: "email", label: "Email", href: `mailto:?subject=${encodeURIComponent(`${firstName}'s pathway at Pacifica`)}&body=${all}` },
    { id: "text", label: "Text", href: `sms:?&body=${all}` },
  ];
}
