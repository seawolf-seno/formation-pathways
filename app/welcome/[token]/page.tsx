import type { Metadata } from "next";
import { FamilyWelcome } from "@/components/discover/FamilyWelcome";
import { getFamilyPage } from "@/lib/family-page";
import { familyShareAction, familyStopSharingAction } from "@/lib/family-actions";
import { FIRST_WEEK, welcomeMatches } from "@/lib/discover";
import { getConsentedAlumniStories } from "@/lib/queries";
import { syncDemoDb } from "@/lib/demo-persist";
import { pickStories } from "@/lib/inquiry";
import { PacificaLogo } from "@/components/PacificaLogo";
import "@/components/family-pathways.css";

export const metadata: Metadata = {
  title: "Your Formation Pathway · Pacifica Christian",
  robots: { index: false, follow: false },
};

/**
 * An inquiring family's own page, by the private link admissions sent them:
 * their words back, where their child could start, the signed pathway, and
 * sharing. No sign-in; the database checks the link (family_page()).
 */
export default async function FamilyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const page = await getFamilyPage(token);
  if (!page) {
    return (
      <div className="family-experience">
        <header className="family-header">
          <span className="family-wordmark"><PacificaLogo /></span>
        </header>
        <section className="family-hero fw-hero">
          <div className="family-hero-copy">
            <p className="family-eyebrow">This link isn&apos;t working</p>
            <h1>Let&apos;s get you <em>a fresh one.</em></h1>
            <p className="family-intro">
              Family links last a couple of months. Reply to the email it came in, or contact Pacifica&apos;s admissions office,
              and we&apos;ll send a new one.
            </p>
          </div>
        </section>
      </div>
    );
  }

  // Graduate stories are the demo's invented ones for now: only fictional
  // sample families see them, never a real family.
  let stories: { firstName: string; gradYear: number; headline: string; story: string; whereNow: string }[] = [];
  let sameSchool = false;
  if (page.isSample) {
    await syncDemoDb();
    const picked = pickStories(getConsentedAlumniStories(), page.currentSchool ?? "");
    sameSchool = picked.sameSchool;
    stories = picked.stories.map((s) => ({ firstName: s.first_name, gradYear: s.grad_year, headline: s.headline, story: s.story, whereNow: s.where_now }));
  }

  return (
    <FamilyWelcome
      familyName={page.familyName}
      parentFirstName={page.parentFirstName}
      childFirstName={page.childFirstName}
      currentSchool={page.currentSchool}
      oneThing={page.oneThing}
      matches={welcomeMatches(page.interests)}
      stories={stories}
      sameSchool={sameSchool}
      pathways={page.pathways}
      cardBase={`/welcome/${token}/card`}
      share={familyShareAction.bind(null, token)}
      stopSharing={familyStopSharingAction.bind(null, token)}
      moreWithApplication
      firstWeek={FIRST_WEEK}
      thanks={page.thanks}
    />
  );
}
