"use server";

// The one Server Action the public /discover page registers. It lives in its
// own file so the page can't accidentally expose any staff action: /discover
// is public (proxy.ts), so every action it imports is callable by anyone.
// The database function submit_inquiry() is the real gate (open switch,
// consent, field checks); this adds plain-language errors and two cheap
// spam checks. Rate limits belong in Vercel Firewall (docs/inquiries.md).
import { getSorClient, isSorConfigured } from "@/lib/sor/supabase-server";
import { validateInquiry, type InquiryErrors } from "@/lib/discover";

export type InquiryResult =
  | { ok: true; childFirstName: string; parentFirstName: string; oneThing: string }
  | { ok: false; error: string; errors?: InquiryErrors };

/** Humans take longer than this to read and fill the form. */
const MIN_FILL_MS = 4000;

export async function submitInquiryAction(input: Record<string, unknown>): Promise<InquiryResult> {
  // A field people can't see: if it's filled, a bot filled it. Say nothing useful.
  if (typeof input.website === "string" && input.website.trim()) {
    return { ok: false, error: "Something went wrong. Please try again in a minute." };
  }
  const startedAt = Number(input.started_at);
  if (!Number.isFinite(startedAt) || Date.now() - startedAt < MIN_FILL_MS) {
    return { ok: false, error: "That was quick! Please check your answers and send again." };
  }
  const checked = validateInquiry(input);
  if (!checked.ok) return { ok: false, error: "A few answers need another look.", errors: checked.errors };
  if (!isSorConfigured()) return { ok: false, error: "Inquiries aren't available here." };

  const supabase = await getSorClient();
  const { error } = await supabase.rpc("submit_inquiry", { p: checked.payload });
  if (error) {
    if (/aren't open yet/.test(error.message)) {
      return { ok: false, error: "We're not taking inquiries here just yet. Please use the school website for now." };
    }
    console.error("submit_inquiry refused:", error.code);
    return { ok: false, error: "We couldn't save that just now. Please try again in a minute." };
  }
  return {
    ok: true,
    childFirstName: checked.payload.child_first_name,
    parentFirstName: checked.payload.parent_first_name,
    oneThing: checked.payload.one_thing,
  };
}
