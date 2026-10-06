"use client";

import { PacificaLogo } from "@/components/PacificaLogo";
import { useRef, useState } from "react";
import type { GeneratedPathway } from "@/lib/types";
import { ShareStudio, type ExistingShare } from "./ShareStudio";
import { PathwayJourney } from "./PathwayJourney";
import { countWord } from "@/lib/pathway-journey";
import "./family-pathways.css";

export function FamilyPathways({
  name,
  token,
  pathways,
  existing,
}: {
  name: string;
  token: string;
  pathways: GeneratedPathway[];
  existing: ExistingShare[];
}) {
  const [selected, setSelected] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const detail = useRef<HTMLElement>(null);
  const firstName = name.trim().split(/\s+/)[0];
  const pathway = pathways[selected];
  if (!pathway) return null;
  const count = countWord(pathways.length);

  function explore(index: number) {
    setSelected(index);
    detail.current?.focus({ preventScroll: true });
    detail.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main className="family-experience">
      <header className="family-header">
        <a
          className="family-wordmark"
          href="#possibilities"
          aria-label="Pacifica Christian — your pathways"
        >
          <PacificaLogo />
        </a>
        <span className="family-demo">Fictional family · Demo</span>
      </header>
      <section className="family-hero" id="possibilities">
        <div className="family-hero-copy">
          <p className="family-eyebrow">A beginning, built around you</p>
          <h1>
            A future that
            <br />
            feels like <em>{firstName}.</em>
          </h1>
          <p className="family-intro">
            What you love. What you wonder about. What you haven’t tried yet.
            Here are {count.toLowerCase()} ways those things could grow at Pacifica.
          </p>
          <a className="family-text-link" href="#pathway-choices">
            Explore your possibilities <span aria-hidden="true">↓</span>
          </a>
        </div>
        <div className="family-art" aria-hidden="true">
          <div className="family-art-orbit orbit-one" />
          <div className="family-art-orbit orbit-two" />
          <span className="family-art-sun" />
          <svg viewBox="0 0 400 440" fill="none">
            <path
              d="M200 450V290C200 220 75 225 75 150V65M200 450V160C200 110 200 100 200 25M200 450V300C200 240 325 215 325 155V100"
              stroke="currentColor"
              strokeWidth="2"
            />
            <circle cx="75" cy="65" r="7" fill="currentColor" />
            <circle cx="200" cy="25" r="7" fill="currentColor" />
            <circle cx="325" cy="100" r="7" fill="currentColor" />
          </svg>
          <span className="family-art-label">
            Many possibilities.
            <br />
            One unmistakably you.
          </span>
        </div>
      </section>
      <section
        className="family-choices"
        id="pathway-choices"
        aria-labelledby="possibilities-title"
      >
        <div className="family-section-heading">
          <div>
            <p className="family-eyebrow">Your possibilities</p>
            <h2 id="possibilities-title">{count} invitations. No fixed track.</h2>
          </div>
          <p>Start with the one that makes you curious.</p>
        </div>
        <div className="family-choice-grid">
          {pathways.map((p, index) => (
            <button
              key={index}
              type="button"
              className={`family-choice ${selected === index ? "is-active" : ""}`}
              aria-pressed={selected === index}
              onClick={() => explore(index)}
            >
              <span className="family-choice-top">
                <span>PATHWAY {String(index + 1).padStart(2, "0")}</span>
                <span aria-hidden="true">↗</span>
              </span>
              <span className="family-choice-name">{p.name}</span>
              <span className="family-choice-description">
                {p.firstSemester}
              </span>
              <span className="family-choice-bottom">
                Explore this possibility <span aria-hidden="true">→</span>
              </span>
            </button>
          ))}
        </div>
      </section>
      <section
        ref={detail}
        tabIndex={-1}
        className="family-detail"
        aria-labelledby="pathway-title"
      >
        <div className="family-detail-intro">
          <p className="family-eyebrow">
            A closer look · {String(selected + 1).padStart(2, "0")}
          </p>
          <h2 id="pathway-title">{pathway.name}</h2>
          <p>
            A possibility to explore together—with the people and experiences
            that can help bring it to life.
          </p>
          <button
            className="family-button"
            onClick={() => dialog.current?.showModal()}
          >
            Share this possibility <span aria-hidden="true">↗</span>
          </button>
          <span className="family-small">You choose what others see.</span>
        </div>
        <PathwayJourney key={selected} pathway={pathway} mode="applicant" />
      </section>
      <section className="family-closing">
        <p className="family-eyebrow">A story still being written</p>
        <h2>
          These aren’t predictions.
          <br />
          <em>They’re invitations.</em>
        </h2>
        <p>
          The real pathway will be written by {firstName}—witnessed, one moment
          at a time.
        </p>
        <button
          className="family-text-link"
          onClick={() => dialog.current?.showModal()}
        >
          Share a little of what’s possible <span aria-hidden="true">↗</span>
        </button>
      </section>
      <footer className="family-footer">
        <span>Pacifica Christian · Formation Pathways</span>
        <span>Fictional applicant · Board demonstration</span>
      </footer>
      <dialog
        ref={dialog}
        className="family-share-dialog"
        aria-label="Choose what to share"
      >
        <div className="family-dialog-header">
          <span className="family-eyebrow">A possibility worth sharing</span>
          <button
            className="family-close"
            onClick={() => dialog.current?.close()}
            aria-label="Close sharing preview"
          >
            Close ×
          </button>
        </div>
        <ShareStudio
          key={selected}
          applicantToken={token}
          applicantName={name}
          pathways={pathways}
          existing={existing}
          initialPathwayIndex={selected}
        />
      </dialog>
    </main>
  );
}
