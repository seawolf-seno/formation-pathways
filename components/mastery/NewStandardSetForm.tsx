"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createStandardSetAction, restoreStandardSetAction } from "@/lib/mastery/standards-actions";
import { button, field, quiet } from "./TeacherTools";

export function NewStandardSetForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      action={(fd) =>
        start(async () => {
          setError(null);
          const res = await createStandardSetAction(fd);
          if (res && !res.ok) setError(res.error);
        })
      }
      className="grid gap-2 sm:grid-cols-[1fr_12rem_10rem_auto]"
    >
      <input name="title" required maxLength={120} placeholder="Subject (e.g. Honors Chemistry)" className={field} />
      <input name="key" maxLength={60} placeholder="key (optional)" className={field} />
      <input name="slug" maxLength={40} placeholder="Address (optional)" className={field} />
      <button disabled={pending} className={button}>
        {pending ? "Creating…" : "Create"}
      </button>
      {error && <p className="text-sm text-[var(--color-navy-ink)] sm:col-span-4">{error}</p>}
      <p className="text-xs text-[var(--color-ink-muted)] sm:col-span-4">
        Starts with one unit and the usual four levels; add units, standards, links and videos next.
      </p>
    </form>
  );
}

export function RestoreVersion({ standardKey, versionId }: { standardKey: string; versionId: number }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <>
      <button
        disabled={pending}
        className={quiet}
        onClick={() =>
          start(async () => {
            const res = await restoreStandardSetAction(standardKey, versionId);
            if (!res.ok) setError(res.error);
            else router.refresh();
          })
        }
      >
        {pending ? "Restoring…" : "Put this version back"}
      </button>
      {error && <span className="text-xs">{error}</span>}
    </>
  );
}
