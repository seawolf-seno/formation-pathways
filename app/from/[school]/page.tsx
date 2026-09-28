import type { Metadata } from "next";
import { getConsentedAlumniStories } from "@/lib/queries";
import { pickStories } from "@/lib/inquiry";
import { admissionsUrl } from "@/lib/share-card";
import { CopyButton } from "@/components/CopyButton";

// Public, no personal data: only consent-confirmed Pacifica stories, chosen by
// the prior-school slug in the URL. Safe to forward to a friend.
type Props = { params: Promise<{ school: string }> };

function schoolLabel(slug: string): string {
  return slug
    .slice(0, 40)
    .split("-")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { school } = await params;
  const { sameSchool } = pickStories(getConsentedAlumniStories(), school);
  const title = sameSchool && school !== "all"
    ? `From ${schoolLabel(school)} to Pacifica`
    : "Where Pacifica students go";
  return { title, description: "Real paths students took at Pacifica Christian High School.", robots: { index: false } };
}

export default async function FromSchoolPage({ params }: Props) {
  const { school } = await params;
  const { stories, sameSchool } = pickStories(getConsentedAlumniStories(), school);
  const own = sameSchool && school !== "all";
  const heading = own ? `From ${schoolLabel(school)} to Pacifica` : "Where Pacifica students go";

  return (
    <main className="min-h-full bg-[var(--color-navy-ink)] px-5 py-12 text-white">
      <div className="mx-auto max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--color-gold)]">
          Pacifica Christian High School
        </p>
        <h1 className="mt-4 font-display text-4xl leading-tight">{heading}</h1>
        <p className="mt-3 text-[var(--color-pacific)]">
          {own
            ? `Students who came from ${schoolLabel(school)} found very different paths here. Here are a few of them.`
            : "Students arrive from many schools and find very different paths. Here are a few of them."}
        </p>

        <div className="mt-8 space-y-5">
          {stories.map((s) => (
            <article key={s.id} className="rounded-2xl border-t-4 border-[var(--color-gold)] bg-white/5 p-6">
              <p className="text-xs uppercase tracking-widest text-[var(--color-pacific)]">
                {s.first_name} · Class of {s.grad_year}
                {s.is_fictional === 1 && (
                  <span className="ml-2 rounded-full bg-[var(--color-gold-light)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-navy-ink)]">
                    Demo story, fictional
                  </span>
                )}
              </p>
              <h2 className="mt-2 font-display text-2xl">{s.pathway_name}</h2>
              <p className="mt-1 text-[var(--color-gold-light)]">{s.headline}</p>
              <p className="mt-3 text-sm leading-relaxed">{s.story}</p>
              <p className="mt-3 text-sm text-[var(--color-pacific)]">
                <span className="font-semibold">Now:</span> {s.where_now}
              </p>
            </article>
          ))}
        </div>

        <p className="mt-10 font-display text-xl italic">
          These are one student&apos;s paths. Yours would start with you.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <a
            href={admissionsUrl()}
            className="rounded-full bg-[var(--color-gold)] px-6 py-4 text-center font-semibold text-[var(--color-navy-ink)]"
          >
            Discover Pacifica
          </a>
          <CopyButton
            text={`/from/${school}`}
            absolutePath
            label="Copy link to share with a friend"
            className="rounded-full border border-[var(--color-pacific)] px-6 py-4 text-center font-semibold"
          />
        </div>
      </div>
    </main>
  );
}
