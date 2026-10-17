"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { joinOpenHouseAction } from "@/lib/openhouse-actions";

const input = "w-full rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-lg";

/** The one Open House screen: first name, grade, what they love, school,
 *  email, go. */
export function OhForm({ interests, schools, refCode }: { interests: { id: string; label: string }[]; schools: string[]; refCode: string | null }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 3 ? [...p, id] : p));

  if (pending)
    return (
      <div className="py-16 text-center">
        <div className="mx-auto h-16 w-16 animate-spin rounded-full border-4 border-[var(--color-pacific-light)] border-t-[var(--color-gold)]" />
        <p className="mt-6 font-display text-2xl text-[var(--color-navy-ink)]">Drawing your pathway…</p>
      </div>
    );

  return (
    <form
      action={(fd) =>
        start(async () => {
          setError(null);
          picked.forEach((p) => fd.append("interests", p));
          if (refCode) fd.set("ref", refCode);
          const res = await joinOpenHouseAction(fd);
          if (!res.ok) return setError(res.error);
          router.push(`/oh/${res.token}`);
        })
      }
      className="space-y-5"
    >
      <input name="first_name" required maxLength={40} autoComplete="off" placeholder="Your child's first name" className={input} />
      <div className="flex gap-2">
        {[6, 7, 8, 9, 10, 11].map((g) => (
          <label key={g} className="flex-1">
            <input type="radio" name="grade" value={g} className="peer sr-only" />
            <span className="block rounded-xl border border-[var(--color-border)] bg-white py-2 text-center text-sm peer-checked:border-[var(--color-navy)] peer-checked:bg-[var(--color-navy)] peer-checked:text-white">
              {g}th
            </span>
          </label>
        ))}
      </div>
      <div>
        <p className="mb-2 text-sm text-[var(--color-ink-muted)]">What do they love? Pick up to 3.</p>
        <div className="flex flex-wrap gap-2">
          {interests.map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() => toggle(i.id)}
              aria-pressed={picked.includes(i.id)}
              className={`rounded-full px-4 py-2 text-sm ${picked.includes(i.id) ? "bg-[var(--color-navy)] text-white" : "border border-[var(--color-border)] bg-white text-[var(--color-navy-ink)]"}`}
            >
              {i.label}
            </button>
          ))}
        </div>
      </div>
      {schools.length > 0 && (
        <select name="school" defaultValue="" className={input}>
          <option value="">Current school (optional)</option>
          {schools.map((s) => (
            <option key={s}>{s}</option>
          ))}
          <option value="">Another school</option>
        </select>
      )}
      <input name="email" type="email" required autoComplete="email" placeholder="Parent email (we'll send your link)" className={input} />
      <label className="flex items-start gap-3 text-sm text-[var(--color-ink-muted)]">
        <input type="checkbox" name="consent" required className="mt-1 h-5 w-5" />
        Pacifica may contact me about admissions. Names stay out of the AI.
      </label>
      <button className="w-full rounded-2xl bg-[var(--color-navy)] py-4 text-lg font-semibold text-white">Show my pathway</button>
      {error && <p className="text-center text-sm text-[var(--color-navy-ink)]">{error}</p>}
    </form>
  );
}
