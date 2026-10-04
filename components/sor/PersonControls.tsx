"use client";

import { useState, useTransition } from "react";
import {
  approveDraftAction,
  draftPathwaysAction,
  recordConsentAction,
  revokeConsentAction,
  createSparkLinkAction,
  setExternalIdsAction,
  updateDraftPathwaysAction,
  withdrawParticipantAction,
} from "@/lib/sor/actions";
import { CONSENT_SCOPES, type Consent } from "@/lib/sor/types";

const input = "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm";
const button = "rounded-lg bg-[var(--color-navy)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50";
const quiet =
  "rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-medium text-[var(--color-navy-ink)] disabled:opacity-50";

export function DraftButton({ personId, hasDraft, allowed }: { personId: string; hasDraft: boolean; allowed: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <button
        disabled={pending || !allowed}
        className={button}
        onClick={() =>
          start(async () => {
            const res = await draftPathwaysAction(personId);
            setError(res.ok ? null : res.error);
          })
        }
      >
        {pending ? "Reading their story…" : hasDraft ? "Draft again from latest data" : "Draft who they are today + 3 pathways"}
      </button>
      {!allowed && <p className="mt-1 text-xs text-[var(--color-ink-muted)]">Needs AI-drafting consent.</p>}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}

export function ApproveButton({ draftId, personId }: { draftId: string; personId: string }) {
  const [pending, start] = useTransition();
  return (
    <button disabled={pending} className={button} onClick={() => start(async () => void (await approveDraftAction(draftId, personId)))}>
      {pending ? "Signing…" : "I've reviewed this. Sign as approved"}
    </button>
  );
}

export function ConsentPanel({ personId, consents, isAdmin }: { personId: string; consents: Consent[]; isAdmin: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const active = consents.filter((c) => !c.revoked_at);
  const missing = CONSENT_SCOPES.filter(({ scope }) => !active.some((c) => c.scope === scope));

  return (
    <div className="space-y-3">
      <ul className="space-y-2 text-sm">
        {CONSENT_SCOPES.map(({ scope, label, detail }) => {
          const c = active.find((x) => x.scope === scope);
          return (
            <li key={scope} className="flex items-start justify-between gap-3">
              <span>
                <span className={c ? "text-[var(--color-navy-ink)]" : "text-[var(--color-ink-muted)]"}>{c ? "✓" : "–"} {label}</span>
                <span className="block text-xs text-[var(--color-ink-muted)]">
                  {c ? `${c.granted_by}, ${c.granted_on} · ${c.evidence}` : detail}
                </span>
              </span>
              {c && isAdmin && (
                <button
                  disabled={pending}
                  className="shrink-0 text-xs text-red-700 underline"
                  onClick={() => start(async () => void (await revokeConsentAction(c.id, personId)))}
                >
                  Revoke
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {isAdmin && missing.length > 0 && (
        <form
          action={(fd) =>
            start(async () => {
              const res = await recordConsentAction(fd);
              setError(res.ok ? null : res.error);
            })
          }
          className="space-y-2 border-t border-[var(--color-border)] pt-3"
        >
          <input type="hidden" name="person_id" value={personId} />
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]">Add signed consent</p>
          {missing.map(({ scope, label }) => (
            <label key={scope} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="scope" value={scope} defaultChecked /> {label}
            </label>
          ))}
          <input name="granted_by" placeholder="Parent/guardian who signed" className={input} />
          <input name="granted_on" type="date" className={input} />
          <input name="evidence" placeholder="Where the signed form lives" className={input} />
          <button disabled={pending} className={button}>Save consent</button>
          {error && <p className="text-sm text-red-700">{error}</p>}
        </form>
      )}
    </div>
  );
}

export function WithdrawButton({ personId, name }: { personId: string; name: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  if (!confirming) {
    return (
      <button className="text-xs text-red-700 underline" onClick={() => setConfirming(true)}>
        Withdraw from pilot and delete all data…
      </button>
    );
  }
  return (
    <div className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
      Permanently delete {name} and all imported data, observations and drafts about them? The access log keeps
      only that this happened.
      <div className="mt-2 flex gap-2">
        <button disabled={pending} className="rounded-lg bg-red-700 px-3 py-1.5 text-white" onClick={() => start(() => withdrawParticipantAction(personId).then(() => {}))}>
          {pending ? "Deleting…" : "Delete permanently"}
        </button>
        <button className={quiet} onClick={() => setConfirming(false)}>Cancel</button>
      </div>
    </div>
  );
}

const ID_FIELDS = [
  { system: "finalsite", label: "Finalsite Person ID" },
  { system: "blackbaud", label: "Blackbaud user id" },
  { system: "canvas", label: "Canvas user id" },
] as const;

/** The ids importers match on. Admins edit them on real participants;
 *  everyone else (and sample students) sees them read-only. */
export function ExternalIdsPanel({
  personId,
  ids,
  editable,
}: {
  personId: string;
  ids: { system: string; external_id: string }[];
  editable: boolean;
}) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const value = (system: string) => ids.find((x) => x.system === system)?.external_id ?? "";

  if (!editable) {
    return ids.length ? (
      <ul className="space-y-1 text-xs text-[var(--color-ink-muted)]">
        {ids.map((x) => (
          <li key={x.system}>
            <span className="capitalize">{x.system}</span>: <span className="font-mono">{x.external_id}</span>
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-xs text-[var(--color-ink-muted)]">No linked systems.</p>
    );
  }

  const save = (fd: FormData) =>
    start(async () => {
      const res = await setExternalIdsAction(fd);
      setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
    });

  return (
    <form action={save} className="space-y-2">
      <input type="hidden" name="person_id" value={personId} />
      {ID_FIELDS.map(({ system, label }) => (
        <label key={system} className="block text-xs text-[var(--color-ink-muted)]">
          {label}
          <input
            name={`${system}_id`}
            defaultValue={value(system)}
            inputMode={system === "finalsite" ? "text" : "numeric"}
            className={`${input} mt-1 font-mono`}
          />
        </label>
      ))}
      <p className="text-xs text-[var(--color-ink-muted)]">Leave a field empty to unlink that system. Imports only fetch students who also have consent to import.</p>
      <button disabled={pending} className={button}>{pending ? "Saving…" : "Save ids"}</button>
      {msg && <p className={`text-xs ${msg.ok ? "text-[var(--color-ink-muted)]" : "text-red-700"}`}>{msg.text}</p>}
    </form>
  );
}

type EditablePathway = {
  name: string;
  firstSemester: string;
  mentorArchetype: string;
  stretchChallenge: string;
  fourYearHorizon: string[];
  milestones?: { when: string; title: string; detail: string; spark?: string }[];
  glimpse?: string;
};
type TextKey = "name" | "firstSemester" | "mentorArchetype" | "stretchChallenge" | "horizon" | "glimpse";
type Milestone = { when: string; title: string; detail: string; spark?: string };
const EMPTY_STEPS: Milestone[] = Array.from({ length: 4 }, () => ({ when: "", title: "", detail: "", spark: "" }));

/** Edit an unsigned draft's three pathways before signing it. */
export function EditPathwaysPanel({
  draftId,
  personId,
  pathways,
}: {
  draftId: string;
  personId: string;
  pathways: EditablePathway[];
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(() =>
    pathways.map((p) => ({
      name: p.name,
      firstSemester: p.firstSemester,
      mentorArchetype: p.mentorArchetype,
      stretchChallenge: p.stretchChallenge,
      horizon: p.fourYearHorizon.join("\n"),
      glimpse: p.glimpse ?? "",
      // Always four editable steps; blank ones are dropped on save.
      steps: [...(p.milestones ?? []), ...EMPTY_STEPS].slice(0, Math.max(4, p.milestones?.length ?? 0)),
    }))
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (i: number, key: TextKey, value: string) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, [key]: value } : row)));
  const setStep = (i: number, s: number, key: keyof Milestone, value: string) =>
    setRows((r) =>
      r.map((row, j) =>
        j === i ? { ...row, steps: row.steps.map((st, k) => (k === s ? { ...st, [key]: value } : st)) } : row
      )
    );

  if (!open) {
    return (
      <button className={quiet} onClick={() => setOpen(true)}>
        Edit the pathways before signing
      </button>
    );
  }
  const save = () =>
    start(async () => {
      const res = await updateDraftPathwaysAction({
        draftId,
        personId,
        pathways: rows.map(({ horizon, steps, glimpse, ...p }) => ({
          ...p,
          fourYearHorizon: horizon.split("\n"),
          milestones: steps.filter((st) => st.when.trim() || st.title.trim() || st.detail.trim()),
          glimpse,
        })),
      });
      if (res.ok) {
        setError(null);
        setOpen(false);
      } else setError(res.error);
    });
  const area = `${input} mt-1 leading-relaxed`;
  return (
    <div className="space-y-5 rounded-xl bg-white p-5 text-left">
      {rows.map((row, i) => (
        <fieldset key={i} className="space-y-2 border-t border-[var(--color-border)] pt-4 first:border-0 first:pt-0">
          <legend className="text-xs font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]">Pathway {i + 1}</legend>
          <label className="block text-xs text-[var(--color-ink-muted)]">
            Name
            <input value={row.name} onChange={(e) => set(i, "name", e.target.value)} className={`${input} mt-1`} />
          </label>
          <label className="block text-xs text-[var(--color-ink-muted)]">
            Next semester
            <textarea value={row.firstSemester} onChange={(e) => set(i, "firstSemester", e.target.value)} rows={3} className={area} />
          </label>
          <label className="block text-xs text-[var(--color-ink-muted)]">
            People to learn alongside (department only for real faculty)
            <textarea value={row.mentorArchetype} onChange={(e) => set(i, "mentorArchetype", e.target.value)} rows={2} className={area} />
          </label>
          <label className="block text-xs text-[var(--color-ink-muted)]">
            Room to stretch
            <textarea value={row.stretchChallenge} onChange={(e) => set(i, "stretchChallenge", e.target.value)} rows={2} className={area} />
          </label>
          <label className="block text-xs text-[var(--color-ink-muted)]">
            Beyond these four years (one per line)
            <textarea value={row.horizon} onChange={(e) => set(i, "horizon", e.target.value)} rows={3} className={area} />
          </label>
          <div className="space-y-2 rounded-lg bg-[var(--color-canvas)] p-3">
            <p className="text-xs text-[var(--color-ink-muted)]">
              The road, step by step (shown as the animated journey; at least three complete steps, or leave blank to let the page build them from the text above)
            </p>
            {row.steps.map((st, s) => (
              <div key={s} className="grid gap-2 sm:grid-cols-[9rem_1fr]">
                <input
                  value={st.when}
                  onChange={(e) => setStep(i, s, "when", e.target.value)}
                  placeholder={["Next semester", "This year", "Next year", "Senior year"][s] ?? "When"}
                  aria-label={`Step ${s + 1}: when`}
                  className={input}
                />
                <input
                  value={st.title}
                  onChange={(e) => setStep(i, s, "title", e.target.value)}
                  placeholder="Short title"
                  aria-label={`Step ${s + 1}: title`}
                  className={input}
                />
                <textarea
                  value={st.detail}
                  onChange={(e) => setStep(i, s, "detail", e.target.value)}
                  rows={2}
                  placeholder="One sentence"
                  aria-label={`Step ${s + 1}: detail`}
                  className={`${area} sm:col-span-2`}
                />
                <input
                  value={st.spark ?? ""}
                  onChange={(e) => setStep(i, s, "spark", e.target.value)}
                  placeholder="Grew from their spark (optional, their words)"
                  aria-label={`Step ${s + 1}: grew from spark`}
                  className={`${input} sm:col-span-2`}
                />
              </div>
            ))}
          </div>
          <label className="block text-xs text-[var(--color-ink-muted)]">
            A glimpse (2–3 sentences, &quot;Picture a Thursday next spring…&quot;; an invitation, not a promise)
            <textarea value={row.glimpse} onChange={(e) => set(i, "glimpse", e.target.value)} rows={3} className={area} />
          </label>
        </fieldset>
      ))}
      <div className="flex gap-2">
        <button disabled={pending} className={button} onClick={save}>{pending ? "Saving…" : "Save edits"}</button>
        <button disabled={pending} className={quiet} onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

/** Make a one-time, write-only link so the family can do Spark at home.
 *  The URL is shown once (only its hash is stored). */
export function SparkLinkButton({ personId, firstName }: { personId: string; firstName: string }) {
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (link) {
    return (
      <div className="space-y-2 rounded-xl border border-[var(--color-gold)] bg-[var(--color-gold-light)] p-3 text-sm">
        <p className="text-[var(--color-navy-ink)]">
          Send this to {firstName}&apos;s family. It works <b>once</b>, until{" "}
          {new Date(link.expiresAt).toLocaleDateString([], { month: "short", day: "numeric" })}, and only lets them add sparks.
          Copy it now: it can&apos;t be shown again.
        </p>
        <div className="flex gap-2">
          <input readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} className={`${input} font-mono text-xs`} />
          <button
            className={button}
            onClick={async () => {
              await navigator.clipboard.writeText(link.url);
              setCopied(true);
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div>
      <button
        disabled={pending}
        className={quiet}
        onClick={() =>
          start(async () => {
            const res = await createSparkLinkAction(personId);
            if (res.ok) setLink({ url: res.url, expiresAt: res.expiresAt });
            else setError(res.error);
          })
        }
      >
        {pending ? "Making a link…" : "Send a link home ✉"}
      </button>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
