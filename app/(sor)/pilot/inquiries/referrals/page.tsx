import Link from "next/link";
import { redirect } from "next/navigation";
import { getInquiries, getPilotSettings, getReferralThanks, logAccess, requireStaff } from "@/lib/sor/queries";
import { InquiryStatusPicker, ReferralSteps, ReferralThanksDecision } from "@/components/sor/InquiryControls";

export const metadata = { title: "Referrals · Formation Pathways" };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/**
 * Families who inquired through another family's shared pathway (Fizzy #29):
 * confirm each referral, then approve and record a thank-you once the family
 * they brought has applied (or enrolled, as leadership decided). The
 * thank-you is quiet: no public counts, no leaderboard. docs/referrals.md.
 */
export default async function ReferralsPage() {
  const staff = await requireStaff();
  if (staff.role !== "admin" && staff.role !== "admissions") redirect("/capture");
  const [settings, inquiries, referrals] = await Promise.all([getPilotSettings(), getInquiries(), getReferralThanks()]);
  await logAccess(staff, "view_referrals", null, { count: referrals.length });

  const byCode = new Map(inquiries.map((i) => [i.share_code, i]));
  const byReferred = new Map(referrals.map((r) => [r.referred_inquiry_id, r]));
  const referred = inquiries.filter((i) => i.source === "share" && i.referred_by_code);
  const waiting = referred.filter((i) => !byReferred.has(i.id)).length;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <Link href="/pilot/inquiries" className="text-xs text-[var(--color-ink-muted)] hover:underline">← Inquiries</Link>
        <h1 className="mt-2 font-display text-3xl text-[var(--color-navy-ink)]">Referrals</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--color-ink-muted)]">
          Families who inquired through another family&apos;s shared pathway. Confirm each one, then thank the family who shared
          once the family they brought has {settings.referral_thanks_on}. Nobody sees these counts but admissions.
        </p>
      </div>

      <section className="rounded-xl border border-[var(--color-border)] bg-white p-5">
        <h2 className="mb-3 font-display text-lg text-[var(--color-navy-ink)]">The thank-you</h2>
        {staff.role === "admin" ? (
          <ReferralThanksDecision settings={settings} />
        ) : settings.referral_thanks_open ? (
          <p className="text-sm">
            {settings.referral_thanks_what}, once the family they brought has {settings.referral_thanks_on}; at most{" "}
            {settings.referral_thanks_cap} per family.
          </p>
        ) : (
          <p className="text-sm text-[var(--color-ink-muted)]">
            Off for real families until an admin records leadership&apos;s decision. Samples can go the whole way.
          </p>
        )}
        <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-[var(--color-ink-muted)]">
          <li>Only the family whose link brought them, and never a family referring itself (same email or address).</li>
          <li>No cash or gift cards; a capped number per family; approved here, then sent by a named staff member.</li>
          <li>While thank-yous are on, every share says so plainly, as the FTC requires for a post made for a reward.</li>
        </ul>
      </section>

      <section className="rounded-xl border border-[var(--color-border)] bg-white p-5">
        <h2 className="mb-1 font-display text-lg text-[var(--color-navy-ink)]">Families who came through a link ({referred.length})</h2>
        <p className="mb-4 text-sm text-[var(--color-ink-muted)]">
          {waiting ? `${waiting} waiting to be confirmed.` : "Nothing waiting."}
        </p>
        {referred.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-muted)]">
            None yet. Open a family&apos;s shared link (/w/…), tap <i>Tell us about your child</i>, and send a test inquiry with a
            different email to see one here.
          </p>
        ) : (
          <ul className="space-y-4">
            {referred.map((i) => {
              const referrer = byCode.get(i.referred_by_code!);
              const referrerName = referrer ? `the ${referrer.parent_last_name} family` : "a family";
              return (
                <li key={i.id} className="rounded-lg border border-[var(--color-border)] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link href={`/pilot/inquiries/${i.id}`} className="font-medium text-[var(--color-navy-ink)] underline decoration-[var(--color-border)] underline-offset-2">
                        {i.child_first_name} {i.child_last_name}
                      </Link>
                      {i.is_sample && <span className="ml-2 rounded bg-[var(--color-gold-light)] px-1.5 py-0.5 text-[10px] font-semibold uppercase">Sample</span>}
                      <p className="text-xs text-[var(--color-ink-muted)]">
                        Inquired {day(i.created_at)} through{" "}
                        {referrer ? (
                          <Link href={`/pilot/inquiries/${referrer.id}`} className="underline">{referrerName}&apos;s link</Link>
                        ) : (
                          "a family's link"
                        )}{" "}
                        ({i.referred_by_code})
                      </p>
                    </div>
                    <InquiryStatusPicker id={i.id} status={i.status} />
                  </div>
                  <div className="mt-3 border-t border-[var(--color-border)] pt-3">
                    <ReferralSteps
                      referredId={i.id}
                      referral={byReferred.get(i.id) ?? null}
                      referredStatus={i.status}
                      thanksOn={settings.referral_thanks_on}
                      thanksAllowed={i.is_sample || settings.referral_thanks_open}
                      thanksWhat={settings.referral_thanks_what}
                      referrerName={referrerName}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
