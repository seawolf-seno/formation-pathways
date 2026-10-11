"use client";

import { useState, useTransition } from "react";
import { DRAFT_LOST, DraftWait, useElapsed } from "./DraftWait";
import {
  addDemoFamiliesAction, addSampleInquiryAction, createFamilyLinkAction, draftInquiryPathwayAction, endFamilyLinksAction,
  setInquiriesApprovalAction, signInquiryPathwayAction, updateInquiryStatusAction,
} from "@/lib/sor/actions";
import { PATHWAY_PLAN, type GeneratedPathway } from "@/lib/types";
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
      {pending && <DraftWait seconds={seconds} expectSeconds={PATHWAY_PLAN.inquiry.expectSeconds} />}
      {msg && <span className="max-w-md text-xs text-[var(--color-ink-muted)]">{msg}</span>}
    </span>
  );
}

/** Review a draft: keep the ones that sound like this child (up to three), then sign. */
export function InquiryDraftReview({
  inquiryId, pathwayId, pathways,
}: { inquiryId: string; pathwayId: string; pathways: GeneratedPathway[] }) {
  const max = Math.min(3, pathways.length);
  const [keep, setKeep] = useState<number[]>(pathways.map((_, i) => i).slice(0, max));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toggle = (i: number) =>
    setKeep((k) => (k.includes(i) ? k.filter((x) => x !== i) : k.length >= max ? k : [...k, i]));
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
                  <input type="checkbox" className="mt-1" checked={on} onChange={() => toggle(i)} disabled={!on && keep.length >= max} />
                  <span className="font-display text-base text-[var(--color-navy-ink)]">{p.name}</span>
                </span>
                {p.hook && <span className="mt-1 block text-xs text-[var(--color-ink-muted)]">Grows from “{p.hook.replace(/^["“]|["”]$/g, "")}”</span>}
                {p.startingPoint && (
                  <span className="mt-2 block border-l-2 border-[var(--color-pacific)] pl-2 text-xs">
                    <span className="block uppercase tracking-widest text-[10px] text-[var(--color-ink-muted)]">Where they are now</span>
                    {p.startingPoint}
                  </span>
                )}
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
        <span className="text-xs text-[var(--color-ink-muted)]">
          {pathways.length > max ? `Keep up to ${max}.` : "Untick any that don't sound like this child."} Signing records your name; a signed
          pathway can&apos;t be edited.
        </span>
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}

const longDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric" });

/** After signing: make the family's private link, and the email to send it in. */
export function FamilyLinkPanel({
  inquiryId, parentFirstName, parentEmail, childFirstName, pathwayCount, staffName, links,
}: {
  inquiryId: string;
  parentFirstName: string;
  parentEmail: string;
  childFirstName: string;
  pathwayCount: number;
  staffName: string;
  links: { id: string; created_at: string; expires_at: string }[];
}) {
  const [made, setMade] = useState<{ url: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"link" | "email" | null>(null);
  const [pending, start] = useTransition();
  const live = links.filter((l) => new Date(l.expires_at) > new Date());

  const subject = `${childFirstName}'s Formation Pathway from Pacifica`;
  const body = made
    ? `Dear ${parentFirstName},\n\nThank you for telling us about ${childFirstName}. From what you shared, we drafted ${pathwayCount === 1 ? "a way" : `${pathwayCount} ways`} ${childFirstName} could grow at Pacifica, and I read and signed ${pathwayCount === 1 ? "it" : "them"} myself:\n\n${made.url}\n\nThe page is just for your family and works until ${longDate(made.expiresAt)}. If you'd like to share ${childFirstName}'s pathway with friends, there's a Share button on the page. When ${childFirstName} applies, we'll draft more from everything you tell us.\n\nWarmly,\n${staffName}`
    : "";
  const copy = async (what: "link" | "email", text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  };

  return (
    <div className="space-y-3 text-sm">
      {!made ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            className={button}
            disabled={pending}
            onClick={() => start(async () => {
              const res = await createFamilyLinkAction(inquiryId);
              if (res.ok) {
                setMade({ url: res.url, expiresAt: res.expiresAt });
                setError(null);
              } else setError(res.error);
            })}
          >
            {pending ? "Making the link…" : live.length ? "Make a new link" : "Make the family's link"}
          </button>
          <span className="text-xs text-[var(--color-ink-muted)]">
            {live.length
              ? `${live.length} link${live.length === 1 ? "" : "s"} already sent, the newest until ${longDate(live[0].expires_at)}. A link is shown once; make a new one to send again.`
              : "A private page for this family: no sign-in, works for 60 days."}
          </span>
        </div>
      ) : (
        <div className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-pacific-light,#eaf1f8)] p-4">
          <p className="font-medium text-[var(--color-navy-ink)]">The family&apos;s link (shown once, works until {longDate(made.expiresAt)})</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="max-w-full break-all rounded bg-white px-2 py-1 text-xs">{made.url}</code>
            <button className={quiet} onClick={() => copy("link", made.url)}>{copied === "link" ? "Copied" : "Copy link"}</button>
            <a className={quiet} href={made.url} target="_blank" rel="noopener noreferrer">Open it</a>
          </div>
          <details>
            <summary className="cursor-pointer font-medium text-[var(--color-navy-ink)]">An email to send it in</summary>
            <pre className="mt-2 whitespace-pre-wrap rounded bg-white p-3 font-sans text-sm leading-relaxed">{`To: ${parentEmail}\nSubject: ${subject}\n\n${body}`}</pre>
            <div className="mt-2 flex flex-wrap gap-2">
              <button className={quiet} onClick={() => copy("email", body)}>{copied === "email" ? "Copied" : "Copy the email"}</button>
              <a className={quiet} href={`mailto:${encodeURIComponent(parentEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}>
                Open in my email
              </a>
            </div>
          </details>
        </div>
      )}
      {live.length > 0 && (
        <button
          className="text-xs text-[var(--color-ink-muted)] underline"
          disabled={pending}
          onClick={() => start(async () => {
            const res = await endFamilyLinksAction(inquiryId);
            if (res.ok) setMade(null);
            setError(res.ok ? null : res.error);
          })}
        >
          End this family&apos;s links
        </button>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
