import Link from "next/link";
import { requireStudent } from "@/lib/mastery/queries";
import { studentStudyReady } from "@/lib/sor/student-study";
import { signOutAction } from "@/lib/sor/actions";

export const metadata = { title: "Your mastery · Pacifica Christian", robots: { index: false, follow: false } };

/** The student side of the Mastery Hub: a signed-in student's own pages,
 *  with none of the staff navigation. */
export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const student = await requireStudent();
  // Hidden until its migration (20261024000000) is applied.
  const studyHub = await studentStudyReady();
  return (
    <div className="flex min-h-full flex-col bg-[var(--color-canvas)]">
      <header className="bg-[var(--color-navy)]">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/me" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-gold)] font-display text-sm font-semibold text-[var(--color-navy-ink)]">
              FP
            </span>
            <span className="font-display text-lg text-white">Your mastery</span>
          </Link>
          <div className="flex items-center gap-4">
            {studyHub && (
              <Link href="/study" className="text-xs text-[var(--color-pacific)] hover:text-white">
                Study Hub
              </Link>
            )}
            <form action={signOutAction}>
              <button className="text-xs text-[var(--color-pacific)] hover:text-white" title={student.email}>
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-[var(--color-border)] bg-white py-4">
        <div className="mx-auto max-w-4xl px-4 text-xs text-[var(--color-ink-muted)] sm:px-6">
          Only you and your teacher see this page. Questions about a level? Ask your teacher: every level comes from evidence you
          can see here.
        </div>
      </footer>
    </div>
  );
}
