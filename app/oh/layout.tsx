// Open House pages (Fizzy #38): public, phone first, nothing but the task.
export const metadata = { robots: { index: false, follow: false } };

export default function OhLayout({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto min-h-dvh max-w-md bg-[var(--color-canvas)] px-5 py-8">{children}</main>;
}
