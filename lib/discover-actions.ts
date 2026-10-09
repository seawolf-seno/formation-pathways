"use server";

// The Server Actions the public /discover page registers. They live in their
// own file so the page can't accidentally expose any other staff action:
// /discover is public (proxy.ts), so every action it imports is callable by
// anyone. submitTestInquiryAction checks the caller is admin or admissions.
// The database function submit_inquiry() is the real gate (open switch,
// consent, field checks); this adds plain-language errors and two cheap
// spam checks. Rate limits belong in Vercel Firewall (docs/inquiries.md).
import { randomBytes } from "crypto";
import { getSorClient, isSorConfigured } from "@/lib/sor/supabase-server";
import { getStaffOrNull, logAccess } from "@/lib/sor/queries";
import { validateInquiry, welcomeMatches, type InquiryErrors, type InquiryPayload } from "@/lib/discover";
import { getConsentedAlumniStories } from "@/lib/queries";
import { syncDemoDb } from "@/lib/demo-persist";
import { pickStories } from "@/lib/inquiry";
import type { WelcomeStory } from "@/components/discover/FamilyWelcome";

/** Everything the welcome page straight after the form needs: built from
 *  what the family just sent, with no AI. */
export interface InquiryWelcome {
  childFirstName: string;
  parentFirstName: string;
  familyName: string;
  currentSchool: string | null;
  oneThing: string;
  consentPathway: boolean;
  /** The family's own code, for inviting another family (/discover?ref=…). */
  shareCode: string | null;
  /** Thank-yous are on: an invite carries the disclosure. */
  thanks: boolean;
  matches: { program: string; line: string }[];
  stories: WelcomeStory[];
  sameSchool: boolean;
  testInquiryId?: string;
}

export type InquiryResult = ({ ok: true } & InquiryWelcome) | { ok: false; error: string; errors?: InquiryErrors };

/** Graduate stories are the demo's invented set, so only fictional samples
 *  (test mode) get them; a real family sees none until real ones are consented. */
async function welcome(p: InquiryPayload, sample: boolean, shareCode: string | null, thanks: boolean): Promise<InquiryWelcome> {
  let stories: WelcomeStory[] = [];
  let sameSchool = false;
  if (sample) {
    await syncDemoDb();
    const picked = pickStories(getConsentedAlumniStories(), p.current_school);
    sameSchool = picked.sameSchool;
    stories = picked.stories.map((s) => ({ firstName: s.first_name, gradYear: s.grad_year, headline: s.headline, story: s.story, whereNow: s.where_now }));
  }
  return {
    childFirstName: p.child_first_name,
    parentFirstName: p.parent_first_name,
    familyName: p.parent_last_name,
    currentSchool: p.current_school || null,
    oneThing: p.one_thing,
    consentPathway: p.consent_pathway,
    shareCode,
    thanks,
    matches: welcomeMatches(p.interests),
    stories,
    sameSchool,
  };
}

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
  const { data: code, error } = await supabase.rpc("submit_inquiry", { p: checked.payload });
  if (error) {
    if (/aren't open yet/.test(error.message)) {
      return { ok: false, error: "We're not taking inquiries here just yet. Please use the school website for now." };
    }
    if (/already have your inquiry/.test(error.message)) {
      return { ok: false, error: "We already have your inquiries from today. Our admissions team will be in touch soon." };
    }
    console.error("submit_inquiry refused:", error.code);
    return { ok: false, error: "We couldn't save that just now. Please try again in a minute." };
  }
  // Whether an invite needs the reward disclosure. If we can't tell
  // (20261013000000 not applied yet), say it: disclosing is the safe side.
  const { data: thanksOn, error: thanksError } = await supabase.rpc("referral_thanks_open");
  const thanks = thanksError ? true : thanksOn === true;
  return { ok: true, ...(await welcome(checked.payload, false, typeof code === "string" ? code : null, thanks)) };
}

/**
 * Test mode: a signed-in admin or admissions user fills /discover while it's
 * closed (or open) and the inquiry is saved as a fictional sample: never
 * exported to Finalsite, clearly marked in the inbox. A real referral code in
 * the link is credited, so the referral chain can be shown end to end.
 */
export async function submitTestInquiryAction(input: Record<string, unknown>): Promise<InquiryResult> {
  const staff = await getStaffOrNull();
  if (!staff || (staff.role !== "admin" && staff.role !== "admissions")) {
    return { ok: false, error: "Test mode is for the admissions team." };
  }
  const checked = validateInquiry(input);
  if (!checked.ok) return { ok: false, error: "A few answers need another look.", errors: checked.errors };
  const { ref, source, ...fields } = checked.payload;
  const supabase = await getSorClient();
  let referredBy: string | null = null;
  if (ref) {
    const { data } = await supabase.from("inquiries").select("share_code").eq("share_code", ref).maybeSingle();
    referredBy = data?.share_code ?? null;
  }
  const { data, error } = await supabase
    .from("inquiries")
    .insert({
      ...fields,
      is_sample: true,
      share_code: randomBytes(4).toString("hex").toUpperCase(),
      source: referredBy ? "share" : source,
      referred_by_code: referredBy,
    })
    .select("id, share_code")
    .single();
  if (error) {
    console.error("test inquiry refused:", error.code);
    return { ok: false, error: "We couldn't save that test inquiry." };
  }
  await logAccess(staff, "inquiry_test_submit", null, { inquiry: data.id });
  // Samples always behave as if thank-yous were on (as on their family page).
  return { ok: true, ...(await welcome(checked.payload, true, data.share_code, true)), testInquiryId: data.id };
}
