import Link from "next/link";
import { requireStaff } from "@/lib/sor/queries";
import { signOutAction } from "@/lib/sor/actions";

export default async function SorLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  const canAdmin = staff.role === "admin" || staff.role === "admissions";
  const viewOnly = staff.role === "viewer";
  return (
    <div className="flex min-h-full flex-col">
      <header className="bg-[var(--color-navy)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href={canAdmin ? "/pilot" : viewOnly ? "/pilot/samples" : "/capture"} className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-gold)] font-display text-sm font-semibold text-[var(--color-navy-ink)]">
              FP
            </span>
            <span className="hidden font-display text-lg text-white sm:inline">Formation Pathways</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/capture" className="font-medium text-[var(--color-pacific)] hover:text-white">
              Capture
            </Link>
            {viewOnly && (
              <Link href="/pilot/samples" className="font-medium text-[var(--color-pacific)] hover:text-white">
                Samples
              </Link>
            )}
            {canAdmin && (
              <Link href="/season" className="font-medium text-[var(--color-pacific)] hover:text-white">
                Season
              </Link>
            )}
            {canAdmin && (
              <Link href="/pilot" className="font-medium text-[var(--color-pacific)] hover:text-white">
                Pilot
              </Link>
            )}
            {(staff.role === "admin" || staff.role === "teacher" || viewOnly) && (
              <Link href="/pilot/resources" className="font-medium text-[var(--color-pacific)] hover:text-white">
                Resources
              </Link>
            )}
            <form action={signOutAction}>
              <button className="text-xs text-[var(--color-pacific)] hover:text-white" title={staff.email}>
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>
      {viewOnly && (
        <p className="bg-[var(--color-gold-light)] px-4 py-2 text-center text-sm text-[var(--color-navy-ink)]">
          View only. You see fictional sample students, and nothing you do here is saved or sent.
        </p>
      )}
      <main className="flex-1">{children}</main>
      <footer className="border-t border-[var(--color-border)] bg-white py-4">
        <div className="mx-auto max-w-5xl px-4 text-xs text-[var(--color-ink-muted)] sm:px-6">
          Consented pilot. Staff only. Every view and change is logged. AI drafts; people decide.
          Nothing here goes to a family.
          <br />
          Canvas import built on work by Levi Gibbons, used with permission from{" "}
          <a href="https://github.com/levihgibbons1/canvasnotifications" target="_blank" className="underline">
            github.com/levihgibbons1/canvasnotifications
          </a>
          .
        </div>
      </footer>
    </div>
  );
}
