import { notFound } from "next/navigation";
import { getApplicantByToken } from "@/lib/queries";
import { PathwaysDisplay } from "@/components/PathwaysDisplay";

function extractToken(slugToken: string): string {
  const lastDash = slugToken.lastIndexOf("-");
  return lastDash === -1 ? slugToken : slugToken.slice(lastDash + 1);
}

export default async function ApplicantPathwayPage({
  params,
}: {
  params: Promise<{ slugToken: string }>;
}) {
  const { slugToken } = await params;
  const applicant = getApplicantByToken(extractToken(slugToken));
  if (!applicant) notFound();

  if (applicant.status === "in_progress" || !applicant.generated) {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <p className="font-display text-xl text-[var(--color-navy-ink)]">
          This page isn&apos;t ready yet.
        </p>
      </div>
    );
  }

  if (applicant.status === "submitted") {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <p className="font-display text-xl text-[var(--color-navy-ink)]">
          Our admissions team is still preparing this page for {applicant.name.split(" ")[0]}.
        </p>
        <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
          Check back soon.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[var(--color-canvas)] px-6 py-16 print:bg-white">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-center justify-between">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-gold)] font-display text-sm font-semibold text-[var(--color-navy-ink)]">
            FP
          </span>
          <span className="rounded-full bg-[var(--color-gold-light)] px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-navy-ink)] print:hidden">
            Demo data — fictional applicant
          </span>
        </div>
        <h1 className="font-display text-4xl text-[var(--color-navy-ink)]">
          {applicant.name}&apos;s Pathways
        </h1>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
          Three ways your next four years at Pacifica Christian could unfold —
          built from what you told us.
        </p>
        <div className="mt-10">
          <PathwaysDisplay
            applicantName={applicant.name}
            generated={applicant.generated}
          />
        </div>
      </div>
    </div>
  );
}
