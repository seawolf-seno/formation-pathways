"use client";

import { useState, useTransition } from "react";
import {
  approveDraftAction,
  draftPathwaysAction,
  recordConsentAction,
  revokeConsentAction,
  setExternalIdsAction,
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
