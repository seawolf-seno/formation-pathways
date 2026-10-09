import Link from "next/link";
import type { ClassReflection, ReflectionClass } from "@/lib/sor/class-reflections";
import { KIND_HEADINGS, type ClassResources } from "@/lib/sor/study-library";

export interface StudyHubClass extends ReflectionClass {
  /** The shared library's resources for this class, if its subject is there. */
  shared: ClassResources | null;
  /** What the student said they enjoy about it, if they chose it. */
  reflection?: ClassReflection;
}

/**
 * The Study Hub screen: each of a student's classes with its shared study
 * resources and what they said they enjoy about it. Read-only, and with no
 * staff navigation: it's opened by an adult and explored with the student.
 */
export function StudyHub({
  personId,
  firstName,
  isSample,
  classes,
  canReflect,
}: {
  personId: string;
  firstName: string;
  isSample: boolean;
  classes: StudyHubClass[];
  /** Student-voice consent is on file, so class reflections can be saved. */
  canReflect: boolean;
}) {
  const year = classes[0]?.schoolYear ?? null;
  const reflected = classes.some((c) => c.reflection);
  // Classes with something to open come first; the rest keep their order.
  const rows = [...classes].sort((a, b) => Number(Boolean(b.shared)) - Number(Boolean(a.shared)));

  return (
    <main className="min-h-dvh bg-[var(--color-canvas)] px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[var(--color-gold)]">Study Hub</p>
          {isSample && (
            <span className="rounded bg-[var(--color-gold-light)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-navy-ink)]">
              Fictional sample
            </span>
          )}
        </div>
        <h1 className="font-display text-3xl leading-tight text-[var(--color-navy-ink)]">{firstName}&apos;s classes</h1>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
          {year ? `${year}. ` : ""}Free study material for each class you&apos;re taking, in one place.
        </p>

        {canReflect && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-gold)] bg-[var(--color-gold-light)] px-4 py-3">
            <p className="text-sm text-[var(--color-navy-ink)]">
              {reflected ? "Has anything changed about which classes you enjoy?" : "Which of these do you actually enjoy, and why?"}
            </p>
            <Link href={`/pathway/${personId}/classes`} className="rounded-lg bg-[var(--color-navy)] px-3 py-2 text-sm font-medium text-white">
              {reflected ? "Update what you enjoy" : "Tell us what you enjoy"}
            </Link>
          </div>
        )}

        <ul className="mt-6 space-y-3">
          {rows.map((c) => (
            <li key={c.key} className="rounded-xl border border-[var(--color-border)] bg-white">
              <details open={Boolean(c.shared)} className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                  <span aria-hidden="true" className="text-lg leading-none text-[var(--color-ink-muted)] transition-transform group-open:rotate-90">›</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-lg text-[var(--color-navy-ink)]">{c.title}</span>
                    <span className="block text-xs text-[var(--color-ink-muted)]">
                      {c.shared ? `${c.shared.count} ${c.shared.count === 1 ? "resource" : "resources"} · ${c.shared.subject.name}` : "Nothing shared for this class yet"}
                    </span>
                  </span>
                  {c.reflection && (
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold text-[var(--color-navy-ink)] ${c.reflection.loved ? "bg-[var(--color-gold-light)]" : "bg-[var(--color-pacific-light)]"}`}>
                      {c.reflection.loved ? "You love this one ✦" : "You enjoy this one"}
                    </span>
                  )}
                </summary>
                <div className="space-y-4 border-t border-[var(--color-border)] px-4 py-4 text-sm">
                  {c.reflection && (c.reflection.liked.length > 0 || c.reflection.note) && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]">What you said makes it good</p>
                      {c.reflection.liked.length > 0 && (
                        <p className="mt-1.5">
                          {c.reflection.liked.map((l) => (
                            <span key={l} className="mb-1 mr-1 inline-block rounded-full bg-[var(--color-canvas)] px-2.5 py-1 text-xs">{l}</span>
                          ))}
                        </p>
                      )}
                      {c.reflection.note && <p className="mt-1.5 italic text-[var(--color-ink)]">&ldquo;{c.reflection.note}&rdquo;</p>}
                    </div>
                  )}
                  {c.shared ? (
                    c.shared.byKind.map((g) => (
                      <div key={g.kind}>
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]">{KIND_HEADINGS[g.kind]}</p>
                        <ul className="mt-1.5 divide-y divide-[var(--color-border)]">
                          {g.resources.map((r) => (
                            <li key={r.url + r.title} className="py-2">
                              <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-medium text-[var(--color-navy)] underline underline-offset-2">
                                {r.title}
                                <span className="sr-only"> (opens in a new tab)</span>
                              </a>
                              <p className="text-xs text-[var(--color-ink-muted)]">
                                {[r.group, r.source, r.rights].filter(Boolean).join(" · ")}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))
                  ) : (
                    <p className="text-[var(--color-ink-muted)]">
                      The shared library doesn&apos;t have anything for this class yet. Your teacher&apos;s own materials are in Canvas.
                    </p>
                  )}
                </div>
              </details>
            </li>
          ))}
        </ul>

        <p className="mt-8 text-xs text-[var(--color-ink-muted)]">
          Every link goes to a free public source; nothing is copied here, and each publisher&apos;s own terms apply. The library started
          from Study Commons, a Pacifica student&apos;s project.
        </p>
        <Link href={`/pilot/people/${personId}`} className="mt-3 inline-block text-xs text-[var(--color-ink-muted)] underline">
          Back to {firstName}&apos;s staff page
        </Link>
      </div>
    </main>
  );
}
