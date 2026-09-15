"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createStudentAction,
  enrollStudentAction,
  unenrollStudentAction,
} from "@/lib/actions";
import type { StudentWithStats } from "@/lib/types";

const GRADES = [6, 7, 8, 9, 10, 11, 12];

export function EnrollmentManager({
  classId,
  roster,
  allStudents,
}: {
  classId: number;
  roster: StudentWithStats[];
  allStudents: StudentWithStats[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [newGrade, setNewGrade] = useState("9");

  const enrolledIds = useMemo(
    () => new Set(roster.map((s) => s.id)),
    [roster]
  );
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return allStudents
      .filter((s) => !enrolledIds.has(s.id))
      .filter((s) => s.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [allStudents, enrolledIds, query]);

  function handleEnroll(studentId: number) {
    startTransition(async () => {
      await enrollStudentAction(classId, studentId);
      setQuery("");
      router.refresh();
    });
  }

  function handleUnenroll(studentId: number) {
    startTransition(async () => {
      await unenrollStudentAction(classId, studentId);
      router.refresh();
    });
  }

  function handleCreateAndEnroll(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newName.trim();
    const grade = Number(newGrade);
    if (!trimmed) return;
    startTransition(async () => {
      const student = await createStudentAction(trimmed, grade);
      await enrollStudentAction(classId, student.id);
      setNewName("");
      router.refresh();
    });
  }

  return (
    <div className="mt-4 space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
          Add an existing student
        </label>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name…"
          className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:border-[var(--color-pacific)] focus:outline-none sm:w-72"
        />
        {query.trim() && (
          <ul className="mt-2 divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-white">
            {candidates.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between px-3 py-2 text-sm"
              >
                <span>
                  {s.name} · Grade {s.grade}
                </span>
                <button
                  onClick={() => handleEnroll(s.id)}
                  disabled={pending}
                  className="rounded-lg bg-[var(--color-navy)] px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40"
                >
                  Add
                </button>
              </li>
            ))}
            {candidates.length === 0 && (
              <li className="px-3 py-2 text-sm text-[var(--color-ink-muted)]">
                No match.
              </li>
            )}
          </ul>
        )}
      </div>

      <form
        onSubmit={handleCreateAndEnroll}
        className="flex flex-wrap items-end gap-2"
      >
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
            New student
          </label>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Full name"
            className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:border-[var(--color-pacific)] focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
            Grade
          </label>
          <select
            value={newGrade}
            onChange={(e) => setNewGrade(e.target.value)}
            className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm focus:border-[var(--color-pacific)] focus:outline-none"
          >
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={pending || !newName.trim()}
          className="rounded-lg bg-[var(--color-gold)] px-3 py-2 text-sm font-medium text-[var(--color-navy-ink)] disabled:opacity-40"
        >
          Add to class
        </button>
      </form>

      {roster.length > 0 && (
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
            Remove from class
          </label>
          <div className="flex flex-wrap gap-2">
            {roster.map((s) => (
              <button
                key={s.id}
                onClick={() => handleUnenroll(s.id)}
                disabled={pending}
                title="Remove from this class"
                className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-ink-muted)] hover:border-red-300 hover:text-red-600 disabled:opacity-40"
              >
                {s.name} ✕
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
