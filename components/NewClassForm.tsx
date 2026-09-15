"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClassAction } from "@/lib/actions";

export function NewClassForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    startTransition(async () => {
      await createClassAction(trimmed);
      setName("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New class name…"
        className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm focus:border-[var(--color-pacific)] focus:outline-none"
      />
      <button
        type="submit"
        disabled={pending || !name.trim()}
        className="shrink-0 rounded-lg bg-[var(--color-navy)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
      >
        {pending ? "Creating…" : "New class"}
      </button>
    </form>
  );
}
