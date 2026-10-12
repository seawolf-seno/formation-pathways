"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { discardNextStepsAction, draftNextStepsAction, saveNextStepsAction, shareNextStepsAction } from "@/lib/mastery/actions";
import type { DraftStep } from "@/lib/mastery/next-steps";
import { button, field, quiet } from "./TeacherTools";

export interface PanelSteps {
  id: string;
  steps: DraftStep[];
  usedAi: boolean;
  status: "draft" | "shared";
  sharedBy: string | null;
  sharedAt: string | null;
}

/**
 * The teacher's next steps for one student. A draft (from Claude when
 * allowed, otherwise the rules) is labeled Draft and only the teacher sees it;
 * they edit it and share it, and then the student sees it with the teacher's
 * name. A shared one is read-only; draft again for new ones.
 */
export function NextStepsPanel({
  courseId,
  personId,
  firstName,
  saved,
  titles,
  aiNote,
}: {
  courseId: string;
  personId: string;
  firstName: string;
  saved: PanelSteps | null;
  titles: Record<string, string>;
  aiNote: string;
}) {
  const [steps, setSteps] = useState<DraftStep[]>(saved?.status === "draft" ? saved.steps : []);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) setError((res as { error: string }).error);
      router.refresh();
    });
  const draft = saved?.status === "draft" ? saved : null;

  return (
    <section className="rounded-2xl border-2 border-dashed border-[var(--color-gold)] bg-[var(--color-gold-light)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg text-[var(--color-navy-ink)]">Next steps from you</h2>
          <p className="text-xs text-[var(--color-ink-muted)]">{aiNote}</p>
        </div>
        {draft && <span className="rounded bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-navy-ink)]">Draft · {draft.usedAi ? "AI" : "from the rules"}</span>}
      </div>

      {saved?.status === "shared" && (
        <div className="mt-3 rounded-xl bg-white p-3 text-sm">
          <p className="text-xs text-[var(--color-ink-muted)]">
            Shared with {firstName} by {saved.sharedBy} on {saved.sharedAt?.slice(0, 10)}:
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            {saved.steps.map((s, i) => (
              <li key={i}>
                <span className="text-xs text-[var(--color-ink-muted)]">{titles[s.standard] ?? s.standard}: </span>
                {s.text}
              </li>
            ))}
          </ol>
        </div>
      )}

      {draft ? (
        <div className="mt-3 space-y-3">
          {steps.map((s, i) => (
            <div key={i} className="rounded-xl bg-white p-3">
              <p className="text-xs text-[var(--color-ink-muted)]">
                {s.standard} · {titles[s.standard] ?? ""}
              </p>
              <textarea
                value={s.text}
                onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                rows={3}
                maxLength={600}
                className={`${field} mt-1`}
              />
              {s.links.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-xs">
                  {s.links.map((l) => (
                    <li key={l.url}>
                      <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-[var(--color-navy)] underline">
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              <button onClick={() => setSteps(steps.filter((_, j) => j !== i))} className="mt-1 text-xs text-[var(--color-ink-muted)] underline">
                Remove this step
              </button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button
              disabled={pending}
              className={button}
              onClick={() =>
                run(async () => {
                  const saved = await saveNextStepsAction(draft.id, steps);
                  return saved.ok ? shareNextStepsAction(draft.id) : saved;
                })
              }
            >
              {pending ? "Working…" : `Share with ${firstName}`}
            </button>
            <button disabled={pending} className={quiet} onClick={() => run(() => saveNextStepsAction(draft.id, steps))}>
              Save edits
            </button>
            <button disabled={pending} className="text-sm text-[var(--color-ink-muted)] underline" onClick={() => run(() => discardNextStepsAction(draft.id))}>
              Discard
            </button>
          </div>
        </div>
      ) : (
        <button disabled={pending} className={`${button} mt-3`} onClick={() => run(() => draftNextStepsAction(courseId, personId))}>
          {pending ? "Drafting…" : saved ? "Draft new next steps" : "Draft next steps"}
        </button>
      )}
      {error && <p className="mt-2 text-sm text-[var(--color-navy-ink)]">{error}</p>}
    </section>
  );
}

/** What the student sees: their teacher's shared next steps, signed. */
export function SharedSteps({ steps, sharedBy, titles }: { steps: DraftStep[]; sharedBy: string | null; titles: Record<string, string> }) {
  return (
    <section className="rounded-2xl border border-[var(--color-pacific)] bg-[var(--color-pacific-light)] p-4">
      <h2 className="font-display text-xl text-[var(--color-navy-ink)]">From {sharedBy ?? "your teacher"}</h2>
      <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-[var(--color-ink)]">
        {steps.map((s, i) => (
          <li key={i}>
            <span className="text-xs text-[var(--color-ink-muted)]">{titles[s.standard] ?? s.standard}</span>
            <p>{s.text}</p>
            {s.links.length > 0 && (
              <p className="mt-0.5 space-x-3 text-xs">
                {s.links.map((l) => (
                  <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="text-[var(--color-navy)] underline">
                    {l.label}
                  </a>
                ))}
              </p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
