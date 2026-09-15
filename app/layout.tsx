import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Inter, Lora } from "next/font/google";
import { getClasses, getStudentsWithStats } from "@/lib/queries";
import { ClassSwitcher } from "@/components/ClassSwitcher";
import { GlobalCaptureButton } from "@/components/GlobalCaptureButton";
import "./globals.css";

const sans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const display = Lora({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Formation Pathways — Pacifica Christian",
  description:
    "Capture formation moments. Draft a Pathway. Keep AI behind the scenes.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const classes = getClasses();
  const students = getStudentsWithStats();
  const cookieStore = await cookies();
  const lastClassIdRaw = cookieStore.get("lastClassId")?.value;
  const initialClassId = lastClassIdRaw ? Number(lastClassIdRaw) : null;

  return (
    <html lang="en" className={`${sans.variable} ${display.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-[var(--color-canvas)] text-[var(--color-ink)] antialiased">
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
              <ClassSwitcher
                classes={classes}
                initialClassId={initialClassId}
              />
              <Link
                href="/classes"
                className="text-xs font-medium text-[var(--color-pacific)] hover:text-white"
              >
                Manage classes
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
            Fictional demo data. AI drafts; people decide. No student is scored here.
          </div>
        </footer>
      </body>
    </html>
  );
}
