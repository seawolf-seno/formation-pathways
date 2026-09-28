import Link from "next/link";
import { getConsentedAlumniStories, getInquiries } from "@/lib/queries";
import { buildNurtureDrafts, pickStories, schoolKey } from "@/lib/inquiry";
import { admissionsUrl } from "@/lib/share-card";
import { CopyButton } from "@/components/CopyButton";

export default function InquiriesPage() {
  const inquiries = getInquiries();
  const stories = getConsentedAlumniStories();

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link href="/admissions" className="mb-4 inline-block text-sm text-[var(--color-ink-muted)]">
        ← Admissions
      </Link>
      <h1 className="font-display text-2xl text-[var(--color-navy-ink)]">Inquiries</h1>
      <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
        As soon as we know a family&apos;s prior school, here&apos;s an encouraging sequence built from
        Pacifica students who came from the same place. These are drafts: a staff member reviews
        and sends them. Nothing sends from this page.
      </p>

      <div className="mt-6 space-y-6">
        {inquiries.map((q) => {
          const { stories: picked, sameSchool } = pickStories(stories, q.prior_school);
          const key = sameSchool ? schoolKey(q.prior_school) : "all";
          const path = `/from/${key}`;
          const pageUrl = `http://localhost:3000${path}`;
          const drafts = buildNurtureDrafts(q, picked, sameSchool, pageUrl, admissionsUrl());
          return (
            <section key={q.id} className="rounded-xl border border-[var(--color-border)] bg-white p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-lg text-[var(--color-navy-ink)]">
                  {q.first_name} <span className="text-sm text-[var(--color-ink-muted)]">· {q.email}</span>
                </h2>
                <span className="rounded-full bg-[var(--color-pacific-light)] px-3 py-1 text-xs font-semibold text-[var(--color-navy-ink)]">
                  {q.prior_school}
                  {sameSchool ? ` · ${picked.length} stories` : " · general stories"}
                </span>
              </div>
              <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                Their page:{" "}
                <Link href={path} target="_blank" className="underline">
                  {path}
                </Link>
                {q.interests ? ` · interested in ${q.interests}` : ""}
              </p>
              <ol className="mt-4 space-y-3">
                {drafts.map((d) => (
                  <li key={d.dayOffset} className="rounded-lg border border-[var(--color-border)] p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]">
                        Day {d.dayOffset} · Draft
                      </p>
                      <CopyButton
                        text={`Subject: ${d.subject}\n\n${d.body}`}
                        label="Copy"
                        className="text-xs font-semibold text-[var(--color-navy)] underline"
                      />
                    </div>
                    <p className="mt-1 text-sm font-semibold text-[var(--color-navy-ink)]">{d.subject}</p>
                    <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-[var(--color-ink)]">{d.body}</pre>
                  </li>
                ))}
              </ol>
            </section>
          );
        })}
      </div>
    </div>
  );
}
