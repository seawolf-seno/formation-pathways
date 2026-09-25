import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicShare } from "@/lib/queries";
import { admissionsUrl } from "@/lib/share-card";
import "@/components/family-pathways.css";

export const dynamic = "force-dynamic";

// Public page. Everything rendered here comes from the whitelisted snapshot
// returned by getPublicShare(); no applicant record is read.
type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const content = getPublicShare(token);
  if (!content)
    return {
      title: "Pacifica Christian High School",
      robots: { index: false },
    };
  const title = `${content.firstName}'s Pathway: ${content.pathwayName}`;
  const image = `/share/${token}/card?format=og`;
  return {
    title,
    description: content.highlight,
    // A minor's page: link previews work, search engines stay out.
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description: content.highlight,
      images: [{ url: image, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: content.highlight,
      images: [image],
    },
  };
}

export default async function SharePage({ params }: Props) {
  const { token } = await params;
  const content = getPublicShare(token);
  if (!content) notFound();

  return (
    <main className="family-experience public-pathway">
      <header className="family-header">
        <a className="family-wordmark" href={admissionsUrl()}>
          <span className="family-seal" aria-hidden="true">
            P
          </span>
          <span>
            PACIFICA
            <span className="family-wordmark-sub">CHRISTIAN HIGH SCHOOL</span>
          </span>
        </a>
        <span className="family-demo">Fictional family · Demo</span>
      </header>
      <section className="public-pathway-hero">
        <p className="family-eyebrow">A possibility worth sharing</p>
        <p className="public-person">
          Imagine what’s possible for {content.firstName}.
        </p>
        <h1>{content.pathwayName}</h1>
        <p className="public-highlight">{content.highlight}</p>
        {content.program && (
          <p className="public-program">With Pacifica {content.program}</p>
        )}
        {(content.stretchChallenge || content.horizon) && (
          <div className="public-extras">
            {content.stretchChallenge && (
              <article>
                <h2>Room to stretch</h2>
                <p>{content.stretchChallenge}</p>
              </article>
            )}
            {content.horizon && (
              <article>
                <h2>Beyond graduation</h2>
                <ul>
                  {content.horizon.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              </article>
            )}
          </div>
        )}
        <p className="public-invitation">An invitation, not a prediction.</p>
      </section>
      <section className="family-closing">
        <p className="family-eyebrow">Every story starts somewhere</p>
        <h2>
          What could this look like
          <br />
          <em>for your child?</em>
        </h2>
        <p>
          This is one possibility for one fictional student. Your family’s
          conversation would begin with what makes your child, your child.
        </p>
        <a className="family-button" href={admissionsUrl()}>
          Discover Pacifica <span aria-hidden="true">↗</span>
        </a>
      </section>
      <footer className="family-footer">
        <span>Selected details from a reviewed demo Pathway</span>
        <span>Fictional applicant · Board demonstration</span>
      </footer>
    </main>
  );
}
