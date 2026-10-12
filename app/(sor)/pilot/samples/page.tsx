import Link from "next/link";
import { redirect } from "next/navigation";
import { getRoster, requireStaff } from "@/lib/sor/queries";
import { displayName } from "@/lib/sor/types";

export const metadata = { title: "Sample students · Formation Pathways" };

/**
 * Where a view-only account starts: the fictional sample students, each
 * linking to the same page staff use, so someone checking that the pages still
 * work has a way in. RLS returns only samples to a viewer, so this list can't
 * show a real student. Everyone else has /pilot or /capture.
 */
export default async function SamplesPage() {
  const staff = await requireStaff();
  if (staff.role !== "viewer") redirect(staff.role === "admin" || staff.role === "admissions" ? "/pilot" : "/capture");
  const samples = (await getRoster()).filter((p) => p.is_sample);

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-8 sm:px-6">
      <div>
        <h1 className="font-display text-2xl text-[var(--color-navy-ink)]">Sample students</h1>
        <p className="text-sm text-[var(--color-ink-muted)]">
          Fictional students for checking that the pages work. Open one to see what staff see. Saving is
          switched off for this account.
        </p>
      </div>
      <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
        {samples.length === 0 ? (
          <p className="p-5 text-sm text-[var(--color-ink-muted)]">
            No sample students are loaded. An admin can load them on the Pilot page.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {samples.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <Link href={`/pilot/people/${p.id}`} className="font-medium text-[var(--color-navy-ink)] underline">
                  {displayName(p)}
                </Link>
                <span className="flex flex-wrap items-center gap-3 text-xs">
                  <Link href={`/pathway/${p.id}/study`} className="underline">Study Hub</Link>
                  <Link href={`/pathway/${p.id}/classes`} className="underline">Classes they enjoy</Link>
                  <Link href={`/pathway/${p.id}/spark`} className="underline">Spark</Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
