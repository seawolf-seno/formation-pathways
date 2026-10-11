"use client";

import { useState, useTransition } from "react";
import {
  addParticipantAction,
  checkBlackbaudAction,
  disconnectBlackbaudAction,
  loadSamplePilotAction,
  runImportAction,
  setAutoApproveStaffAction,
  setGateAction,
  setStaffAction,
} from "@/lib/sor/actions";
import type { ImportOutcome } from "@/lib/sor/importers/run";
import { looksLikeStudentAddress } from "@/lib/sor/student-address";
import type { PilotSettings, SourceSystem, StaffListEntry, StaffRole } from "@/lib/sor/types";

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
  { system: "finalsite", label: "Finalsite", liveHint: "Live from the Finalsite API when configured; or upload a report export (CSV)" },
  { system: "blackbaud", label: "Blackbaud", liveHint: "Live while Blackbaud is connected (above)" },
  { system: "canvas", label: "Canvas", liveHint: "Live when Canvas token + pilot course ids are set" },
];

/** Connect Blackbaud (60-minute token in this browser only) and check the
 *  connection against one user (your own staff record): field names only. */
export function BlackbaudConnectPanel({ appConfigured, expiresAt }: { appConfigured: boolean; expiresAt: string | null }) {
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string; detail?: string } | null>(null);
  const [pending, start] = useTransition();
  const check = (fd: FormData) =>
    start(async () => {
      const res = await checkBlackbaudAction(fd);
      if (!res.ok) return setMsg({ tone: "error", text: res.error });
      const { found, keys, mapped } = res.check;
      setMsg(
        found
          ? {
              tone: "ok",
              text: `Connected. Mapped fields found: ${mapped.join(", ") || "none"}. (A staff record has no grade or class year; those show up on students.)`,
              detail: `Field names seen (no values): ${keys.join(", ") || "none"}`,
            }
          : { tone: "error", text: "Connected, but Blackbaud has no user with that id." }
      );
    });
  if (!appConfigured) {
    return (
      <p className="mb-3 rounded-xl border border-dashed border-[var(--color-border)] bg-white p-4 text-sm text-[var(--color-ink-muted)]">
        Blackbaud: not set up. Add BLACKBAUD_SUBSCRIPTION_KEY, BLACKBAUD_CLIENT_ID and BLACKBAUD_CLIENT_SECRET (Production) and redeploy.
      </p>
    );
  }
  return (
    <div className="mb-3 rounded-xl border border-[var(--color-border)] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--color-navy-ink)]">
          <span className="font-medium">Blackbaud:</span>{" "}
          {expiresAt
            ? `connected until ${new Date(expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} (this browser only)`
            : "not connected"}
        </p>
        <div className="flex gap-2">
          {/* A plain link: the route redirects to Blackbaud's sign-in. */}
          <a href="/auth/blackbaud/start" className={button}>
            {expiresAt ? "Reconnect" : "Connect Blackbaud"}
          </a>
          {expiresAt && (
            <button disabled={pending} className={quiet} onClick={() => start(async () => void (await disconnectBlackbaudAction()))}>
              Disconnect
            </button>
          )}
        </div>
      </div>
      {expiresAt && (
        <form action={check} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
          <input name="blackbaud_id" inputMode="numeric" placeholder="Your own Blackbaud user id (staff record)" className={input} />
          <button disabled={pending} className={quiet}>{pending ? "Checking…" : "Check connection"}</button>
        </form>
      )}
      {msg && (
        <p className={`mt-2 text-xs ${msg.tone === "error" ? "text-red-700" : "text-[var(--color-ink-muted)]"}`}>
          {msg.text}
          {msg.detail && <span className="block text-[var(--color-ink-muted)]">⚠ {msg.detail}</span>}
        </p>
      )}
    </div>
  );
}

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
                {live[system] ? "live" : system === "finalsite" ? "sample / upload" : "sample"}
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

const ROLE_LABEL: Record<StaffRole, string> = {
  staff: "Staff (capture only)",
  teacher: "Teacher",
  admissions: "Admissions",
  admin: "Admin",
  viewer: "View only (sample students)",
};

function StaffRow({ member, isSelf }: { member: StaffListEntry; isSelf: boolean }) {
  const [role, setRole] = useState<StaffRole>(member.role);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (change: { role?: StaffRole; active?: boolean }) =>
    start(async () => {
      const res = await setStaffAction(member.user_id, change);
      setError(res.ok ? null : res.error);
    });

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
      <span className="text-sm">
        <span className="font-medium text-[var(--color-navy-ink)]">{member.display_name}</span>{" "}
        <span className="text-[var(--color-ink-muted)]">{member.email}</span>
        {!member.active && (
          <span className="ml-2 rounded bg-[var(--color-gold-light)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
            No access
          </span>
        )}
        {looksLikeStudentAddress(member.email) && (
          <span className="ml-2 rounded bg-[var(--color-gold-light)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
            Student address
          </span>
        )}
      </span>
      {isSelf ? (
        <span className="text-xs text-[var(--color-ink-muted)]">{ROLE_LABEL[member.role]} · you</span>
      ) : (
        <span className="flex flex-wrap items-center gap-2">
          <select
            value={role}
            disabled={pending}
            onChange={(e) => {
              const next = e.target.value as StaffRole;
              setRole(next);
              if (member.active) run({ role: next });
            }}
            className="rounded-lg border border-[var(--color-border)] bg-white px-2 py-1.5 text-sm"
          >
            {(Object.keys(ROLE_LABEL) as StaffRole[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          {member.active ? (
            <button disabled={pending} onClick={() => run({ active: false })} className={quiet}>
              Remove access
            </button>
          ) : (
            <button disabled={pending} onClick={() => run({ role, active: true })} className={button}>
              Approve
            </button>
          )}
        </span>
      )}
      <Err msg={error} />
    </li>
  );
}

export function StaffPanel({
  staff,
  selfId,
  autoApprove,
}: {
  staff: StaffListEntry[];
  selfId: string;
  autoApprove: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const waiting = staff.filter((s) => !s.active).length;
  const studentsIn = staff.filter((s) => s.active && s.user_id !== selfId && looksLikeStudentAddress(s.email)).length;
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-[var(--color-border)] bg-white p-4 text-sm">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={autoApprove}
            disabled={pending}
            onChange={(e) =>
              start(async () => {
                const res = await setAutoApproveStaffAction(e.target.checked);
                setError(res.ok ? null : res.error);
              })
            }
            className="mt-1"
          />
          <span>
            <span className="font-medium text-[var(--color-navy-ink)]">
              Approve new @pacificachristian.org sign-ins automatically
            </span>
            <span className="block text-[var(--color-ink-muted)]">
              They start as Staff (capture only). Students have @pacificachristian.org addresses too:
              an address with a number before the @ always waits for you to approve it here.
            </span>
          </span>
        </label>
        <Err msg={error} />
      </div>
      <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
        {staff.length === 0 ? (
          <p className="p-5 text-sm text-[var(--color-ink-muted)]">No one has signed in yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {staff.map((m) => (
              <StaffRow key={m.user_id} member={m} isSelf={m.user_id === selfId} />
            ))}
          </ul>
        )}
      </div>
      {waiting > 0 && (
        <p className="text-xs text-[var(--color-ink-muted)]">
          {waiting} without access. Staff sign in themselves at the capture URL; approving them here
          is the only step.
        </p>
      )}
      {studentsIn > 0 && (
        <p className="text-xs text-[var(--color-ink-muted)]">
          {studentsIn} with a student address {studentsIn === 1 ? "has" : "have"} access. Check that each one
          is meant to; Remove access takes it away.
        </p>
      )}
    </div>
  );
}
