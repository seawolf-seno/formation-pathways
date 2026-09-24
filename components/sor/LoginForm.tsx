"use client";

import { useState } from "react";
import { sendSignInLinkAction } from "@/lib/sor/actions";

export function LoginForm({ next }: { next: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(formData: FormData) {
    setState("sending");
    setError(null);
    const res = await sendSignInLinkAction(formData);
    if (res.ok) setState("sent");
    else {
      setError(res.error);
      setState("idle");
    }
  }

  if (state === "sent") {
    return (
      <p className="rounded-xl bg-[var(--color-pacific-light)] p-4 text-sm text-[var(--color-navy-ink)]">
        Check your school email for a sign-in link. You can close this tab.
      </p>
    );
  }

  return (
    <form action={submit} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      <input
        type="email"
        name="email"
        required
        autoComplete="email"
        inputMode="email"
        placeholder="you@pacificachristian.org"
        className="w-full rounded-xl border border-[var(--color-border)] bg-white px-4 py-3 text-base"
      />
      <button
        disabled={state === "sending"}
        className="w-full rounded-xl bg-[var(--color-navy)] px-4 py-3 text-base font-medium text-white disabled:opacity-60"
      >
        {state === "sending" ? "Sending…" : "Email me a sign-in link"}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </form>
  );
}
