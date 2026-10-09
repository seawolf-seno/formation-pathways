"use server";

// The only Server Actions an inquiring family's page (/welcome/[token])
// registers. /welcome is public (proxy.ts), so these are callable by anyone:
// each does nothing without a live family token, and the database functions
// (family_share, family_stop_sharing) check it again.
import { requestOrigin } from "@/lib/origin";
import { getSorClient, isSorConfigured } from "@/lib/sor/supabase-server";
import { isCardStyle, type CardStyle } from "@/lib/family-share";
import { isFamilyToken } from "@/lib/family-page";

export async function familyShareAction(
  token: string,
  index: number,
  style: CardStyle,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!isFamilyToken(token) || !Number.isInteger(index) || index < 0 || index > 5 || !isCardStyle(style) || !isSorConfigured()) {
    return { ok: false, error: "That link isn't working. Ask admissions for a new one." };
  }
  const supabase = await getSorClient();
  const { data, error } = await supabase.rpc("family_share", { p_token: token, p_index: index, p_style: style });
  if (error || typeof data !== "string") {
    if (error) console.error("family_share refused:", error.code);
    return { ok: false, error: "That link isn't working any more. Ask admissions for a new one." };
  }
  return { ok: true, url: `${await requestOrigin()}/w/${data}` };
}

export async function familyStopSharingAction(token: string): Promise<{ ok: boolean }> {
  if (!isFamilyToken(token) || !isSorConfigured()) return { ok: false };
  const supabase = await getSorClient();
  const { error } = await supabase.rpc("family_stop_sharing", { p_token: token });
  return { ok: !error };
}
