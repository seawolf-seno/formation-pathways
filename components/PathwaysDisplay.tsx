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
          <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink)]">
            {pathway.firstSemester}
          </p>
          <dl className="mt-4 space-y-3 border-t border-[var(--color-border)] pt-4 text-sm">
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
