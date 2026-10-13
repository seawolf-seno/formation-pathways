"use client";

import { useState } from "react";
import { NEXT_STEP_LINKS, inviteText } from "@/lib/discover";
import { withDisclosure } from "@/lib/family-share";

/**
 * The band every family page ends with, so there is always a next step
 * (card #29): their pathway (on its way, ready to share, or ask for one),
 * inviting or sharing, and starting the application. Links marked
 * placeholder in NEXT_STEP_LINKS carry a visible tag for staff and samples.
 */
export function NextSteps({
  childFirstName, pathway, referralCode, shareAnchor = false, thanks = false, showPlaceholders = false,
}: {
  childFirstName: string;
  /** ready: signed and on this page · preparing: asked for, not signed yet · not-requested */
  pathway: "ready" | "preparing" | "not-requested";
  /** The family's own code, for inviting another family (/discover?ref=…). */
  referralCode?: string | null;
  /** The page has the share studio (#share): share the pathway there. */
  shareAnchor?: boolean;
  /** Thank-yous are on: an invite carries the disclosure. */
  thanks?: boolean;
  /** Staff and sample families see which links are still placeholders. */
  showPlaceholders?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const tag = (placeholder: boolean) =>
    placeholder && showPlaceholders ? <span className="ns-tag">Placeholder link</span> : null;

  const invite = async () => {
    if (!referralCode) return;
    const url = `${window.location.origin}/discover?ref=${referralCode}`;
    const text = withDisclosure(inviteText(childFirstName, url), thanks);
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
      } catch {
        setCopied(false);
      }
    }
  };

  return (
    <section className="family-choices fw-section ns" aria-labelledby="ns-title">
      <div className="family-section-heading">
        <div>
          <p className="family-eyebrow">Your next step</p>
          <h2 id="ns-title">Where to go from here</h2>
        </div>
      </div>
      <div className="ns-grid">
        <article className="ns-card">
          <p className="ns-kicker">{childFirstName}&apos;s Formation Pathway</p>
          {pathway === "ready" ? (
            <>
              <h3>Share it with people who know {childFirstName}</h3>
              <p>Grandparents, a coach, a teacher who saw it first. First name only, and you can stop any time.</p>
              {shareAnchor && <a className="ns-btn" href="#share">Share {childFirstName}&apos;s pathway</a>}
            </>
          ) : pathway === "preparing" ? (
            <>
              <h3>On its way to your inbox</h3>
              <p>A member of our admissions team is reading what you wrote and will email you a private link once it&apos;s signed.</p>
              <a className="ns-link" href="#pathway">What it will look like</a>
            </>
          ) : (
            <>
              <h3>Would you like one?</h3>
              <p>A few ways {childFirstName} could grow here, drafted from what you told us and signed by our admissions team.</p>
              <a className="ns-btn" href={NEXT_STEP_LINKS.requestPathway.href} target="_top">
                Ask for {childFirstName}&apos;s pathway
              </a>
              {tag(NEXT_STEP_LINKS.requestPathway.placeholder)}
            </>
          )}
        </article>

        <article className="ns-card">
          <p className="ns-kicker">Know a family who&apos;s looking?</p>
          <h3>Invite them to tell us about their child</h3>
          <p>They&apos;ll get their own welcome page, and a pathway if they&apos;d like one.</p>
          {referralCode ? (
            <button type="button" className="ns-btn" onClick={invite}>
              {copied ? "Copied: paste it anywhere" : "Send them the link"}
            </button>
          ) : shareAnchor ? (
            <a className="ns-btn" href="#share">Share {childFirstName}&apos;s pathway</a>
          ) : null}
        </article>

        <article className="ns-card is-primary">
          <p className="ns-kicker">Ready when you are</p>
          <h3>Start {childFirstName}&apos;s application</h3>
          <p>When {childFirstName} applies, we draft more pathways from everything you share.</p>
          <a className="ns-btn" href={NEXT_STEP_LINKS.apply.href} target="_top">Start the application</a>
          {tag(NEXT_STEP_LINKS.apply.placeholder)}
          <a className="ns-link" href={NEXT_STEP_LINKS.visit.href} target="_top">Or come and visit first</a>
        </article>
      </div>
    </section>
  );
}
