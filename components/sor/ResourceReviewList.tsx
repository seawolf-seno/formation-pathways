import Link from "next/link";
import type { ClassResource } from "@/lib/sor/class-resources";
import { displayName, type Person } from "@/lib/sor/types";
import { ReviewResourceButtons } from "./ResourceReview";

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");
const host = (url: string) => new URL(url).hostname.replace(/^www\./, "");

function Item({ r, who }: { r: ClassResource; who: Person | undefined }) {
  return (
    <li className="rounded-xl border border-[var(--color-border)] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]">{r.class_title} · {r.kind}</p>
          <a href={r.url} target="_blank" rel="noopener noreferrer" className="mt-1 block break-words font-medium text-[var(--color-navy)] underline underline-offset-2">
            {r.title}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          <p className="break-all text-xs text-[var(--color-ink-muted)]">{host(r.url)} · {r.url}</p>
          {r.note && <p className="mt-2 text-sm italic text-[var(--color-ink)]">&ldquo;{r.note}&rdquo;</p>}
          <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
            Suggested by{" "}
            {who ? <Link href={`/pilot/people/${who.id}`} className="underline">{displayName(who)}</Link> : "a student"}
            {who?.is_sample ? " (fictional sample)" : ""}, {day(r.created_at)}
            {r.status !== "pending" && r.reviewed_by_name ? ` · ${r.status} by ${r.reviewed_by_name}, ${day(r.reviewed_at)}` : ""}
          </p>
        </div>
        <div className="shrink-0"><ReviewResourceButtons id={r.id} status={r.status} /></div>
      </div>
    </li>
  );
}

/**
 * The review screen for links students suggested: what's waiting, and what
 * has been decided. Staff see who suggested each one; students never do.
 */
export function ResourceReviewList({
  ready,
  pending,
  decided,
  people,
}: {
  /** False until the class_resources migration is applied. */
  ready: boolean;
  pending: ClassResource[];
  decided: ClassResource[];
  people: Map<string, Person>;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-3xl text-[var(--color-navy-ink)]">Suggested resources</h1>
      <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
        Links students added for their classes on the Study Hub. Open each one before you approve it. An approved link shows to
        everyone taking a class with the same title, without the student&apos;s name.
      </p>

      {!ready ? (
        <p className="mt-6 rounded-xl border border-[var(--color-border)] bg-white p-4 text-sm text-[var(--color-ink-muted)]">
          Suggested resources aren&apos;t switched on yet. They arrive with the next database update.
        </p>
      ) : (
        <>
          <h2 className="mt-8 font-display text-lg text-[var(--color-navy-ink)]">Waiting for you ({pending.length})</h2>
          {pending.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--color-ink-muted)]">Nothing is waiting.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {pending.map((r) => (
                <Item key={r.id} r={r} who={people.get(r.person_id)} />
              ))}
            </ul>
          )}

          {decided.length > 0 && (
            <>
              <h2 className="mt-10 font-display text-lg text-[var(--color-navy-ink)]">Already decided</h2>
              <ul className="mt-3 space-y-3">
                {decided.map((r) => (
                  <Item key={r.id} r={r} who={people.get(r.person_id)} />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
