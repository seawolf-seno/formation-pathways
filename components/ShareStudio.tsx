"use client";

import { PacificaLogo } from "./PacificaLogo";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createPathwayShareAction,
  revokePathwayShareAction,
} from "@/lib/actions";
import {
  buildPublicShareContent,
  splitSentences,
  type PublicShareContent,
  type ShareSelection,
} from "@/lib/share";
import type { GeneratedPathway } from "@/lib/types";

export interface ExistingShare {
  token: string;
  content: PublicShareContent;
}

function PreviewCard({ content }: { content: PublicShareContent }) {
  return (
    <div className="share-preview">
      <div className="share-card-brand"><PacificaLogo /></div>
      <span className="share-card-kicker">
        Imagine what’s possible for {content.firstName}.
      </span>
      <h3>{content.pathwayName}</h3>
      <p className="share-card-highlight">{content.highlight}</p>
      {content.program && (
        <p className="share-card-program">With Pacifica {content.program}</p>
      )}
      {content.stretchChallenge && (
        <div className="share-card-extra">
          <strong>Room to stretch</strong>
          <p>{content.stretchChallenge}</p>
        </div>
      )}
      {content.horizon && (
        <div className="share-card-extra">
          <strong>Where this could lead</strong>
          <ul>
            {content.horizon.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="share-card-footer">
        A possibility to explore. A story to make your own.
        <span>Fictional applicant · Pacifica demonstration</span>
      </p>
    </div>
  );
}

export function ShareStudio({
  applicantToken,
  applicantName,
  pathways,
  existing,
  initialPathwayIndex = 0,
}: {
  applicantToken: string;
  applicantName: string;
  pathways: GeneratedPathway[];
  existing: ExistingShare[];
  initialPathwayIndex?: number;
}) {
  const router = useRouter();
  const [selection, setSelection] = useState<ShareSelection>({
    pathwayIndex: initialPathwayIndex,
    highlightIndex: 0,
    includeStretch: false,
    includeHorizon: false,
    includeProgram: false,
  });
  const [shares, setShares] = useState(existing);
  const [created, setCreated] = useState<ExistingShare | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const sentences = splitSentences(
    pathways[selection.pathwayIndex]?.firstSemester ?? "",
  );
  let preview: PublicShareContent | null = null;
  try {
    preview = buildPublicShareContent(applicantName, pathways, selection);
  } catch {
    /* invalid selection disables sharing */
  }
  const link = (token: string) => `${window.location.origin}/share/${token}`;
  function update(next: Partial<ShareSelection>) {
    setSelection((s) => ({ ...s, ...next }));
    setConfirmed(false);
    setCreated(null);
    setError(null);
  }
  function create() {
    if (!confirmed || !preview) return;
    const snapshot = preview;
    setError(null);
    start(async () => {
      try {
        const { token } = await createPathwayShareAction(
          applicantToken,
          selection,
        );
        const share = { token, content: snapshot };
        setShares((s) => [share, ...s]);
        setCreated(share);
        setMessage(
          "Your link is ready. Only the previewed content is on the public page.",
        );
        router.refresh();
      } catch {
        setError("We couldn’t create your link. Please try again.");
      }
    });
  }
  function revoke(token: string) {
    setError(null);
    start(async () => {
      try {
        await revokePathwayShareAction(applicantToken, token);
        setShares((s) => s.filter((x) => x.token !== token));
        if (created?.token === token) setCreated(null);
        setMessage(
          "This link is no longer available. Previously downloaded images cannot be recalled.",
        );
        router.refresh();
      } catch {
        setError("We couldn’t stop sharing. Please try again.");
      }
    });
  }
  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(link(token));
      setMessage("Link copied. Ready to send to someone you know.");
    } catch {
      window.prompt("Copy your share link", link(token));
    }
  }
  return (
    <section className="share-studio" aria-labelledby="share-title">
      <h2 id="share-title">
        Let someone else see
        <br />
        what you see.
      </h2>
      <p className="share-intro">
        Choose a little of {applicantName.split(" ")[0]}’s story to share. The
        full application stays here.
      </p>
      <div className="share-layout">
        <div className="share-controls">
          <label className="share-field">
            The possibility
            <select
              disabled={pending}
              value={selection.pathwayIndex}
              onChange={(e) =>
                update({
                  pathwayIndex: Number(e.target.value),
                  highlightIndex: 0,
                })
              }
            >
              {pathways.map((p, i) => (
                <option key={i} value={i}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <fieldset disabled={pending}>
            <legend>A moment to highlight</legend>
            {sentences.map((sentence, i) => (
              <label
                className={`share-sentence ${selection.highlightIndex === i ? "selected" : ""}`}
                key={i}
              >
                <input
                  type="radio"
                  name="highlight"
                  checked={selection.highlightIndex === i}
                  onChange={() => update({ highlightIndex: i })}
                />
                <span>{sentence}</span>
              </label>
            ))}
          </fieldset>
          <fieldset disabled={pending}>
            <legend>Include a little more</legend>
            {(
              [
                ["includeProgram", "The Pacifica department"],
                ["includeHorizon", "Possibilities beyond graduation"],
                ["includeStretch", "The stretch challenge"],
              ] as const
            ).map(([key, label]) => (
              <label className="share-toggle" key={key}>
                <input
                  type="checkbox"
                  checked={selection[key]}
                  onChange={(e) => update({ [key]: e.target.checked })}
                />
                {label}
              </label>
            ))}
          </fieldset>
          <p className="share-note">
            The preview includes a first name and may quote details from the
            application. Read all of it before sharing. Anyone with the link can
            view or forward it.
          </p>
          <label className="share-consent">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={pending}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>
              I’ve reviewed this preview and want these details on the public
              demo page.
            </span>
          </label>
          <button
            className="family-button"
            disabled={!preview || !confirmed || pending || !!created}
            onClick={create}
          >
            {pending
              ? "Working…"
              : created
                ? "Your link is ready ✓"
                : "Create this share link ↗"}
          </button>
          {error && (
            <p role="alert" className="share-note">
              {error}
            </p>
          )}
        </div>
        <div>
          <p className="family-eyebrow">Public page preview</p>
          {preview && <PreviewCard content={preview} />}
          <p className="share-note">
            Downloaded cards use a shorter headline layout. The public page
            retains all selected details.
          </p>
        </div>
      </div>
      <p className="share-status" role="status">
        {message}
      </p>
      {shares.length > 0 && (
        <div className="share-results">
          <h3>Your shared possibilities</h3>
          {shares.map((s) => (
            <div className="share-result" key={s.token}>
              <p>{s.content.pathwayName}</p>
              <div>
                <button onClick={() => copy(s.token)}>Copy link</button>
                <a href={`/share/${s.token}`} target="_blank" rel="noreferrer">
                  View public page ↗
                </a>
                <a href={`/share/${s.token}/card?format=feed&download=1`}>
                  Download post
                </a>
                <a href={`/share/${s.token}/card?format=story&download=1`}>
                  Download story
                </a>
                <button disabled={pending} onClick={() => revoke(s.token)}>
                  Stop sharing
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
