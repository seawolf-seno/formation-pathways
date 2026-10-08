"use client";

import { useEffect, useState } from "react";
import { SeawolfSurf } from "./SeawolfSurf";

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

const about = (s: number) => (s <= 60 ? `under a minute` : `about ${Math.round(s / 60)} minutes`);

/** What a staff member sees while a pathway draft runs: the seawolf, a
 *  clock, and an honest estimate (PATHWAY_PLAN[audience].expectSeconds). */
export function DraftWait({ seconds, expectSeconds }: { seconds: number; expectSeconds: number }) {
  return (
    <div className="mt-3 flex max-w-md items-center gap-3" aria-live="polite">
      <SeawolfSurf />
      <p className="text-xs text-[var(--color-ink-muted)]">
        <span className="font-semibold tabular-nums text-[var(--color-navy-ink)]">{clock(seconds)}</span>{" "}
        {seconds < expectSeconds * 1.5
          ? `This usually takes ${about(expectSeconds)}. Keep this page open.`
          : "Taking longer than usual. It stops by itself at about four minutes and saves a simple offline draft instead."}
      </p>
    </div>
  );
}

/** Shown when the request itself failed (dropped connection, function limit). */
export const DRAFT_LOST =
  "The connection dropped before the draft came back. Refresh this page in a minute: if it finished, the draft will be there. If not, try again.";
