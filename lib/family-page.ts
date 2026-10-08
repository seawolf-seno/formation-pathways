import "server-only";
// Reads for an inquiring family's own page and their public shares, through
// the database functions in 20261011000000_family_share.sql (callable with
// no sign-in). Nothing here reads a table directly.
import { getSorClient, isSorConfigured } from "@/lib/sor/supabase-server";
import { isCardStyle, parsePublicShare, type CardStyle, type PublicShare } from "@/lib/family-share";
import type { GeneratedPathway } from "@/lib/types";

/** Family link tokens: 32 url-safe characters (randomBytes(24), base64url). */
export const isFamilyToken = (t: unknown): t is string => typeof t === "string" && /^[A-Za-z0-9_-]{32}$/.test(t);
export const isShareCode = (c: unknown): c is string => typeof c === "string" && /^[0-9a-f]{12}$/.test(c);

export interface FamilyPage {
  childFirstName: string;
  parentFirstName: string;
  familyName: string;
  currentSchool: string | null;
  oneThing: string | null;
  interests: string[];
  shareCode: string;
  isSample: boolean;
  expiresAt: string;
  pathways: GeneratedPathway[] | null;
}

export async function getFamilyPage(token: string): Promise<FamilyPage | null> {
  if (!isFamilyToken(token) || !isSorConfigured()) return null;
  const supabase = await getSorClient();
  const { data, error } = await supabase.rpc("family_page", { p_token: token });
  if (error || !data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  return {
    childFirstName: String(d.child_first_name ?? ""),
    parentFirstName: String(d.parent_first_name ?? ""),
    familyName: String(d.family_name ?? ""),
    currentSchool: typeof d.current_school === "string" ? d.current_school : null,
    oneThing: typeof d.one_thing === "string" ? d.one_thing : null,
    interests: Array.isArray(d.interests) ? d.interests.filter((x): x is string => typeof x === "string") : [],
    shareCode: String(d.share_code ?? ""),
    isSample: d.is_sample === true,
    expiresAt: String(d.expires_at ?? ""),
    pathways: Array.isArray(d.pathways) && d.pathways.length ? (d.pathways as GeneratedPathway[]) : null,
  };
}

/** One of the family's own pathways in the shape a public share has, for card previews. */
export function pageAsShare(page: FamilyPage, index: number, style: CardStyle): PublicShare | null {
  const p = page.pathways?.[index];
  if (!p) return null;
  return parsePublicShare({
    first_name: page.childFirstName,
    style,
    ref: page.shareCode,
    pathway: {
      name: p.name, glimpse: p.glimpse, firstSemester: p.firstSemester,
      fourYearHorizon: p.fourYearHorizon, mentorArchetype: p.mentorArchetype,
    },
  });
}

export async function getPublicShare(code: string): Promise<PublicShare | null> {
  if (!isShareCode(code) || !isSorConfigured()) return null;
  const supabase = await getSorClient();
  const { data, error } = await supabase.rpc("public_share", { p_code: code });
  if (error) return null;
  return parsePublicShare(data);
}

export { isCardStyle };
