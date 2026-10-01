import Link from "next/link";
import { getClasses } from "@/lib/queries";
import { NewClassForm } from "@/components/NewClassForm";
import { syncDemoDb } from "@/lib/demo-persist";

export default async function ClassesPage() {
  await syncDemoDb();
  const classes = getClasses();

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl text-[var(--color-navy-ink)]">
            Classes
          </h1>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Switch between your class periods, or add a new one.
          </p>
        </div>
        <NewClassForm />
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
        <ul className="divide-y divide-[var(--color-border)]">
          {classes.map((c) => (
            <li key={c.id} className="px-5 py-4">
              <Link href={`/classes/${c.id}`}>
                <span className="font-display text-base text-[var(--color-navy-ink)]">
                  {c.name}
                </span>
                <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                  {c.student_count} student{c.student_count === 1 ? "" : "s"}
                </p>
              </Link>
            </li>
          ))}
          {classes.length === 0 && (
            <li className="px-5 py-8 text-center text-sm text-[var(--color-ink-muted)]">
              No classes yet — create one above.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
