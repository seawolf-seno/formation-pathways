"use client";

import { useState, type ReactNode } from "react";
import type { InquiryWelcome } from "@/lib/discover-actions";
import { FIRST_WEEK } from "@/lib/discover";
import { FamilyWelcome } from "./FamilyWelcome";
import { InquiryForm } from "./InquiryForm";

/**
 * /discover: the form, then, the moment it's sent, the family's welcome
 * built only from what they told us (no AI): their words back, programs that
 * fit, a first week here, and what happens next. The signed pathway follows
 * by email (the same page at /welcome/[token], with sharing).
 */
export function DiscoverFlow({
  intro, years, source, referral, testMode,
}: {
  /** The page's own header and promise, shown above the form. */
  intro: ReactNode;
  years: number[];
  source: "website" | "direct";
  referral: string | null;
  testMode: boolean;
}) {
  const [done, setDone] = useState<InquiryWelcome | null>(null);

  if (!done) {
    return (
      <div className="dsc-wrap">
        {intro}
        <InquiryForm years={years} source={source} referral={referral} testMode={testMode} onDone={setDone} />
      </div>
    );
  }

  const next = (
    <section className="family-choices fw-section fw-next" aria-live="polite">
      <div className="family-section-heading">
        <div>
          <p className="family-eyebrow">Inquiry received</p>
          <h2>What happens next</h2>
        </div>
      </div>
      <ol className="fw-steps">
        <li>
          <b>1</b>
          <span>Someone from our admissions team reads every inquiry, and will be in touch by email.</span>
        </li>
        {done.consentPathway && (
          <li>
            <b>2</b>
            <span>
              We&apos;ll prepare a Formation Pathway for {done.childFirstName} from what you shared. A member of our team reads
              and signs it, then emails you a private link to it.
            </span>
          </li>
        )}
        <li>
          <b>{done.consentPathway ? 3 : 2}</b>
          <span>
            In the meantime, come and see us.{" "}
            <a className="fw-jump" href="https://www.pacificachristian.org/admissions/visit-pacifica" target="_top">
              Visit Pacifica
            </a>
          </span>
        </li>
      </ol>
      {done.testInquiryId && (
        <p className="fw-test">
          Test mode: saved as a fictional sample.{" "}
          <a href={`/pilot/inquiries/${done.testInquiryId}`} target="_top">Open it in the inbox</a> to draft and sign the
          pathway, then send the family their link.
        </p>
      )}
    </section>
  );

  return (
    <FamilyWelcome
      familyName={done.familyName}
      parentFirstName={done.parentFirstName}
      childFirstName={done.childFirstName}
      currentSchool={done.currentSchool}
      oneThing={done.oneThing || null}
      matches={done.matches}
      stories={done.stories}
      sameSchool={done.sameSchool}
      pathways={null}
      cardBase=""
      firstWeek={FIRST_WEEK}
      pathwayRequested={done.consentPathway}
      next={next}
      referralCode={done.shareCode}
      thanks={done.thanks}
      showPlaceholders={!!done.testInquiryId}
      // /discover has its own bar (or none, inside the website's frame).
      embed
    />
  );
}
