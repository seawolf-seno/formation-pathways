"use client";

import { useState, useTransition } from "react";
import { checkFinalsiteConnectionAction, runFunnelImportAction, setFunnelApprovalAction } from "@/lib/sor/actions";
import type { PilotSettings } from "@/lib/sor/types";

const input = "w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm";
const button = "rounded-lg bg-[var(--color-navy)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50";
const quiet =
  "rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-medium text-[var(--color-navy-ink)] disabled:opacity-50";

type Msg = { tone: "ok" | "error"; text: string; detail?: string[] } | null;

function Note({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <div className={`mt-2 text-xs ${msg.tone === "error" ? "text-red-700" : "text-[var(--color-ink-muted)]"}`}>
      <p>{msg.text}</p>
      {msg.detail?.map((d) => (
        <p key={d} className="break-words">⚠ {d}</p>
      ))}
    </div>
  );
}

export function SeasonSourcePanel({ settings, apiConfigured }: { settings: PilotSettings; apiConfigured: boolean }) {
  const [msg, setMsg] = useState<Msg>(null);
  const [check, setCheck] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const liveReady = apiConfigured && settings.funnel_live_enabled;

  const importCounts = (mode: "sample" | "live") =>
    start(async () => {
      const res = await runFunnelImportAction(mode);
      if (!res.ok) return setMsg({ tone: "error", text: res.error });
      const o = res.outcome;
      setMsg(
        o.error
          ? { tone: "error", text: o.error }
          : { tone: "ok", text: `${o.mode === "live" ? "Live" : "Sample"}: ${o.rows.toLocaleString()} counts across ${o.seasons} seasons.`, detail: o.warnings }
      );
    });

  const runCheck = () =>
    start(async () => {
      const res = await checkFinalsiteConnectionAction();
      if (!res.ok) return setCheck({ tone: "error", text: res.error });
      const { objectsOnFirstPage, fieldsFound, keysSeen, responseKeys, formats, setup, season } = res.check;
      // Admitted has no Finalsite field: it comes from status + the decision
      // release dates (see the School setup line), so it's never "missing".
      const missing = Object.entries(fieldsFound).filter(([k, v]) => !v && k !== "admittedOn").map(([k]) => k);
      setCheck({
        tone: missing.length ? "error" : "ok",
        text: `Connected: ${objectsOnFirstPage} contacts sampled; ${
          season.schoolYear ? `${season.newFamilies} new families in ${season.schoolYear}` : "no school year found for this season"
        }. ${
          missing.length ? `Not found yet: ${missing.join(", ")}.` : "Every field the counts need was found."
        }`,
        detail: [
          `Field names seen (no values): ${keysSeen.join(", ") || "none"}`,
          `Response shape (names only): ${responseKeys.join(", ") || "empty"}`,
          `Formats (no values): ${
            Object.entries(formats)
              .map(([f, t]) => `${f} (${fieldsFound[f as keyof typeof fieldsFound]}): ${Object.entries(t ?? {}).map(([k, n]) => `${k} ×${n}`).join(", ")}`)
              .join("; ") || "none"
          }`,
          `School setup (labels, no family data): ${
            Object.entries(setup)
              .map(([label, names]) => `${label}: ${names.join(" | ") || "none"}`)
              .join("; ")
          }`,
        ],
      });
    });

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
        <p className="font-medium text-[var(--color-navy-ink)]">Sample figures</p>
        <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
          Fictional season totals from <code>fixtures/sample/finalsite-funnel.json</code>, run through the same
          counting pipeline as live data.
        </p>
        <button disabled={pending} onClick={() => importCounts("sample")} className={`${quiet} mt-3 w-full`}>
          {pending ? "Working…" : "Load sample figures"}
        </button>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
        <div className="flex items-center justify-between">
          <p className="font-medium text-[var(--color-navy-ink)]">Finalsite API</p>
          <span className="rounded-full bg-[var(--color-pacific-light)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-navy-ink)]">
            {!apiConfigured ? "not configured" : settings.funnel_live_enabled ? "ready" : "awaiting approval"}
          </span>
        </div>
        <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
          Counts only. Each contact becomes an entry year and four dates, is counted, and is dropped. Groups under
          5 show as &ldquo;fewer than 5&rdquo;.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <button disabled={pending || !apiConfigured} onClick={runCheck} className={quiet}>
            Check connection
          </button>
          <button disabled={pending || !liveReady} onClick={() => importCounts("live")} className={button}>
            Import live counts
          </button>
        </div>
        <Note msg={check} />
      </div>
      <div className="sm:col-span-2">
        <Note msg={msg} />
      </div>
    </div>
  );
}

export function SeasonApprovalPanel({ settings }: { settings: PilotSettings }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = (fd: FormData) =>
    start(async () => {
      const res = await setFunnelApprovalAction(fd);
      setError(res.ok ? null : res.error);
    });

  if (settings.funnel_live_enabled) {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
        <p className="text-sm font-semibold text-[var(--color-navy-ink)]">Live Finalsite counts: APPROVED</p>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Approved by {settings.funnel_approved_by} — {settings.funnel_approval_reference} (
          {settings.funnel_approved_at?.slice(0, 10)}).
        </p>
        <form action={submit} className="mt-3">
          <input type="hidden" name="open" value="false" />
          <button disabled={pending} className={quiet}>Withdraw approval</button>
        </form>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-[var(--color-gold)] bg-[var(--color-gold-light)] p-4">
      <p className="text-sm font-semibold text-[var(--color-navy-ink)]">Live Finalsite counts: LOCKED</p>
      <p className="mt-1 text-sm text-[var(--color-ink)]">
        The database refuses live counts until someone in school leadership approves showing whole-school admissions
        totals here. This is separate from the student pilot, which stays locked either way.
      </p>
      <form action={submit} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input type="hidden" name="open" value="true" />
        <input name="approved_by" placeholder="Approved by (name, title)" className={input} />
        <input name="approval_reference" placeholder="Where it's recorded (e.g. email 10/2)" className={input} />
        <button disabled={pending} className={button}>Save approval</button>
      </form>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
