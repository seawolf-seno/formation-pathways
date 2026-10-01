import { notFound } from "next/navigation";
import { getApplicantByToken, getSharesForApplicant } from "@/lib/queries";
import { FamilyPathways } from "@/components/FamilyPathways";
import { syncDemoDb } from "@/lib/demo-persist";

export const metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};

function extractToken(slugToken: string): string {
  const lastDash = slugToken.lastIndexOf("-");
  return lastDash === -1 ? slugToken : slugToken.slice(lastDash + 1);
}

export default async function ApplicantPathwayPage({
  params,
}: {
  params: Promise<{ slugToken: string }>;
}) {
  await syncDemoDb();
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
          Our admissions team is still preparing this page for{" "}
          {applicant.name.split(" ")[0]}.
        </p>
        <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
          Check back soon.
        </p>
      </div>
    );
  }

  return (
    <FamilyPathways
      name={applicant.name}
      token={applicant.token}
      pathways={applicant.generated.pathways}
      existing={getSharesForApplicant(applicant.id).map((share) => ({
        token: share.token,
        content: share.content,
      }))}
    />
  );
}
