import Link from "next/link";
import { getApplicants } from "@/lib/queries";

const STATUS_LABEL: Record<string, string> = {
  in_progress: "In progress",
  submitted: "Awaiting review",
  approved: "Approved",
  enrolled: "Enrolled",
};

const STATUS_CLASS: Record<string, string> = {
  in_progress: "bg-[var(--color-border)] text-[var(--color-ink-muted)]",
  submitted: "bg-[var(--color-gold-light)] text-[var(--color-navy-ink)]",
  approved: "bg-[var(--color-pacific-light)] text-[var(--color-navy-ink)]",
  enrolled: "bg-[var(--color-navy)] text-white",
};

export default function AdmissionsPage() {
  const applicants = getApplicants();

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl text-[var(--color-navy-ink)]">
          Admissions
        </h1>
        <p className="text-sm text-[var(--color-ink-muted)]">
          Applicants who&apos;ve started or finished the Pathway questionnaire
          at <span className="font-mono text-xs">/apply</span>.
        </p>
        <Link
          href="/admissions/inquiries"
          className="mt-2 inline-block text-sm font-semibold text-[var(--color-navy)] underline"
        >
          Inquiries and prior-school outreach →
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
        <ul className="divide-y divide-[var(--color-border)]">
          {applicants.map((a) => (
            <li key={a.id} className="px-5 py-4">
              <Link
                href={`/admissions/${a.id}`}
                className="flex items-center justify-between gap-4"
              >
                <div>
                  <span className="font-display text-base text-[var(--color-navy-ink)]">
                    {a.name}
                  </span>
                  <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                    {a.grade ? `Grade ${a.grade} · ` : ""}applied{" "}
                    {new Date(a.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span
                  className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${STATUS_CLASS[a.status]}`}
                >
                  {STATUS_LABEL[a.status]}
                </span>
              </Link>
            </li>
          ))}
          {applicants.length === 0 && (
            <li className="px-5 py-8 text-center text-sm text-[var(--color-ink-muted)]">
              No applicants yet.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
