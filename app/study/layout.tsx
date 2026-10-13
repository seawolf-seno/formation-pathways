import Link from "next/link";
import { requireStudent } from "@/lib/mastery/queries";
import { signOutAction } from "@/lib/sor/actions";

export const metadata = {
  title: "Study Hub · Pacifica Christian",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};

/** A signed-in student's own Study Hub (Fizzy #32): the same header as
 *  their mastery pages (/me), with none of the staff navigation. */
export default async function StudyLayout({ children }: { children: React.ReactNode }) {
  const student = await requireStudent();
  return (
    <div className="flex min-h-full flex-col bg-[var(--color-canvas)]">
      <header className="bg-[var(--color-navy)]">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/study" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-gold)] font-display text-sm font-semibold text-[var(--color-navy-ink)]">
              FP
            </span>
            <span className="font-display text-lg text-white">Study Hub</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/me" className="text-xs text-[var(--color-pacific)] hover:text-white">
              Your mastery
            </Link>
            <form action={signOutAction}>
              <button className="text-xs text-[var(--color-pacific)] hover:text-white" title={student.email}>
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
