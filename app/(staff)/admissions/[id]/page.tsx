import { notFound } from "next/navigation";
import Link from "next/link";
import { getApplicant } from "@/lib/queries";
import { PathwaysDisplay } from "@/components/PathwaysDisplay";
import { ApplicantAdminActions } from "@/components/ApplicantAdminActions";

export default async function ApplicantAdminPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const applicantId = Number(id);
  const applicant = Number.isFinite(applicantId)
    ? getApplicant(applicantId)
    : undefined;
  if (!applicant) notFound();

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <Link
        href="/admissions"
        className="mb-4 inline-block text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-navy-ink)]"
      >
        ← All applicants
      </Link>

      <div className="mb-6 rounded-xl border border-[var(--color-border)] bg-white p-5">
        <h1 className="font-display text-2xl text-[var(--color-navy-ink)]">
          {applicant.name}
        </h1>
        <p className="text-sm text-[var(--color-ink-muted)]">
          {applicant.grade ? `Grade ${applicant.grade} · ` : ""}status:{" "}
          {applicant.status}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div className="rounded-xl border border-[var(--color-border)] bg-white p-5">
            <h2 className="mb-3 font-display text-lg text-[var(--color-navy-ink)]">
              Their answers
            </h2>
            <dl className="space-y-4">
              {applicant.answers.map((a, i) => (
                <div key={i}>
                  <dt className="text-xs font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]">
                    {a.question}
                  </dt>
                  <dd className="mt-1 text-sm text-[var(--color-ink)]">
                    {a.answer || (
                      <span className="italic text-[var(--color-ink-muted)]">
                        no answer yet
                      </span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {applicant.generated && (
            <div>
              <h2 className="mb-3 font-display text-lg text-[var(--color-navy-ink)]">
                Generated Pathways
              </h2>
              <PathwaysDisplay
                applicantName={applicant.name}
                generated={applicant.generated}
              />
            </div>
          )}
        </div>

        <div>
          <ApplicantAdminActions applicant={applicant} />
        </div>
      </div>
    </div>
  );
}
