"use client";

import { useEffect, useState } from "react";

/** Seconds since `pending` turned on (0 when idle). */
export function useElapsed(pending: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!pending) return;
    const started = Date.now();
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => {
      clearInterval(id);
      setSeconds(0);
    };
  }, [pending]);
  return seconds;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** What a staff member sees while a pathway draft runs (about two minutes). */
export function DraftWait({ seconds }: { seconds: number }) {
  return (
    <p className="mt-2 max-w-md text-xs text-[var(--color-ink-muted)]" aria-live="polite">
      <span className="font-semibold tabular-nums text-[var(--color-navy-ink)]">{clock(seconds)}</span>{" "}
      {seconds < 150
        ? "Writing six pathways usually takes about two minutes. Keep this page open."
        : "Taking longer than usual. It stops by itself at about four minutes and saves a simple offline draft instead."}
    </p>
  );
}

/** Shown when the request itself failed (dropped connection, function limit). */
export const DRAFT_LOST =
  "The connection dropped before the draft came back. Refresh this page in a minute: if it finished, the draft will be there. If not, try again.";
