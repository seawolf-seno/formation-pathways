import Link from "next/link";
import { cardContent, type PublicShare } from "@/lib/family-share";
import { PacificaLogo } from "@/components/PacificaLogo";
import { SeawolfSurf } from "@/components/sor/SeawolfSurf";
import "@/components/family-pathways.css";
import "./shared-pathway.css";

/**
 * What a family's shared link opens: their child's first name and one
 * signed pathway, and an invitation to tell us about your own child. The
 * "Tell us" link carries the sharing family's code, which is how referrals
 * are credited.
 */
export function SharedPathway({ share, cardSrc }: { share: PublicShare; cardSrc: string }) {
  const card = cardContent(share, 400);
  const discover = `/discover?ref=${share.ref}`;

  return (
    <div className="family-experience">
      <header className="family-header">
        <span className="family-wordmark"><PacificaLogo /></span>
        <span className="family-demo">Formation Pathways</span>
      </header>

      <main className="wsh">
        <div className="wsh-grid">
          <div className="wsh-copy">
            <p className="family-eyebrow">A way {share.firstName} could grow at Pacifica</p>
            <h1 className="wsh-title">{share.pathway.name}</h1>
            {card.line && <p className="wsh-line">{card.line}</p>}
            {card.program && <p className="wsh-program">Starts in {card.program} at Pacifica</p>}
            {card.horizon.length > 0 && (
              <div className="wsh-horizon">
                <p className="wsh-label">Where it could lead</p>
                <ul>{card.horizon.map((h) => <li key={h}>{h}</li>)}</ul>
              </div>
            )}
            <p className="wsh-fine">
              Pacifica drafts a Formation Pathway for every family who tells us about their child, and a teacher or admissions
              staff member reviews and signs each one. An invitation, not a prediction.
            </p>
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="wsh-card" src={cardSrc} alt={`${share.firstName}'s card: ${share.pathway.name}`} />
        </div>

        <section className="wsh-invite">
          <SeawolfSurf size={96} />
          <div>
            <h2>Wondering about Pacifica for your own family?</h2>
            <p>Tell us one thing about your child that a brochure would miss. We&apos;ll draft a pathway for them too.</p>
            <div className="wsh-actions">
              <Link className="wsh-primary" href={discover}>Tell us about your child</Link>
              <a className="wsh-secondary" href="https://www.pacificachristian.org" target="_blank" rel="noopener noreferrer">
                Visit pacificachristian.org
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="family-footer">
        <span>Shared by {share.firstName}&apos;s family · Pacifica Christian High School</span>
      </footer>
    </div>
  );
}
