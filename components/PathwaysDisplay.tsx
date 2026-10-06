import type { GeneratedPathwaysResult } from "@/lib/types";

export function PathwaysDisplay({
  applicantName,
  generated,
}: {
  applicantName: string;
  generated: GeneratedPathwaysResult;
}) {
  return (
    <div className="space-y-6">
      {generated.pathways.map((pathway, i) => (
        <div
          key={i}
          className="rounded-2xl border border-[var(--color-border)] bg-white p-6"
        >
          <h3 className="font-display text-xl text-[var(--color-navy-ink)]">
            {pathway.name}
          </h3>
          {pathway.hook && (
            <p className="mt-1 text-sm italic text-[var(--color-ink-muted)]">
              Grows from: “{pathway.hook.replace(/^["“]|["”]$/g, "")}”
            </p>
          )}
          <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink)]">
            {pathway.firstSemester}
          </p>
          {pathway.milestones && pathway.milestones.length > 0 && (
            <ol className="mt-4 grid gap-2 sm:grid-cols-2">
              {pathway.milestones.map((m, j) => (
                <li
                  key={j}
                  className="rounded-xl border-l-2 border-[var(--color-gold)] bg-[var(--color-canvas)] px-3 py-2 text-sm"
                >
                  <span className="block text-[10px] font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]">
                    {m.when}
                  </span>
                  <span className="font-medium text-[var(--color-navy-ink)]">{m.title}</span>
                  <span className="block text-[var(--color-ink)]">{m.detail}</span>
                </li>
              ))}
            </ol>
          )}
          {pathway.glimpse && (
            <blockquote className="mt-4 rounded-xl bg-[var(--color-navy)] px-4 py-3 font-display text-sm italic leading-relaxed text-white">
              <span className="mb-1 block font-sans text-[10px] font-semibold not-italic uppercase tracking-widest text-[var(--color-gold)]">
                A glimpse
              </span>
              {pathway.glimpse}
            </blockquote>
          )}
          <dl className="mt-4 space-y-3 border-t border-[var(--color-border)] pt-4 text-sm">
            {pathway.whyNow && pathway.whyNowSource && (
              <div>
                <dt className="text-xs font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]">
                  Why now
                </dt>
                <dd className="mt-1 text-[var(--color-ink)]">
                  {pathway.whyNow}{" "}
                  <span className="text-xs text-[var(--color-ink-muted)]">({pathway.whyNowSource})</span>
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]">
                Mentor
              </dt>
              <dd className="mt-1 text-[var(--color-ink)]">
                {pathway.mentorArchetype}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]">
                A stretch challenge
              </dt>
              <dd className="mt-1 text-[var(--color-ink)]">
                {pathway.stretchChallenge}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]">
                Four-year horizon
              </dt>
              <dd className="mt-1 text-[var(--color-ink)]">
                <ul className="list-disc space-y-1 pl-4">
                  {pathway.fourYearHorizon.map((route, j) => (
                    <li key={j}>{route}</li>
                  ))}
                </ul>
              </dd>
            </div>
          </dl>
        </div>
      ))}
      <p className="text-center font-display text-base italic text-[var(--color-navy-ink)]">
        These aren&apos;t predictions. They&apos;re invitations. The real pathway
        will be written by {applicantName.split(" ")[0]} — witnessed, one
        moment at a time.
      </p>
    </div>
  );
}
