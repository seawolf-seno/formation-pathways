"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCourseAction } from "@/lib/actions";
import type { StudentWithStats } from "@/lib/types";

export function NewCourseForm({ students }: { students: StudentWithStats[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pending, startTransition] = useTransition();

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedTeacher = teacherName.trim();
    if (!trimmedName || !trimmedTeacher) return;
    startTransition(async () => {
      const course = await createCourseAction(
        trimmedName,
        trimmedTeacher,
        Array.from(selected)
      );
      setName("");
      setTeacherName("");
      setSelected(new Set());
      setOpen(false);
      router.push(`/courses/${course.id}`);
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-[var(--color-navy)] px-4 py-2 text-sm font-medium text-white"
      >
        + New course
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-[var(--color-border)] bg-white p-5"
    >
      <div className="flex flex-wrap gap-3">
        <div>
          <label className="block text-xs text-[var(--color-ink-muted)]">
            Course name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Real Live-Sync Test"
            className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--color-ink-muted)]">
            Teacher name
          </label>
          <input
            value={teacherName}
            onChange={(e) => setTeacherName(e.target.value)}
            className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs text-[var(--color-ink-muted)]">
          Roster — pick which existing (fictional) students this course
          covers. A live Canvas sync will map real Canvas students onto
          these, in order, and discard the real names.
        </p>
        <div className="flex flex-wrap gap-2">
          {students.map((s) => (
            <label
              key={s.id}
              className={`cursor-pointer rounded-full border px-3 py-1 text-xs ${
                selected.has(s.id)
                  ? "border-[var(--color-navy)] bg-[var(--color-navy)] text-white"
                  : "border-[var(--color-border)] text-[var(--color-ink-muted)]"
              }`}
            >
              <input
                type="checkbox"
                checked={selected.has(s.id)}
                onChange={() => toggle(s.id)}
                className="hidden"
              />
              {s.name}
            </label>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending || !name.trim() || !teacherName.trim()}
          className="rounded-lg bg-[var(--color-navy)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {pending ? "Creating…" : "Create course"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-ink-muted)]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
