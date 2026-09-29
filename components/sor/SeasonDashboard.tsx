import Link from "next/link";
import { rate, type Counts, type SeasonSummary, type SeasonView } from "@/lib/sor/funnel";
import { SeasonPace } from "./SeasonPace";

/** The Admissions season dashboard body: everything below the page header
 *  and above the admin data-source panels. Pure presentation over a
 *  SeasonView, so it renders the same for sample and live counts. */
const num = (n: number | null) => (n == null ? "<5" : n.toLocaleString());
const pct = (r: number | null) => (r == null ? "—" : `${Math.round(r * 100)}%`);
const longDate = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });

function Delta({ now, then, label }: { now: number | null; then: number | null; label: string }) {
  if (now == null || then == null) return <p className="mt-1 text-xs text-[var(--color-ink-muted)]">{label}: —</p>;
  const diff = now - then;
  // A percentage on a small base (7 vs. 5 = "+40%") is noise that looks like news.
  const share = then >= 20 ? Math.round((diff / then) * 100) : null;
  return (
    <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
      {diff === 0 ? "Level with" : diff > 0 ? `▲ ${diff.toLocaleString()} ahead of` : `▼ ${(-diff).toLocaleString()} behind`}{" "}
      {label}
      {share != null && diff !== 0 ? ` (${diff > 0 ? "+" : ""}${share}%)` : ""}
    </p>
  );
}

const TILES: { stage: keyof Counts; label: string; empty: string }[] = [
  { stage: "inquiry", label: "Inquiries", empty: "" },
  { stage: "application", label: "Applications", empty: "Most arrive December–January" },
  { stage: "admitted", label: "Admitted", empty: "Decisions go out in March" },
  { stage: "enrolled", label: "Enrolled", empty: "Deposits come in by April" },
];

export function SeasonDashboard({ view, today, isAdmin }: { view: SeasonView | null; today: string; isAdmin: boolean }) {
  const last: SeasonSummary | undefined = view?.prior[0];
  return (
    <>
      {!view ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-6 text-sm text-[var(--color-ink-muted)]">
          No season counts yet. {isAdmin ? "Load the sample figures below to see the dashboard." : "Ask an admin to load them."}
        </div>
      ) : (
        <>
          <section>
            <h2 className="mb-3 font-display text-lg text-[var(--color-navy-ink)]">So far this season, as of {longDate(today)}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {TILES.map(({ stage, label, empty }) => {
                const now = view.current.toDate[stage];
                return (
                  <div key={stage} className="rounded-xl border border-[var(--color-border)] bg-white p-4">
                    <p className="text-sm text-[var(--color-ink-muted)]">{label}</p>
                    <p className="mt-1 text-3xl font-semibold text-[var(--color-navy-ink)]">
                      {now === 0 && empty ? "—" : num(now)}
                    </p>
                    {now === 0 && empty ? (
                      <p className="mt-1 text-xs text-[var(--color-ink-muted)]">{empty}</p>
                    ) : (
                      last && <Delta now={now} then={last.toDate[stage]} label={`${last.label} on this date`} />
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <SeasonPace view={view} />

          <section className="rounded-xl border border-[var(--color-border)] bg-white p-5">
            <h2 className="font-display text-lg text-[var(--color-navy-ink)]">Application rate on {longDate(today)}</h2>
            <p className="mb-4 text-xs text-[var(--color-ink-muted)]">
              Applications ÷ inquiries, each season at the same point. Early in a season this moves a lot, because most
              applications arrive just before the January deadline.
            </p>
            <ul className="space-y-2">
              {[view.current, ...view.prior].map((s) => {
                const r = rate(s.toDate.application, s.toDate.inquiry);
                return (
                  <li key={s.entryYear} className="grid grid-cols-[4.5rem_1fr_3rem] items-center gap-3 text-sm">
                    <span className={s.isCurrent ? "font-medium text-[var(--color-ink)]" : "text-[var(--color-ink-muted)]"}>{s.label}</span>
                    <span className="h-4 rounded-r bg-[var(--color-canvas)]" title={`${s.label}: ${pct(r)}`}>
                      <span
                        className="block h-full rounded-r"
                        style={{ width: `${Math.min(100, (r ?? 0) * 100)}%`, background: s.isCurrent ? "var(--color-navy)" : "#a3aeb9" }}
                      />
                    </span>
                    <span className="text-right tabular-nums text-[var(--color-ink)]">{pct(r)}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section>
            <h2 className="mb-3 font-display text-lg text-[var(--color-navy-ink)]">Season by season</h2>
            <div className="overflow-x-auto rounded-xl border border-[var(--color-border)] bg-white">
              <table className="w-full min-w-[40rem] text-sm tabular-nums">
                <thead className="text-left text-xs text-[var(--color-ink-muted)]">
                  <tr className="border-b border-[var(--color-border)]">
                    <th className="px-4 py-2 font-medium">Season</th>
                    <th className="px-4 py-2 text-right font-medium">Inquiries</th>
                    <th className="px-4 py-2 text-right font-medium">Applications</th>
                    <th className="px-4 py-2 text-right font-medium">Application rate</th>
                    <th className="px-4 py-2 text-right font-medium">Admitted</th>
                    <th className="px-4 py-2 text-right font-medium">Enrolled</th>
                    <th className="px-4 py-2 text-right font-medium">Yield</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {[view.current, ...view.prior].map((s) => {
                    const c = s.final ?? s.toDate;
                    return (
                      <tr key={s.entryYear}>
                        <td className="px-4 py-2 font-medium text-[var(--color-navy-ink)]">
                          {s.label}
                          <span className="ml-2 text-xs font-normal text-[var(--color-ink-muted)]">
                            {s.final ? "full season" : "to date"}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right">{num(c.inquiry)}</td>
                        <td className="px-4 py-2 text-right">{num(c.application)}</td>
                        <td className="px-4 py-2 text-right">{pct(rate(c.application, c.inquiry))}</td>
                        <td className="px-4 py-2 text-right">{num(c.admitted)}</td>
                        <td className="px-4 py-2 text-right">{num(c.enrolled)}</td>
                        <td className="px-4 py-2 text-right">{s.final ? pct(rate(c.enrolled, c.admitted)) : "spring"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
              Yield = enrolled ÷ admitted, known once deposits are in. &ldquo;&lt;5&rdquo; means a group too small to show.
            </p>
          </section>
        </>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-5">
          <h2 className="font-display text-lg text-[var(--color-navy-ink)]">What a family experiences</h2>
          <ol className="mt-3 space-y-2 text-sm text-[var(--color-ink)]">
            <li><span className="font-medium">1. Tell us about your child.</span> A short questionnaire, in the family&apos;s own words.</li>
            <li><span className="font-medium">2. Three possible pathways.</span> Named, specific stories of who they could become at Pacifica, each approved by an admissions staff member before the family sees it.</li>
            <li><span className="font-medium">3. Share an invitation.</span> The family picks one pathway and what to show, then shares a link or image. It&apos;s an invitation, not a prediction.</li>
          </ol>
          <Link
            href="/applicant/emma-r-8f3k2a"
            className="mt-4 inline-block rounded-lg bg-[var(--color-navy)] px-3 py-2 text-sm font-medium text-white"
          >
            Walk through it with a fictional family →
          </Link>
          <p className="mt-2 text-xs text-[var(--color-ink-muted)]">Not yet offered to real families.</p>
        </div>

        <div className="rounded-xl border border-[var(--color-border)] bg-white p-5">
          <h2 className="font-display text-lg text-[var(--color-navy-ink)]">How we&apos;ll know if pathways help</h2>
          <p className="mt-1 text-xs text-[var(--color-ink-muted)]">No result yet: families haven&apos;t used pathways. This is the plan.</p>
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="font-medium text-[var(--color-navy-ink)]">Yield</dt>
              <dd className="text-[var(--color-ink)]">
                Do admitted families who get a pathway enroll more often than comparable admitted families who don&apos;t
                yet? Fairest if leadership offers pathways to a random half of admitted families in the pilot season.
                Comparing with past seasons alone is weaker.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-[var(--color-navy-ink)]">New inquiries</dt>
              <dd className="text-[var(--color-ink)]">
                How many inquiries arrive through a shared pathway? Tag the card&apos;s &ldquo;Discover Pacifica&rdquo;
                link and record it as the inquiry source in Finalsite.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-[var(--color-navy-ink)]">When</dt>
              <dd className="text-[var(--color-ink)]">
                Inquiries from shared pathways weekly, once live. The first yield comparison after the April deposit deadline.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-[var(--color-navy-ink)]">First</dt>
              <dd className="text-[var(--color-ink)]">
                Leadership approval and family consent for the pathway pilot, parent access to their own page, and
                approved AI vendor terms.
              </dd>
            </div>
          </dl>
        </div>
      </section>

    </>
  );
}
