import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicShare } from "@/lib/queries";
import { admissionsUrl } from "@/lib/share-card";

// Public page. Everything rendered here comes from the whitelisted snapshot
// returned by getPublicShare(); no applicant record is read.
type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const content = getPublicShare(token);
  if (!content) return { title: "Pacifica Christian High School", robots: { index: false } };
  const title = `${content.firstName}'s Pathway: ${content.pathwayName}`;
  const image = `/share/${token}/card?format=og`;
  return {
    title,
    description: content.highlight,
    // A minor's page: link previews work, search engines stay out.
    robots: { index: false, follow: false },
    openGraph: { title, description: content.highlight, images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description: content.highlight, images: [image] },
  };
}

export default async function SharePage({ params }: Props) {
  const { token } = await params;
  const content = getPublicShare(token);
  if (!content) notFound();

  return (
    <main className="min-h-full bg-[var(--color-navy-ink)] px-5 py-10 text-white">
      <div className="mx-auto max-w-md">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--color-gold)]">
          Pacifica Christian High School
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/share/${token}/card?format=feed`}
          alt={`${content.firstName}'s Pathway: ${content.pathwayName}`}
          width={1080}
          height={1350}
          className="mt-6 w-full rounded-2xl shadow-2xl"
        />
        <p className="mt-8 font-display text-2xl leading-snug">
          Every student at Pacifica is seen as someone with a story still being written.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-[var(--color-pacific)]">
          This Pathway is one family&apos;s invitation to imagine what four years here could
          become. It isn&apos;t a prediction, and yours would look different, because it would
          start with your child.
        </p>
        <a
          href={admissionsUrl()}
          className="mt-8 block rounded-full bg-[var(--color-gold)] px-6 py-4 text-center text-base font-semibold text-[var(--color-navy-ink)]"
        >
          Discover Pacifica
        </a>
        <p className="mt-6 text-center text-[11px] text-[var(--color-pacific)]">
          Shared by the family with Pacifica&apos;s approval. Demo data: fictional applicant.
        </p>
      </div>
    </main>
  );
}
