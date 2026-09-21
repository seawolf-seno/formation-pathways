import Link from "next/link";
import { cookies } from "next/headers";
import { getClasses, getStudentsWithStats } from "@/lib/queries";
import { ClassSwitcher } from "@/components/ClassSwitcher";
import { GlobalCaptureButton } from "@/components/GlobalCaptureButton";

export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const classes = getClasses();
  const students = getStudentsWithStats();
  const cookieStore = await cookies();
  const lastClassIdRaw = cookieStore.get("lastClassId")?.value;
  const initialClassId = lastClassIdRaw ? Number(lastClassIdRaw) : null;

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-navy)]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-gold)] font-display text-sm font-semibold text-[var(--color-navy-ink)]">
              FP
            </span>
            <span className="font-display text-lg tracking-wide text-white">
              Formation Pathways
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <GlobalCaptureButton students={students} />
            <ClassSwitcher classes={classes} initialClassId={initialClassId} />
            <Link
              href="/classes"
              className="text-xs font-medium text-[var(--color-pacific)] hover:text-white"
            >
              Manage classes
            </Link>
            <Link
              href="/admissions"
              className="text-xs font-medium text-[var(--color-pacific)] hover:text-white"
            >
              Admissions
            </Link>
            <Link
              href="/courses"
              className="text-xs font-medium text-[var(--color-pacific)] hover:text-white"
            >
              Courses
            </Link>
            <span className="hidden text-xs uppercase tracking-widest text-[var(--color-pacific)] sm:inline">
              Pacifica Christian High School
            </span>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-[var(--color-border)] bg-white py-4">
        <div className="mx-auto max-w-5xl px-6 text-xs text-[var(--color-ink-muted)]">
          Fictional demo data. AI drafts; people decide. No student is scored
          here.
          <br />
          Canvas integration built on work by Levi Gibbons — read with
          permission from{" "}
          <a
            href="https://github.com/levihgibbons1/canvasnotifications"
            target="_blank"
            className="underline hover:text-[var(--color-navy-ink)]"
          >
            github.com/levihgibbons1/canvasnotifications
          </a>
          .
        </div>
      </footer>
    </div>
  );
}
