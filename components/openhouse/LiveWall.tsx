"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSchoolAction, markAppliedAction, pullCardAction, saveSchoolAction, signCardAction, waiveFeeAction } from "@/lib/openhouse-staff-actions";

export interface WallCard {
  id: string;
  firstName: string;
  grade: number | null;
  interests: string[];
  titles: string[];
  mentors: string[];
  status: string;
  usedAi: boolean;
  reviewedBy: string | null;
  shared: boolean;
  applied: boolean;
  friends: number;
  friendsApplied: number;
  waivedBy: string | null;
  created: string;
  sample: boolean;
}

const pill = "rounded-full px-2 py-0.5 text-[11px]";

/** Refresh the wall every 15 seconds while it's open. */
export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 15000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}

export function CardTile({ c, waiverOn }: { c: WallCard; waiverOn: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      setError(r.ok ? null : (r as { error: string }).error);
      router.refresh();
    });
  return (
    <li className={`rounded-2xl border bg-white p-4 ${c.status === "pulled" ? "border-dashed opacity-60" : "border-[var(--color-border)]"}`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-display text-lg text-[var(--color-navy-ink)]">
          {c.firstName} {c.grade ? <span className="text-sm text-[var(--color-ink-muted)]">· {c.grade}th</span> : null}
        </p>
        <span className="text-xs text-[var(--color-ink-muted)]">{new Date(c.created).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
      </div>
      <p className="mt-1 text-sm text-[var(--color-ink)]">{c.titles.join(" · ") || "Drafting…"}</p>
      <p className="text-xs text-[var(--color-ink-muted)]">{c.mentors.join(", ")}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {c.sample && <span className={`${pill} border border-dashed border-[var(--color-border)]`}>sample</span>}
        {!c.usedAi && <span className={`${pill} bg-[var(--color-pacific-light)]`}>no AI</span>}
        {c.reviewedBy && <span className={`${pill} bg-[var(--color-pacific)]`}>✓ {c.reviewedBy}</span>}
        {c.shared && <span className={`${pill} bg-[var(--color-gold-light)]`}>shared</span>}
        {c.friends > 0 && <span className={`${pill} bg-[var(--color-gold-light)]`}>{c.friends} friend{c.friends === 1 ? "" : "s"}</span>}
        {c.applied && <span className={`${pill} bg-[var(--color-navy)] text-white`}>applied</span>}
        {c.waivedBy && <span className={`${pill} bg-[var(--color-gold)]`}>fee waived</span>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {c.status === "live" && !c.reviewedBy && (
          <button disabled={pending} onClick={() => run(() => signCardAction(c.id))} className="rounded-lg bg-[var(--color-navy)] px-3 py-1.5 text-white">
            Looks good
          </button>
        )}
        <button disabled={pending} onClick={() => run(() => pullCardAction(c.id, c.status !== "pulled"))} className="rounded-lg border border-[var(--color-border)] px-3 py-1.5">
          {c.status === "pulled" ? "Put back" : "Pull"}
        </button>
        <button disabled={pending} onClick={() => run(() => markAppliedAction(c.id, !c.applied))} className="rounded-lg border border-[var(--color-border)] px-3 py-1.5">
          {c.applied ? "Not applied" : "Applied"}
        </button>
        {waiverOn && c.friendsApplied > 0 && !c.waivedBy && (
          <button disabled={pending} onClick={() => run(() => waiveFeeAction(c.id))} className="rounded-lg bg-[var(--color-gold)] px-3 py-1.5 text-[var(--color-navy-ink)]">
            Waive fee
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-[var(--color-navy-ink)]">{error}</p>}
    </li>
  );
}

export function Schools({ schools }: { schools: { name: string; students: number; highlights: string[] }[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-[var(--color-border)] rounded-xl border border-[var(--color-border)] bg-white text-sm">
        {schools.map((s) => (
          <li key={s.name} className="flex items-center justify-between gap-2 px-3 py-2">
            <span>
              {s.name} · {s.students} students{s.highlights.length ? ` · ${s.highlights.join(", ")}` : ""}
              {s.students < 5 && <span className="text-xs text-[var(--color-ink-muted)]"> (hidden: under 5)</span>}
            </span>
            <button disabled={pending} onClick={() => start(async () => void (await deleteSchoolAction(s.name), router.refresh()))} className="text-xs underline">
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form
        action={(fd) =>
          start(async () => {
            const r = await saveSchoolAction(fd);
            setError(r.ok ? null : r.error);
            router.refresh();
          })
        }
        className="flex flex-wrap gap-2 text-sm"
      >
        <input name="name" required placeholder="School" className="flex-1 rounded-lg border border-[var(--color-border)] px-2 py-1.5" />
        <input name="students" required type="number" min={0} placeholder="Students now at Pacifica" className="w-48 rounded-lg border border-[var(--color-border)] px-2 py-1.5" />
        <input name="highlights" placeholder="Up to 3, e.g. robotics, choir, soccer" className="flex-1 rounded-lg border border-[var(--color-border)] px-2 py-1.5" />
        <button disabled={pending} className="rounded-lg bg-[var(--color-navy)] px-3 py-1.5 text-white">
          Save
        </button>
      </form>
      {error && <p className="text-xs">{error}</p>}
    </div>
  );
}
