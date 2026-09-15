"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { StudentWithStats } from "@/lib/types";
import { humanDaysAgo } from "@/lib/format";
import { StaleIndicator } from "./StaleIndicator";
import { CaptureModal } from "./CaptureModal";

export function StudentList({ students }: { students: StudentWithStats[] }) {
  const [query, setQuery] = useState("");
  const [capturingFor, setCapturingFor] = useState<StudentWithStats | null>(
    null
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => s.name.toLowerCase().includes(q));
  }, [students, query]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl text-[var(--color-navy-ink)]">
            Roster
          </h1>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Most-stale students first — the ones worth a moment today.
          </p>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name…"
          className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm focus:border-[var(--color-pacific)] focus:outline-none sm:w-64"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
        <ul className="divide-y divide-[var(--color-border)]">
          {filtered.map((s) => (
            <li
              key={s.id}
              className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <Link
                href={`/students/${s.id}`}
                className="flex-1 min-w-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-base text-[var(--color-navy-ink)]">
                    {s.name}
                  </span>
                  <span className="text-xs text-[var(--color-ink-muted)]">
                    Grade {s.grade}
                  </span>
                  {s.needs_attention && <StaleIndicator />}
                </div>
                <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                  {s.observation_count} observation
                  {s.observation_count === 1 ? "" : "s"} · last witnessed{" "}
                  {s.days_since_observed === null
                    ? "never"
                    : humanDaysAgo(s.days_since_observed)}
                </p>
              </Link>
              <button
                onClick={() => setCapturingFor(s)}
                className="shrink-0 rounded-lg bg-[var(--color-navy)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                🎙️ Capture
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-5 py-8 text-center text-sm text-[var(--color-ink-muted)]">
              No students match &ldquo;{query}&rdquo;.
            </li>
          )}
        </ul>
      </div>

      {capturingFor && (
        <CaptureModal
          studentId={capturingFor.id}
          studentName={capturingFor.name}
          defaultAuthor=""
          onClose={() => setCapturingFor(null)}
        />
      )}
    </div>
  );
}
