"use client";

import { useMemo, useState } from "react";
import type { StudentWithStats } from "@/lib/types";
import { CaptureModal } from "./CaptureModal";

export function GlobalCaptureButton({
  students,
}: {
  students: StudentWithStats[];
}) {
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const [capturingFor, setCapturingFor] = useState<StudentWithStats | null>(
    null
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q
      ? students.filter((s) => s.name.toLowerCase().includes(q))
      : students;
    return pool.slice(0, 8);
  }, [students, query]);

  function openPicker() {
    setQuery("");
    setPicking(true);
  }

  function choose(student: StudentWithStats) {
    setPicking(false);
    setCapturingFor(student);
  }

  return (
    <>
      <button
        onClick={openPicker}
        className="shrink-0 rounded-lg bg-[var(--color-gold)] px-3 py-1.5 text-sm font-medium text-[var(--color-navy-ink)] hover:opacity-90"
      >
        🎙️ Quick capture
      </button>

      {picking && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-24"
          onClick={() => setPicking(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-2 text-xs uppercase tracking-widest text-[var(--color-ink-muted)]">
              Capture a moment for…
            </p>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search any student by name…"
              className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:border-[var(--color-pacific)] focus:outline-none"
            />
            <ul className="mt-3 max-h-72 divide-y divide-[var(--color-border)] overflow-y-auto rounded-lg border border-[var(--color-border)]">
              {filtered.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => choose(s)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-[var(--color-canvas)]"
                  >
                    <span>{s.name}</span>
                    <span className="text-xs text-[var(--color-ink-muted)]">
                      Grade {s.grade}
                    </span>
                  </button>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="px-3 py-3 text-sm text-[var(--color-ink-muted)]">
                  No match.
                </li>
              )}
            </ul>
          </div>
        </div>
      )}

      {capturingFor && (
        <CaptureModal
          studentId={capturingFor.id}
          studentName={capturingFor.name}
          defaultAuthor=""
          onClose={() => setCapturingFor(null)}
        />
      )}
    </>
  );
}
