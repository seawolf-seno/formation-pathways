"use client";

import { useState, useTransition } from "react";
import {
  addParticipantAction,
  loadSamplePilotAction,
  runImportAction,
  setGateAction,
} from "@/lib/sor/actions";
import type { ImportOutcome } from "@/lib/sor/importers/run";
import type { PilotSettings, SourceSystem } from "@/lib/sor/types";

const input =
  "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm";
const button =
  "rounded-lg bg-[var(--color-navy)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50";
const quiet =
  "rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-medium text-[var(--color-navy-ink)] disabled:opacity-50";

function Err({ msg }: { msg: string | null }) {
  return msg ? <p className="mt-2 text-sm text-red-700">{msg}</p> : null;
}

export function GatePanel({ settings, isAdmin }: { settings: PilotSettings; isAdmin: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = (fd: FormData) =>
    start(async () => {
      const res = await setGateAction(fd);
      setError(res.ok ? null : res.error);
    });

  if (settings.real_data_enabled) {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-white p-5">
        <p className="text-sm font-semibold text-[var(--color-navy-ink)]">Real-data pilot: OPEN</p>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Approved by {settings.approved_by} — {settings.approval_reference} (
          {settings.approved_at?.slice(0, 10)}).
        </p>
        {isAdmin && (
          <form action={submit} className="mt-3">
            <input type="hidden" name="open" value="false" />
            <button disabled={pending} className={quiet}>Lock real data again</button>
          </form>
        )}
        <Err msg={error} />
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-[var(--color-gold)] bg-[var(--color-gold-light)] p-5">
      <p className="text-sm font-semibold text-[var(--color-navy-ink)]">Real-data pilot: LOCKED</p>
      <p className="mt-1 text-sm text-[var(--color-ink)]">
        Only fictional sample students can exist until school leadership approves the pilot (consent
        form, data handling, who can see what). The database itself refuses real students until then.
      </p>
      {isAdmin && (
        <form action={submit} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input type="hidden" name="open" value="true" />
          <input name="approved_by" placeholder="Approved by (name, title)" className={input} />
          <input name="approval_reference" placeholder="Where it's recorded (e.g. leadership minutes 10/1)" className={input} />
          <button disabled={pending} className={button}>Save sign-off</button>
        </form>
      )}
      <Err msg={error} />
    </div>
  );
}

const SOURCES: { system: SourceSystem; label: string; liveHint: string }[] = [
  { system: "finalsite", label: "Finalsite", liveHint: "Upload a report export (CSV) for a live import" },
  { system: "blackbaud", label: "Blackbaud", liveHint: "Live when SKY API key + token are set" },
  { system: "canvas", label: "Canvas", liveHint: "Live when Canvas token + pilot course ids are set" },
];

export function ImportPanel({ live }: { live: Record<SourceSystem, boolean> }) {
  const [results, setResults] = useState<Partial<Record<SourceSystem, ImportOutcome | string>>>({});
  const [pending, start] = useTransition();
  const run = (system: SourceSystem, fd?: FormData) =>
    start(async () => {
      const res = await runImportAction(system, fd);
      setResults((r) => ({ ...r, [system]: res.ok ? res.outcome : res.error }));
    });

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {SOURCES.map(({ system, label, liveHint }) => {
        const r = results[system];
        return (
          <form
            key={system}
            action={(fd) => run(system, fd)}
            className="rounded-xl border border-[var(--color-border)] bg-white p-4"
          >
            <div className="flex items-center justify-between">
              <p className="font-medium text-[var(--color-navy-ink)]">{label}</p>
              <span className="rounded-full bg-[var(--color-pacific-light)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-navy-ink)]">
                {system === "finalsite" ? "sample / upload" : live[system] ? "live" : "sample"}
              </span>
            </div>
            <p className="mt-1 text-xs text-[var(--color-ink-muted)]">{liveHint}</p>
            {system === "finalsite" && (
              <input type="file" name="file" accept=".csv,text/csv" className="mt-2 w-full text-xs" />
            )}
            <button disabled={pending} className={`${button} mt-3 w-full`}>
              {pending ? "Importing…" : `Import from ${label}`}
            </button>
            {typeof r === "string" && <Err msg={r} />}
            {r && typeof r === "object" && (
              <p className={`mt-2 text-xs ${r.error ? "text-red-700" : "text-[var(--color-ink-muted)]"}`}>
                {r.error
                  ? r.error
                  : `${r.mode}: ${r.matched} updated, ${r.unmatched} not found in ${label}, ${r.skippedNoConsent} skipped (no consent).`}
                {r.warnings.map((w) => (
                  <span key={w} className="block text-[var(--color-ink-muted)]">⚠ {w}</span>
                ))}
              </p>
            )}
          </form>
        );
      })}
    </div>
  );
}

export function SamplePilotButton() {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <button
        disabled={pending}
        className={quiet}
        onClick={() =>
          start(async () => {
            const res = await loadSamplePilotAction();
            setMsg(res.ok ? `Added ${res.added} fictional sample students.` : res.error);
          })
        }
      >
        Load fictional sample pilot
      </button>
      {msg && <p className="mt-1 text-xs text-[var(--color-ink-muted)]">{msg}</p>}
    </div>
  );
}

export function AddParticipantForm({ gateOpen }: { gateOpen: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!gateOpen) {
    return (
      <p className="text-sm text-[var(--color-ink-muted)]">
        Adding real students unlocks once leadership sign-off is recorded above.
      </p>
    );
  }
  return (
    <form
      action={(fd) =>
        start(async () => {
          const res = await addParticipantAction(fd);
          setError(res.ok ? null : res.error);
        })
      }
      className="grid gap-2 sm:grid-cols-4"
    >
      <input name="first_name" required placeholder="First name" className={input} />
      <input name="last_name" required placeholder="Last name" className={input} />
      <input name="preferred_name" placeholder="Preferred name" className={input} />
      <select name="stage" className={input} defaultValue="applicant">
        <option value="applicant">Applicant</option>
        <option value="admitted">Admitted</option>
        <option value="enrolled">Enrolled</option>
      </select>
      <input name="finalsite_id" placeholder="Finalsite Person ID" className={input} />
      <input name="blackbaud_id" placeholder="Blackbaud user id" className={input} />
      <input name="canvas_id" placeholder="Canvas user id" className={input} />
      <input name="grad_year" inputMode="numeric" placeholder="Grad year" className={input} />
      <button disabled={pending} className={`${button} sm:col-span-4`}>
        Add to pilot (then add consent on their page)
      </button>
      <div className="sm:col-span-4"><Err msg={error} /></div>
    </form>
  );
}
