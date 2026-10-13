"use client";

import { useState, useTransition } from "react";
import { DRAFT_LOST, DraftWait, useElapsed } from "./DraftWait";
import {
  addDemoFamiliesAction, addSampleInquiryAction, confirmReferralAction, createFamilyLinkAction, draftInquiryPathwayAction,
  endFamilyLinksAction, setInquiriesApprovalAction, setReferralThanksDecisionAction, signInquiryPathwayAction,
  stepReferralThanksAction, updateInquiryStatusAction,
} from "@/lib/sor/actions";
import { PATHWAY_PLAN, type GeneratedPathway } from "@/lib/types";
import { INQUIRY_STATUSES, type InquiryStatus, type PilotSettings, type ReferralThanks } from "@/lib/sor/types";

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
  inquiryId, parentFirstName, parentEmail, parentPhone, childFirstName, pathwayCount, staffName, links,
}: {
  inquiryId: string;
  parentFirstName: string;
  parentEmail: string;
  parentPhone?: string | null;
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
          <p className="font-medium text-[var(--color-navy-ink)]">
            The family&apos;s link is ready. Send it now: it&apos;s shown only once, and works until {longDate(made.expiresAt)}.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <a
              className={button}
              href={`mailto:${encodeURIComponent(parentEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}
            >
              Email it to {parentFirstName}
            </a>
            {parentPhone && (
              <a
                className={quiet}
                href={`sms:${parentPhone.replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(`Hi ${parentFirstName}, it's ${staffName} from Pacifica. ${childFirstName}'s Formation Pathway is ready: ${made.url}`)}`}
              >
                Text it
              </a>
            )}
            <button className={quiet} onClick={() => copy("link", made.url)}>{copied === "link" ? "Copied" : "Copy link"}</button>
            <a className={quiet} href={made.url} target="_blank" rel="noopener noreferrer">Open it</a>
          </div>
          <p className="text-xs text-[var(--color-ink-muted)]">
            Email opens your own mail app, addressed to {parentEmail}, with the message below. It goes from you, by name.
          </p>
          <code className="block max-w-full break-all rounded bg-white px-2 py-1 text-xs">{made.url}</code>
          <details>
            <summary className="cursor-pointer font-medium text-[var(--color-navy-ink)]">Read the email first</summary>
            <pre className="mt-2 whitespace-pre-wrap rounded bg-white p-3 font-sans text-sm leading-relaxed">{`To: ${parentEmail}\nSubject: ${subject}\n\n${body}`}</pre>
            <div className="mt-2 flex flex-wrap gap-2">
              <button className={quiet} onClick={() => copy("email", body)}>{copied === "email" ? "Copied" : "Copy the email"}</button>
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

/** Admin: record leadership's decision on referral thank-yous, or turn them off. */
export function ReferralThanksDecision({ settings }: { settings: PilotSettings }) {
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const act = (fd: FormData) =>
    start(async () => {
      const res = await setReferralThanksDecisionAction(fd);
      setError(res.ok ? null : res.error);
      if (res.ok) setEditing(false);
    });

  if (settings.referral_thanks_open && !editing) {
    return (
      <div className="space-y-2 text-sm">
        <p>
          <span className="font-semibold text-[var(--color-navy-ink)]">On.</span> {settings.referral_thanks_what}, once the family
          they brought has {settings.referral_thanks_on}; at most {settings.referral_thanks_cap} per family. Approved by{" "}
          {settings.referral_thanks_approved_by} ({settings.referral_thanks_approval_reference}),{" "}
          {settings.referral_thanks_approved_at?.slice(0, 10)}.
        </p>
        <div className="flex flex-wrap gap-2">
          <button className={quiet} onClick={() => setEditing(true)}>Record a new decision</button>
          <form action={act}>
            <input type="hidden" name="open" value="false" />
            <button className={quiet} disabled={pending}>Turn thank-yous off</button>
          </form>
        </div>
        {error && <p className="text-xs text-red-700">{error}</p>}
      </div>
    );
  }
  return (
    <form action={act} className="space-y-3 text-sm">
      <p className="text-[var(--color-ink-muted)]">
        Off for real families until leadership decides what the thank-you is, when it&apos;s given and how many. Samples can go
        the whole way so you can try it. No cash or gift cards (the database refuses them).
      </p>
      <input type="hidden" name="open" value="true" />
      <label className="block space-y-1">
        <span className="text-xs font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]">The thank-you</span>
        <input name="what" className={input} defaultValue={settings.referral_thanks_what ?? ""} placeholder="e.g. A handwritten note from the Head of School" maxLength={200} />
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]">Given once they&apos;ve</span>
          <select name="on" className={input} defaultValue={settings.referral_thanks_on}>
            <option value="applied">applied</option>
            <option value="enrolled">enrolled</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]">At most, per family</span>
          <input name="cap" type="number" min={1} max={10} className={input} defaultValue={settings.referral_thanks_cap} />
        </label>
        <input name="approved_by" className={input} placeholder="Approved by (name, role)" aria-label="Approved by" />
        <input name="approval_reference" className={input} placeholder="Where it's recorded (meeting, email)" aria-label="Where the approval is recorded" />
      </div>
      <div className="flex flex-wrap gap-2">
        <button className={button} disabled={pending}>Turn thank-yous on</button>
        {editing && <button type="button" className={quiet} onClick={() => setEditing(false)}>Cancel</button>}
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </form>
  );
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/**
 * One referred family: confirm the referral, then approve the thank-you once
 * they've applied (or enrolled), then record who sent it. Each step records
 * the signed-in staff member; the database enforces the rules.
 */
export function ReferralSteps({
  referredId, referral, referredStatus, thanksOn, thanksAllowed, thanksWhat, referrerName,
}: {
  referredId: string;
  referral: ReferralThanks | null;
  referredStatus: InquiryStatus;
  thanksOn: "applied" | "enrolled";
  /** Thank-yous are on, or this is a sample. */
  thanksAllowed: boolean;
  thanksWhat: string | null;
  referrerName: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const res = await fn();
      setError(res.ok ? null : (res as { error: string }).error);
      if (res.ok) setDeclining(false);
    });
  const ready = thanksOn === "applied" ? referredStatus === "applied" || referredStatus === "enrolled" : referredStatus === "enrolled";

  let body: React.ReactNode;
  if (!referral) {
    body = (
      <div className="flex flex-wrap items-center gap-3">
        <button className={button} disabled={pending} onClick={() => run(() => confirmReferralAction(referredId))}>
          {pending ? "Confirming…" : "Confirm the referral"}
        </button>
        <span className="text-xs text-[var(--color-ink-muted)]">Check it&apos;s a different family who really heard about us from {referrerName}.</span>
      </div>
    );
  } else if (referral.status === "confirmed") {
    body = (
      <div className="space-y-2">
        <p>Confirmed by {referral.confirmed_by}, {shortDate(referral.confirmed_at)}.</p>
        {!thanksAllowed ? (
          <p className="text-xs text-[var(--color-ink-muted)]">Thank-yous are off until an admin records leadership&apos;s decision.</p>
        ) : !ready ? (
          <p className="text-xs text-[var(--color-ink-muted)]">
            A thank-you can be approved once this family has {thanksOn}. Change their status above when they do.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <button className={button} disabled={pending} onClick={() => run(() => stepReferralThanksAction(referral.id, "approved"))}>
              {pending ? "Approving…" : "Approve the thank-you"}
            </button>
            <span className="text-xs text-[var(--color-ink-muted)]">{thanksWhat ?? "A handwritten note (sample)"}, for {referrerName}.</span>
          </div>
        )}
      </div>
    );
  } else if (referral.status === "approved") {
    body = (
      <div className="space-y-2">
        <p>
          Thank-you approved by {referral.approved_by}, {referral.approved_at ? shortDate(referral.approved_at) : ""}: {referral.what}.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button className={button} disabled={pending} onClick={() => run(() => stepReferralThanksAction(referral.id, "sent"))}>
            {pending ? "Recording…" : "I've sent it"}
          </button>
          <span className="text-xs text-[var(--color-ink-muted)]">Send it yourself, then record it here with your name.</span>
        </div>
      </div>
    );
  } else if (referral.status === "sent") {
    body = (
      <p>
        Thanked: {referral.what}. Approved by {referral.approved_by}, sent by {referral.sent_by}
        {referral.sent_at ? `, ${shortDate(referral.sent_at)}` : ""}.
      </p>
    );
  } else {
    body = <p>Declined: {referral.note}</p>;
  }

  const canDecline = referral && (referral.status === "confirmed" || referral.status === "approved");
  return (
    <div className="space-y-2 text-sm">
      {body}
      {canDecline && !declining && (
        <button className="text-xs text-[var(--color-ink-muted)] underline" onClick={() => setDeclining(true)}>No thank-you for this one</button>
      )}
      {canDecline && declining && (
        <div className="flex flex-wrap items-center gap-2">
          <input className={`${input} max-w-sm`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why (e.g. same family, already thanked)" maxLength={500} />
          <button className={quiet} disabled={pending || !note.trim()} onClick={() => run(() => stepReferralThanksAction(referral.id, "declined", note))}>
            Record it
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
