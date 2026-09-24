"use client";

import { useState, useTransition } from "react";
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
    <div className="rounded-2xl border-t-8 border-[var(--color-gold)] bg-gradient-to-br from-[var(--color-navy)] to-[var(--color-navy-ink)] p-6 text-white shadow-xl">
      <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--color-gold)]">
        Pacifica Christian High School
      </p>
      <p className="mt-4 text-sm text-[var(--color-pacific)]">
        {content.firstName}&apos;s Pathway
      </p>
      <p className="font-display text-3xl font-bold leading-tight">{content.pathwayName}</p>
      <p className="mt-4 border-l-4 border-[var(--color-gold)] pl-3 text-sm leading-relaxed text-[var(--color-gold-light)]">
        {content.highlight}
      </p>
      {content.stretchChallenge && (
        <div className="mt-4 text-xs leading-relaxed">
          <p className="font-semibold uppercase tracking-widest text-[var(--color-pacific)]">
            A stretch challenge
          </p>
          <p className="mt-1">{content.stretchChallenge}</p>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {content.program && (
          <span className="rounded-full border border-[var(--color-pacific)] px-3 py-1 text-xs">
            With Pacifica {content.program}
          </span>
        )}
        {content.horizon?.map((h, i) => (
          <span
            key={i}
            className="rounded-full border border-[var(--color-pacific)] px-3 py-1 text-xs"
          >
            {h}
          </span>
        ))}
      </div>
      <p className="mt-5 text-xs italic text-[var(--color-gold-light)]">
        An invitation, not a prediction.
      </p>
    </div>
  );
}

export function ShareStudio({
  applicantToken,
  applicantName,
  pathways,
  existing,
}: {
  applicantToken: string;
  applicantName: string;
  pathways: GeneratedPathway[];
  existing: ExistingShare[];
}) {
  const [selection, setSelection] = useState<ShareSelection>({
    pathwayIndex: 0,
    highlightIndex: 0,
    includeStretch: false,
    includeHorizon: true,
    includeProgram: true,
  });
  const [shares, setShares] = useState<ExistingShare[]>(existing);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const sentences = splitSentences(pathways[selection.pathwayIndex]?.firstSemester ?? "");
  let preview: PublicShareContent | null = null;
  try {
    preview = buildPublicShareContent(applicantName, pathways, selection);
  } catch {
    preview = null;
  }

  const link = (token: string) => `${window.location.origin}/share/${token}`;

  function create() {
    setError(null);
    start(async () => {
      try {
        const { token } = await createPathwayShareAction(applicantToken, selection);
        if (preview) setShares((s) => [{ token, content: preview! }, ...s]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  function revoke(token: string) {
    start(async () => {
      await revokePathwayShareAction(applicantToken, token);
      setShares((s) => s.filter((x) => x.token !== token));
    });
  }

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(link(token));
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt("Copy this link", link(token));
    }
  }

  const label = "text-xs font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]";

  return (
    <section
      aria-labelledby="share-heading"
      className="mt-14 rounded-3xl border border-[var(--color-border)] bg-white p-6 sm:p-8 print:hidden"
    >
      <h2 id="share-heading" className="font-display text-2xl text-[var(--color-navy-ink)]">
        Share {applicantName.split(" ")[0]}&apos;s Pathway
      </h2>
      <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
        Pick the Pathway that feels most like {applicantName.split(" ")[0]}, choose what to
        show, and see exactly what others will see. Your child&apos;s essays, last name and any
        teacher&apos;s name are never included.
      </p>

      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        <div className="space-y-6">
          <fieldset>
            <legend className={label}>1 · Which Pathway is yours?</legend>
            <div className="mt-2 space-y-2">
              {pathways.map((p, i) => (
                <label
                  key={i}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm ${
                    selection.pathwayIndex === i
                      ? "border-[var(--color-navy)] bg-[var(--color-pacific-light)]"
                      : "border-[var(--color-border)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="pathway"
                    checked={selection.pathwayIndex === i}
                    onChange={() =>
                      setSelection((s) => ({ ...s, pathwayIndex: i, highlightIndex: 0 }))
                    }
                  />
                  <span className="font-display text-base text-[var(--color-navy-ink)]">
                    {p.name}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className={label}>2 · Choose a highlight</legend>
            <div className="mt-2 space-y-2">
              {sentences.map((sentence, i) => (
                <label
                  key={i}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${
                    selection.highlightIndex === i
                      ? "border-[var(--color-navy)] bg-[var(--color-pacific-light)]"
                      : "border-[var(--color-border)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="highlight"
                    className="mt-1"
                    checked={selection.highlightIndex === i}
                    onChange={() => setSelection((s) => ({ ...s, highlightIndex: i }))}
                  />
                  <span>{sentence}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className={label}>3 · Add more (optional)</legend>
            <div className="mt-2 space-y-2 text-sm">
              {(
                [
                  ["includeHorizon", "Where this could lead in four years"],
                  ["includeProgram", "The Pacifica department that would guide it"],
                  ["includeStretch", "A stretch challenge"],
                ] as const
              ).map(([key, text]) => (
                <label key={key} className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selection[key]}
                    onChange={(e) => setSelection((s) => ({ ...s, [key]: e.target.checked }))}
                  />
                  {text}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div>
          <p className={label}>What others will see</p>
          <div className="mt-2">{preview && <PreviewCard content={preview} />}</div>
          <button
            type="button"
            onClick={create}
            disabled={pending || !preview}
            className="mt-4 w-full rounded-full bg-[var(--color-navy)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Working…" : "Create share link"}
          </button>
          {error && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
      </div>

      {shares.length > 0 && (
        <div className="mt-10 border-t border-[var(--color-border)] pt-6">
          <p className={label}>Your share links</p>
          <ul className="mt-3 space-y-4">
            {shares.map((s) => (
              <li
                key={s.token}
                className="rounded-xl border border-[var(--color-border)] p-4 text-sm"
              >
                <p className="font-display text-base text-[var(--color-navy-ink)]">
                  {s.content.pathwayName}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => copy(s.token)}
                    className="rounded-full bg-[var(--color-navy)] px-4 py-2 text-xs font-semibold text-white"
                  >
                    {copied === s.token ? "Copied" : "Copy link"}
                  </button>
                  <a
                    href={`/share/${s.token}/card?format=feed&download=1`}
                    className="rounded-full border border-[var(--color-navy)] px-4 py-2 text-xs font-semibold text-[var(--color-navy)]"
                  >
                    Download for Instagram post
                  </a>
                  <a
                    href={`/share/${s.token}/card?format=story&download=1`}
                    className="rounded-full border border-[var(--color-navy)] px-4 py-2 text-xs font-semibold text-[var(--color-navy)]"
                  >
                    Download for Story
                  </a>
                  <a
                    href={`/share/${s.token}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-[var(--color-border)] px-4 py-2 text-xs"
                  >
                    Open public page
                  </a>
                  <button
                    type="button"
                    onClick={() => revoke(s.token)}
                    disabled={pending}
                    className="rounded-full px-4 py-2 text-xs text-red-700 underline"
                  >
                    Stop sharing
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
