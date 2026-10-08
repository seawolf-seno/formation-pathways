"use client";

import { useState, useTransition } from "react";
import { DRAFT_LOST, DraftWait, useElapsed } from "./DraftWait";
import {
  addDemoFamiliesAction, addSampleInquiryAction, draftInquiryPathwayAction, setInquiriesApprovalAction,
  signInquiryPathwayAction, updateInquiryStatusAction,
} from "@/lib/sor/actions";
import type { GeneratedPathway } from "@/lib/types";
import { INQUIRY_STATUSES, type InquiryStatus, type PilotSettings } from "@/lib/sor/types";

const input = "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm";
const button = "rounded-lg bg-[var(--color-navy)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50";
const quiet =
  "rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-medium text-[var(--color-navy-ink)] disabled:opacity-50";

/** Admin: open or close the public form. Opening records leadership's approval. */
export function InquiriesSwitch({ settings }: { settings: PilotSettings }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const act = (fd: FormData) =>
    start(async () => {
      const res = await setInquiriesApprovalAction(fd);
      setError(res.ok ? null : res.error);
    });

  if (settings.inquiries_open) {
    return (
      <div className="space-y-2 text-sm">
        <p>
          <span className="font-semibold text-[var(--color-navy-ink)]">Open.</span> Approved by {settings.inquiries_approved_by}{" "}
          ({settings.inquiries_approval_reference}), {settings.inquiries_approved_at?.slice(0, 10)}.
        </p>
        <form action={act}>
          <input type="hidden" name="open" value="false" />
          <button className={quiet} disabled={pending}>Close the form</button>
        </form>
        {error && <p className="text-xs text-red-700">{error}</p>}
      </div>
    );
  }
  return (
    <form action={act} className="space-y-2 text-sm">
      <p className="text-[var(--color-ink-muted)]">
        Closed. Families who open /discover are sent to the website&apos;s inquiry form. Open it once leadership has approved
        collecting prospective families&apos; details here, and the consent wording.
      </p>
      <input type="hidden" name="open" value="true" />
      <div className="grid gap-2 sm:grid-cols-2">
        <input name="approved_by" className={input} placeholder="Approved by (name, role)" aria-label="Approved by" />
        <input name="approval_reference" className={input} placeholder="Where it's recorded (meeting, email)" aria-label="Where the approval is recorded" />
      </div>
      <button className={button} disabled={pending}>Open the form</button>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </form>
  );
}

/** Admissions: where this inquiry stands. */
export function InquiryStatusPicker({ id, status }: { id: string; status: InquiryStatus }) {
  const [value, setValue] = useState(status);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-col gap-1">
      <select
        className="rounded-md border border-[var(--color-border)] bg-white px-2 py-1 text-xs"
        value={value}
        disabled={pending}
        aria-label="Inquiry status"
        onChange={(e) => {
          const next = e.target.value as InquiryStatus;
          setValue(next);
          start(async () => {
            const res = await updateInquiryStatusAction(id, next);
            if (!res.ok) {
              setValue(status);
              setError(res.error);
            } else setError(null);
          });
        }}
      >
        {INQUIRY_STATUSES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      {error && <span className="text-[11px] text-red-700">{error}</span>}
    </span>
  );
}

export function SampleInquiryButton() {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        className={quiet}
        disabled={pending}
        onClick={() => start(async () => {
          const res = await addSampleInquiryAction();
          setError(res.ok ? null : res.error);
        })}
      >
        {pending ? "Adding…" : "Add a fictional sample"}
      </button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </span>
  );
}

/** A snippet with a copy button (falls back to selecting the text). */
export function CopySnippet({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]">{label}</span>
        <button
          className="text-xs font-medium text-[var(--color-navy-ink)] underline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto rounded-lg bg-[var(--color-canvas)] p-3 text-xs leading-relaxed"><code>{text}</code></pre>
    </div>
  );
}

/** Admin/admissions: five fictional families to try the whole flow with. */
export function DemoFamiliesButton() {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        className={quiet}
        disabled={pending}
        onClick={() => start(async () => {
          const res = await addDemoFamiliesAction();
          setMsg(res.ok ? `Added ${res.added} demo families.` : res.error);
        })}
      >
        {pending ? "Adding…" : "Load demo families"}
      </button>
      {msg && <span className="text-xs text-[var(--color-ink-muted)]">{msg}</span>}
    </span>
  );
}

/** Drafts a pathway from what the family wrote. Takes about a minute. */
export function DraftInquiryPathwayButton({ inquiryId, again }: { inquiryId: string; again: boolean }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const seconds = useElapsed(pending);
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        className={again ? quiet : button}
        disabled={pending}
        onClick={() => start(async () => {
          setMsg(null);
          try {
            const res = await draftInquiryPathwayAction(inquiryId);
            setMsg(res.ok ? (res.usedFallback ? "AI assist was unavailable or too slow, so this is a simple offline draft. Try again for a full one." : null) : res.error);
          } catch {
            setMsg(DRAFT_LOST);
          }
        })}
      >
        {pending ? "Drafting…" : again ? "Draft again" : "Draft a Formation Pathway"}
      </button>
      {pending && <DraftWait seconds={seconds} />}
      {msg && <span className="max-w-md text-xs text-[var(--color-ink-muted)]">{msg}</span>}
    </span>
  );
}

/** Review a draft: keep up to three pathways, then sign. */
export function InquiryDraftReview({
  inquiryId, pathwayId, pathways,
}: { inquiryId: string; pathwayId: string; pathways: GeneratedPathway[] }) {
  const [keep, setKeep] = useState<number[]>(pathways.map((_, i) => i).slice(0, 3));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toggle = (i: number) =>
    setKeep((k) => (k.includes(i) ? k.filter((x) => x !== i) : k.length >= 3 ? k : [...k, i]));
  return (
    <div className="space-y-3">
      <ol className="grid gap-3 md:grid-cols-2">
        {pathways.map((p, i) => {
          const on = keep.includes(i);
          return (
            <li key={i}>
              <label
                className={`block h-full cursor-pointer rounded-lg border p-4 text-sm ${on ? "border-[var(--color-navy)] bg-[var(--color-surface,#fff)]" : "border-[var(--color-border)] opacity-70"}`}
              >
                <span className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1" checked={on} onChange={() => toggle(i)} disabled={!on && keep.length >= 3} />
                  <span className="font-display text-base text-[var(--color-navy-ink)]">{p.name}</span>
                </span>
                {p.hook && <span className="mt-1 block text-xs text-[var(--color-ink-muted)]">Grows from “{p.hook.replace(/^["“]|["”]$/g, "")}”</span>}
                <span className="mt-2 block">{p.firstSemester}</span>
                {p.glimpse && <span className="mt-2 block font-display italic">{p.glimpse}</span>}
                {p.whyNow && <span className="mt-2 block text-xs text-[var(--color-ink-muted)]">Why now: {p.whyNow}</span>}
              </label>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <button
          className={button}
          disabled={pending || keep.length === 0}
          onClick={() => start(async () => {
            const res = await signInquiryPathwayAction(pathwayId, inquiryId, keep);
            setError(res.ok ? null : res.error);
          })}
        >
          {pending ? "Signing…" : `Sign ${keep.length === 1 ? "this pathway" : `these ${keep.length}`}`}
        </button>
        <span className="text-xs text-[var(--color-ink-muted)]">Keep up to three. Signing records your name; a signed pathway can&apos;t be edited.</span>
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
