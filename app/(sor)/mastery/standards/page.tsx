import Link from "next/link";
import { requireMasteryTeacher, staffNames } from "@/lib/mastery/queries";
import { listStandardSets } from "@/lib/mastery/standard-sets";
import { NewStandardSetForm } from "@/components/mastery/NewStandardSetForm";

export const metadata = { title: "Standards · Mastery Hub", robots: { index: false, follow: false } };

/** Every subject's standards: the built-in files and the hub's own. */
export default async function StandardsHome() {
  await requireMasteryTeacher();
  const [sets, names] = await Promise.all([listStandardSets(), staffNames()]);
  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8 sm:px-6">
      <header>
        <Link href="/mastery" className="text-xs text-[var(--color-ink-muted)] underline">
          Mastery Hub
        </Link>
        <h1 className="mt-1 font-display text-3xl text-[var(--color-navy-ink)]">Standards</h1>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
          Each subject&apos;s units and standards, what the levels mean, and the links and videos students see. Any course can
          use any of these. Edit one and every course using it changes.
        </p>
      </header>
      <ul className="divide-y divide-[var(--color-border)] rounded-2xl border border-[var(--color-border)] bg-white">
        {sets.map((s) => (
          <li key={s.key} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <Link href={`/mastery/standards/${s.key}`} className="font-medium text-[var(--color-navy)] underline decoration-[var(--color-pacific)] underline-offset-2">
              {s.title}
            </Link>
            <span className="text-xs text-[var(--color-ink-muted)]">
              {s.problem
                ? `Needs fixing: ${s.problem}`
                : s.saved
                  ? `Edited in the hub${s.saved.updated_by ? ` by ${names.get(s.saved.updated_by) ?? "a teacher"}` : ""} · ${s.saved.updated_at.slice(0, 10)}`
                  : "Built-in, not edited yet"}
            </span>
          </li>
        ))}
      </ul>
      <section>
        <h2 className="mb-2 font-display text-xl text-[var(--color-navy-ink)]">A new subject</h2>
        <NewStandardSetForm />
      </section>
    </div>
  );
}
