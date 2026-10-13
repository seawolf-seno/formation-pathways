"use client";

import { useState, useTransition } from "react";
import { reviewClassResourceAction } from "@/lib/sor/actions";
import type { ResourceStatus } from "@/lib/sor/class-resources";

const approve = "rounded-lg bg-[var(--color-navy)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50";
const quiet =
  "rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-medium text-[var(--color-navy-ink)] disabled:opacity-50";

/** Approve or decline a suggested link; a decision can be changed later. */
export function ReviewResourceButtons({ id, status }: { id: string; status: ResourceStatus }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const decide = (decision: "approved" | "declined") =>
    start(async () => {
      const res = await reviewClassResourceAction(id, decision);
      setError(res.ok ? null : res.error);
    });

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        {status !== "approved" && (
          <button type="button" className={approve} disabled={pending} onClick={() => decide("approved")}>
            {status === "declined" ? "Approve after all" : "Approve"}
          </button>
        )}
        {status !== "declined" && (
          <button type="button" className={quiet} disabled={pending} onClick={() => decide("declined")}>
            {status === "approved" ? "Take down" : "Decline"}
          </button>
        )}
      </div>
      {error && <p role="alert" className="max-w-[14rem] text-right text-xs text-red-700">{error}</p>}
    </div>
  );
}
