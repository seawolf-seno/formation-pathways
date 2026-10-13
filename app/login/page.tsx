import { LoginForm } from "@/components/sor/LoginForm";
import { isSorConfigured } from "@/lib/sor/supabase-server";

export const metadata = { robots: { index: false, follow: false } };

const ERRORS: Record<string, string> = {
  link: "That sign-in link expired or was already used. Request a new code below.",
  pending:
    "You're signed in. The pilot admin needs to approve your account before you can capture. You don't need to do anything else.",
  student:
    "You're signed in, but this looks like a student address, and Formation Pathways isn't open to student accounts yet. If your teacher uses the Mastery Hub, ask them to add your school address; if you're staff, or helping build it, the pilot admin can approve your account.",
  "no-student-account":
    "You're signed in, but your teacher hasn't set up your Mastery Hub sign-in yet. Ask them to add your school address.",
  "not-staff":
    "That account isn't on the Formation Pathways staff list. Sign in with your @pacificachristian.org address.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next = "/capture", error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-full max-w-sm flex-col justify-center px-6 py-16">
      <span className="mb-6 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-gold)] font-display font-semibold text-[var(--color-navy-ink)]">
        FP
      </span>
      <h1 className="font-display text-2xl text-[var(--color-navy-ink)]">Formation Pathways</h1>
      <p className="mb-6 mt-1 text-sm text-[var(--color-ink-muted)]">Staff and student sign-in · Pacifica Christian High School</p>
      {error && ERRORS[error] && (
        <p className="mb-4 rounded-xl bg-[var(--color-gold-light)] p-3 text-sm text-[var(--color-navy-ink)]">
          {ERRORS[error]}
        </p>
      )}
      {isSorConfigured() ? (
        <LoginForm next={next} google={process.env.GOOGLE_SIGNIN?.trim() === "on"} />
      ) : (
        <p className="text-sm text-[var(--color-ink-muted)]">
          Not configured yet: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see
          docs/system-of-record.md).
        </p>
      )}
    </main>
  );
}
