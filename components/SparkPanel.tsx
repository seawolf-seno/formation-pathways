"use client";

import { useState, useTransition } from "react";
import { ensureSparkLinkAction } from "@/lib/actions";
import { CopyButton } from "@/components/CopyButton";
import type { Applicant } from "@/lib/types";

// Staff-only. Shows the current Spark link (creating one if needed) and, once
// the family has answered, a plain summary — never edits it. Sending the
// email itself is a staff action outside this app, same as the inquiry drafts.
export function SparkPanel({ applicant }: { applicant: Applicant }) {
  const [token, setToken] = useState(applicant.spark_token);
  const [pending, start] = useTransition();

  function createLink() {
    start(async () => {
      setToken(await ensureSparkLinkAction(applicant.id));
    });
  }

  const response = applicant.spark_response;

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white p-5">
      <h2 className="font-display text-lg text-[var(--color-navy-ink)]">Spark survey</h2>
      <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
        A 60-second, interactive way to learn about {applicant.name.split(" ")[0]} before essays,
        the parent questionnaire or an interview exist. Send the link while they&apos;re still
        working on the rest of the application.
      </p>

      {token ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <CopyButton
            text={`/spark/${token}`}
            absolutePath
            label="Copy link to email"
            className="rounded-full bg-[var(--color-navy)] px-4 py-2 text-xs font-semibold text-white"
          />
          <a
            href={`/spark/${token}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-[var(--color-border)] px-4 py-2 text-xs"
          >
            Preview
          </a>
        </div>
      ) : (
        <button
          type="button"
          onClick={createLink}
          disabled={pending}
          className="mt-3 rounded-full bg-[var(--color-navy)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create link"}
        </button>
      )}

      {response ? (
        <div className="mt-4 border-t border-[var(--color-border)] pt-4 text-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]">
            Completed {applicant.spark_completed_at ? new Date(applicant.spark_completed_at).toLocaleDateString() : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {response.interests.map((label) => (
              <span key={label} className="rounded-full bg-[var(--color-pacific-light)] px-3 py-1 text-xs">
                {label}
              </span>
            ))}
          </div>
          {response.choices.length > 0 && (
            <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
              This or that: {response.choices.map((c, i) => (
                <span key={i} className="mr-1 inline-block rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[var(--color-ink)]">
                  {c}
                </span>
              ))}
            </p>
          )}
          {response.note && (
            <p className="mt-2 italic text-[var(--color-ink)]">&ldquo;{response.note}&rdquo;</p>
          )}
          <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
            How it&apos;s used: regenerating Pathways sends these taps, picks and note to the draft
            as the applicant&apos;s own interests (never as an essay), leaning on them most where an
            essay is still blank. Each pathway&apos;s &ldquo;Grows from&rdquo; line shows what it came from.
          </p>
        </div>
      ) : (
        <p className="mt-3 text-xs text-[var(--color-ink-muted)]">Not completed yet.</p>
      )}
    </div>
  );
}
