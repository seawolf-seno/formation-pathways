"use client";

import { useState } from "react";
import { sendSignInLinkAction, signInWithGoogleAction, verifySignInCodeAction } from "@/lib/sor/actions";

const field = "w-full rounded-xl border border-[var(--color-border)] bg-white px-4 py-3 text-base";
const primary =
  "w-full rounded-xl bg-[var(--color-navy)] px-4 py-3 text-base font-medium text-white disabled:opacity-60";

// Two steps: email, then the 6-digit code from that email. The code works in
// whatever browser or home-screen app asked for it; the emailed link is a
// convenience for laptops.
export function LoginForm({ next, google = false }: { next: string; google?: boolean }) {
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(formData: FormData) {
    setBusy(true);
    setError(null);
    const res = await sendSignInLinkAction(formData);
    setBusy(false);
    if (res.ok) setEmail(String(formData.get("email")).trim().toLowerCase());
    else setError(res.error);
  }

  async function verify(formData: FormData) {
    setBusy(true);
    setError(null);
    // Redirects on success, so only a failure comes back.
    const res = await verifySignInCodeAction(formData);
    setBusy(false);
    if (!res.ok) setError(res.error);
  }

  if (email) {
    return (
      <form action={verify} className="space-y-3">
        <p className="text-sm text-[var(--color-ink)]">
          We emailed a code to <strong>{email}</strong>. Enter it here.
        </p>
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="next" value={next} />
        <input
          name="code"
          required
          autoFocus
          autoComplete="one-time-code"
          inputMode="numeric"
          pattern="[0-9 ]{6,12}"
          maxLength={12}
          placeholder="123456"
          className={`${field} text-center font-mono text-2xl tracking-[0.3em]`}
        />
        <button disabled={busy} className={primary}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button
          type="button"
          onClick={() => {
            setEmail(null);
            setError(null);
          }}
          className="w-full text-sm text-[var(--color-ink-muted)] underline"
        >
          Use a different email or send a new code
        </button>
      </form>
    );
  }

  async function withGoogle(formData: FormData) {
    setBusy(true);
    setError(null);
    // Redirects to Google on success, so only a failure comes back.
    const res = await signInWithGoogleAction(formData);
    setBusy(false);
    if (!res.ok) setError(res.error);
  }

  return (
    <div className="space-y-5">
      {google && (
        <form action={withGoogle} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          <button disabled={busy} className={primary}>
            Continue with Google (school account)
          </button>
          <p className="text-center text-xs text-[var(--color-ink-muted)]">or get a code by email</p>
        </form>
      )}
    <form action={sendCode} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      <input
        type="email"
        name="email"
        required
        autoComplete="email"
        inputMode="email"
        placeholder="you@pacificachristian.org"
        className={field}
      />
      <button disabled={busy} className={primary}>
        {busy ? "Sending…" : "Email me a sign-in code"}
      </button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </form>
    </div>
  );
}
