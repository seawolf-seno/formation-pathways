"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  approveApplicantAction,
  convertApplicantToStudentAction,
  regenerateApplicantPathwaysAction,
} from "@/lib/actions";
import type { Applicant } from "@/lib/types";

export function ApplicantAdminActions({ applicant }: { applicant: Applicant }) {
  const router = useRouter();
  const [approvedBy, setApprovedBy] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [enrolledMessage, setEnrolledMessage] = useState<string | null>(null);

  async function run(action: string, fn: () => Promise<void>) {
    setBusy(action);
    try {
      await fn();
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const publicUrl = `/applicant/${applicant.slug}-${applicant.token}`;

  return (
    <div className="space-y-4 rounded-xl border border-[var(--color-border)] bg-white p-5">
      <h2 className="font-display text-lg text-[var(--color-navy-ink)]">
        Staff actions
      </h2>

      <button
        onClick={() =>
          run("regenerate", async () => {
            await regenerateApplicantPathwaysAction(applicant.id);
          })
        }
        disabled={busy !== null}
        className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-ink-muted)] disabled:opacity-40"
      >
        {busy === "regenerate" ? "Regenerating…" : "Regenerate Pathways"}
      </button>

      {applicant.status === "submitted" && (
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] pt-4">
          <input
            value={approvedBy}
            onChange={(e) => setApprovedBy(e.target.value)}
            placeholder="Your name (reviewer)"
            className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs"
          />
          <button
            onClick={() =>
              run("approve", async () => {
                await approveApplicantAction(applicant.id, approvedBy);
              })
            }
            disabled={busy !== null || !approvedBy.trim()}
            className="rounded-lg bg-[var(--color-navy)] px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
          >
            {busy === "approve" ? "Approving…" : "Approve & get shareable link"}
          </button>
        </div>
      )}

      {(applicant.status === "approved" || applicant.status === "enrolled") && (
        <div className="border-t border-[var(--color-border)] pt-4 text-sm">
          <p className="text-xs text-[var(--color-ink-muted)]">
            Approved by {applicant.approved_by} · shareable link:
          </p>
          <a
            href={publicUrl}
            target="_blank"
            className="font-mono text-xs text-[var(--color-navy-ink)] underline"
          >
            {publicUrl}
          </a>
        </div>
      )}

      {applicant.status === "approved" && (
        <button
          onClick={() =>
            run("convert", async () => {
              const student = await convertApplicantToStudentAction(
                applicant.id
              );
              setEnrolledMessage(
                `Enrolled as a student — their Pathway already has ${applicant.generated?.seedObservations.length ?? 0} seed observations.`
              );
              void student;
            })
          }
          disabled={busy !== null}
          className="rounded-lg bg-[var(--color-gold)] px-3 py-2 text-xs font-medium text-[var(--color-navy-ink)] disabled:opacity-40"
        >
          {busy === "convert" ? "Enrolling…" : "Enroll as student (demo)"}
        </button>
      )}

      {applicant.status === "enrolled" && applicant.converted_student_id && (
        <a
          href={`/students/${applicant.converted_student_id}`}
          className="block text-sm text-[var(--color-navy-ink)] underline"
        >
          View their Student Pathway →
        </a>
      )}

      {enrolledMessage && (
        <p className="text-xs text-[var(--color-ink-muted)]">
          {enrolledMessage}
        </p>
      )}
    </div>
  );
}
