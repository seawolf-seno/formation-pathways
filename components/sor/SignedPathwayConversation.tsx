"use client";

import { useRef, useState, useTransition } from "react";
import { PacificaLogo } from "@/components/PacificaLogo";
import { PathwayJourney } from "@/components/PathwayJourney";
import { recordPathwayChoiceAction } from "@/lib/sor/actions";
import type { GeneratedPathway } from "@/lib/types";
import "@/components/family-pathways.css";

/**
 * A signed pathway, explored together: the same experience families saw in
 * the admissions demo, minus sharing. The student picks the possibility that
 * excites them and can add a sentence in their own words; that's saved as an
 * observation by the signed-in adult (their name on it, consent enforced by
 * the database), so it feeds the next draft.
 */
export function SignedPathwayConversation({
  personId,
  draftId,
  firstName,
  pathways,
  signedBy,
  signedOn,
  aiAssisted,
  isSample,
  canRecord,
}: {
  personId: string;
  draftId: string;
  firstName: string;
  pathways: GeneratedPathway[];
  signedBy: string;
  signedOn: string;
  aiAssisted: boolean;
  isSample: boolean;
  canRecord: boolean;
}) {
  const [selected, setSelected] = useState(0);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const detail = useRef<HTMLElement>(null);
  const pathway = pathways[selected];
  if (!pathway) return null;

  function explore(index: number) {
    setSelected(index);
    setSaved(null);
    detail.current?.focus({ preventScroll: true });
    detail.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function choose() {
    setError(null);
    start(async () => {
      const res = await recordPathwayChoiceAction({ personId, draftId, pathwayIndex: selected, note });
      if (res.ok) {
        setSaved(pathway.name);
        setNote("");
      } else setError(res.error);
    });
  }

  return (
    <main className="family-experience">
      <header className="family-header">
        <span className="family-wordmark" aria-label="Pacifica Christian">
          <PacificaLogo />
        </span>
        <span className="family-demo">{isSample ? "Fictional student · Sample" : `For ${firstName} and family`}</span>
      </header>
      <section className="family-hero" id="possibilities">
        <div className="family-hero-copy">
          <p className="family-eyebrow">Where you could grow next</p>
          <h1>
            A future that
            <br />
            feels like <em>{firstName}.</em>
          </h1>
          <p className="family-intro">
            The people who know you here noticed what you love and how you&apos;ve grown. Here are three ways that
            could keep growing at Pacifica.
          </p>
          <a className="family-text-link" href="#pathway-choices">
            Explore your possibilities <span aria-hidden="true">↓</span>
          </a>
        </div>
      </section>
      <section className="family-choices" id="pathway-choices" aria-labelledby="possibilities-title">
        <div className="family-section-heading">
          <div>
            <p className="family-eyebrow">Your possibilities</p>
            <h2 id="possibilities-title">Three invitations. No fixed track.</h2>
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
              <span className="family-choice-description">{p.firstSemester}</span>
              <span className="family-choice-bottom">
                Explore this possibility <span aria-hidden="true">→</span>
              </span>
            </button>
          ))}
        </div>
      </section>
      <section ref={detail} tabIndex={-1} className="family-detail" aria-labelledby="pathway-title">
        <div className="family-detail-intro">
          <p className="family-eyebrow">A closer look · {String(selected + 1).padStart(2, "0")}</p>
          <h2 id="pathway-title">{pathway.name}</h2>
          <p>A possibility to explore together, with the people and experiences that can help bring it to life.</p>
          {canRecord ? (
            <div className="space-y-3">
              <label className="family-small block">
                In your own words (optional)
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="What draws you to this one?"
                  className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-white p-3 text-base text-[var(--color-navy-ink)]"
                />
              </label>
              <button className="family-button" disabled={pending} onClick={choose}>
                {pending ? "Saving…" : "This one excites me"} <span aria-hidden="true">★</span>
              </button>
              {saved && (
                <span className="family-small block" role="status">
                  Noted: {firstName} chose “{saved}”. It&apos;s on their Pathway for the next conversation.
                </span>
              )}
              {error && <span className="block text-sm text-red-700">{error}</span>}
            </div>
          ) : (
            <span className="family-small">Talk it through together; there&apos;s no consent on file to save a note here.</span>
          )}
        </div>
        <PathwayJourney key={selected} pathway={pathway} mode="student" />
      </section>
      <section className="family-closing">
        <p className="family-eyebrow">A story still being written</p>
        <h2>
          These aren’t predictions.
          <br />
          <em>They’re invitations.</em>
        </h2>
        <p>The real pathway will be written by {firstName}, witnessed one moment at a time.</p>
      </section>
      <footer className="family-footer">
        <span>
          Reviewed and signed by {signedBy}
          {signedOn ? `, ${signedOn}` : ""}
        </span>
        <span>{aiAssisted ? "Drafted with AI help; every word approved by a Pacifica adult" : "Written by Pacifica staff"}</span>
      </footer>
    </main>
  );
}
