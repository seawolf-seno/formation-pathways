"use client";

import { useState, type ReactNode } from "react";
import { PacificaLogo } from "@/components/PacificaLogo";
import { PathwayJourney } from "@/components/PathwayJourney";
import type { GeneratedPathway } from "@/lib/types";
import "@/components/family-pathways.css";
import { ShareStudio, type ShareAction } from "./ShareStudio";
import { NextSteps } from "./NextSteps";
import "./family-welcome.css";

const WORDS = ["", "One", "Two", "Three", "Four", "Five", "Six"];

export interface WelcomeStory {
  firstName: string;
  gradYear: number;
  headline: string;
  story: string;
  whereNow: string;
}

/**
 * What an inquiring family sees: their own words back, where their child
 * could start at Pacifica (written by people, no AI), students who came from
 * the same school, a first week here, their signed Formation Pathway, and
 * what they can share. Families see it twice: straight after they inquire
 * (no pathway yet, `next` says what happens), and at the private link
 * admissions emails once the pathway is signed. Staff see it as a preview.
 */
export function FamilyWelcome({
  familyName, parentFirstName, childFirstName, currentSchool, oneThing, matches,
  stories, sameSchool, pathways, cardBase, share, stopSharing, moreWithApplication = false,
  firstWeek = [], thanks = false, pathwayRequested = true, next, embed = false, referralCode = null, showPlaceholders = false,
}: {
  familyName: string;
  parentFirstName: string;
  childFirstName: string;
  currentSchool: string | null;
  oneThing: string | null;
  matches: { program: string; line: string }[];
  stories: WelcomeStory[];
  sameSchool: boolean;
  pathways: GeneratedPathway[] | null;
  /** Base URL of the card image; ?p=&style=&format= are added. */
  cardBase: string;
  /** The family's own page: makes a public share. Absent in the staff preview. */
  share?: ShareAction;
  stopSharing?: () => Promise<{ ok: boolean }>;
  /** An inquiry gets two pathways; say more come with the application. */
  moreWithApplication?: boolean;
  /** A first week here, written by staff (lib/discover.ts FIRST_WEEK). */
  firstWeek?: { moment: string; line: string }[];
  /** Thank-yous are on: shares carry the disclosure. */
  thanks?: boolean;
  /** The family asked for a pathway (if not, the section is left out). */
  pathwayRequested?: boolean;
  /** Straight after the form: what happens next. */
  next?: ReactNode;
  /** Inside the school website's frame: no header of our own. */
  embed?: boolean;
  /** The family's own code, for inviting another family. */
  referralCode?: string | null;
  /** Staff and sample families see which next-step links are placeholders. */
  showPlaceholders?: boolean;
}) {
  const [selected, setSelected] = useState(0);
  const pathway = pathways?.[selected];

  return (
    <div className="family-experience">
      {!embed && (
        <header className="family-header">
          <span className="family-wordmark"><PacificaLogo /></span>
          <span className="family-demo">For the {familyName} family</span>
        </header>
      )}

      <section className="family-hero fw-hero">
        <div className="family-hero-copy">
          <p className="family-eyebrow">Thank you for telling us about {childFirstName}</p>
          <h1>
            {childFirstName}, <em>at Pacifica.</em>
          </h1>
          {oneThing ? (
            <figure className="fw-said">
              <blockquote>{oneThing}</blockquote>
              <figcaption>What you told us, {parentFirstName}</figcaption>
            </figure>
          ) : (
            <p className="family-intro">Every student here starts somewhere particular. Here is where {childFirstName} could start.</p>
          )}
        </div>
      </section>

      {next}

      {matches.length > 0 && (
        <section className="family-choices fw-section">
          <div className="family-section-heading">
            <div>
              <p className="family-eyebrow">Where {childFirstName} could start</p>
              <h2>From what you told us</h2>
            </div>
          </div>
          <ul className="fw-matches">
            {matches.map((m) => (
              <li key={m.program}>
                <span className="fw-program">{m.program}</span>
                <span className="fw-line">{m.line}</span>
              </li>
            ))}
            <li>
              <span className="fw-program">Every student</span>
              <span className="fw-line">Weekly all-school chapel, and the All-School Retreat: small groups, real questions, a few days away together.</span>
            </li>
          </ul>
        </section>
      )}

      {stories.length > 0 && (
        <section className="family-choices fw-section">
          <div className="family-section-heading">
            <div>
              <p className="family-eyebrow">{sameSchool && currentSchool ? `From ${currentSchool}` : "Students who started somewhere new"}</p>
              <h2>{sameSchool ? `Others who came from ${currentSchool}` : "How it went for them"}</h2>
            </div>
            <p>Shared with each graduate&apos;s permission.</p>
          </div>
          <div className="fw-stories">
            {stories.slice(0, 3).map((s) => (
              <article key={s.firstName + s.gradYear}>
                <p className="fw-story-year">{s.firstName}, class of {s.gradYear}</p>
                <h3>{s.headline}</h3>
                <p>{s.story}</p>
                <p className="fw-now">Now: {s.whereNow}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {firstWeek.length > 0 && (
        <section className="family-choices fw-section">
          <div className="family-section-heading">
            <div>
              <p className="family-eyebrow">A first week</p>
              <h2>What {childFirstName} would find here</h2>
            </div>
            <p>From our admissions team.</p>
          </div>
          <ul className="fw-matches">
            {firstWeek.map((m) => (
              <li key={m.moment}>
                <span className="fw-program">{m.moment}</span>
                <span className="fw-line">{m.line}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pathwayRequested && (
      <section className="family-choices fw-section" id="pathway">
        <div className="family-section-heading">
          <div>
            <p className="family-eyebrow">{childFirstName}&apos;s Formation Pathway</p>
            <h2>
              {pathways
                ? pathways.length === 1
                  ? `One way ${childFirstName} could grow here`
                  : `${WORDS[pathways.length] ?? pathways.length} ways ${childFirstName} could grow here`
                : "Being prepared"}
            </h2>
          </div>
          {pathways && (
            <p>
              {share && <><a className="fw-jump" href="#share">Share it ↓</a>{" "}</>}
              Invitations, not predictions.
              {moreWithApplication
                ? ` From one thing you told us. When ${childFirstName} applies, we'll draft more from everything you share.`
                : ` Start with the one that makes ${childFirstName} curious.`}
            </p>
          )}
        </div>
        {pathways && pathway ? (
          <>
            <div className="family-choice-grid">
              {pathways.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  className={`family-choice ${selected === i ? "is-active" : ""}`}
                  aria-pressed={selected === i}
                  onClick={() => setSelected(i)}
                >
                  <span className="family-choice-top">
                    <span>PATHWAY {String(i + 1).padStart(2, "0")}</span>
                  </span>
                  <span className="family-choice-name">{p.name}</span>
                  {p.hook && <span className="family-choice-description">Grows from “{p.hook.replace(/^["“]|["”]$/g, "")}”</span>}
                </button>
              ))}
            </div>
            <div className="fw-journey">
              <h3 className="fw-journey-name">{pathway.name}</h3>
              <PathwayJourney key={selected} pathway={pathway} mode="applicant" />
            </div>
          </>
        ) : (
          <p className="family-intro">
            A member of our admissions team is preparing it from what you shared, and will email you a private link when
            it&apos;s ready.
          </p>
        )}
      </section>
      )}

      {pathways && pathway && (
        <ShareStudio
          childFirstName={childFirstName}
          pathwayNames={pathways.map((p) => p.name)}
          selected={selected}
          onSelect={setSelected}
          cardBase={cardBase}
          share={share}
          stopSharing={stopSharing}
          thanks={thanks}
        />
      )}

      <NextSteps
        childFirstName={childFirstName}
        pathway={pathways ? "ready" : pathwayRequested ? "preparing" : "not-requested"}
        referralCode={referralCode}
        shareAnchor={!!pathways}
        thanks={thanks}
        showPlaceholders={showPlaceholders}
      />

      <footer className="family-footer">
        <span>Pacifica Christian · Formation Pathways</span>
      </footer>
    </div>
  );
}
