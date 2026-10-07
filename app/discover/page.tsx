import { connection } from "next/server";
import { PacificaLogo } from "@/components/PacificaLogo";
import { InquiryForm } from "@/components/discover/InquiryForm";
import { cleanRef, cleanSource, entryYears } from "@/lib/discover";
import { getSorClient, isSorConfigured } from "@/lib/sor/supabase-server";
import "@/components/discover/discover.css";

export const metadata = {
  title: "Discover Pacifica · Pacifica Christian High School",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};

// The school website's own inquiry page, until this form is open.
const WEBSITE_INQUIRY = "https://www.pacificachristian.org/inquire";

/** Whether leadership has opened the form; the only thing the public can ask. */
async function isOpen(): Promise<boolean> {
  if (!isSorConfigured()) return false;
  try {
    const supabase = await getSorClient();
    const { data, error } = await supabase.rpc("inquiries_open");
    return !error && data === true;
  } catch {
    return false;
  }
}

/**
 * Formation Pathways' own inquiry form (Fizzy #29). Public, no sign-in.
 * - Linked from the school website as /discover?src=website.
 * - Embedded on the website as /discover?src=website&embed=1 (framing is
 *   allowed for pacificachristian.org only; see next.config.ts).
 * - Reached from a family's shared pathway as /discover?ref=CODE.
 * Saves only through submit_inquiry() in the database. docs/inquiries.md.
 */
export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ src?: string; ref?: string; embed?: string }>;
}) {
  await connection();
  const q = await searchParams;
  const embed = q.embed === "1";
  const open = await isOpen();

  return (
    <main className={`dsc${embed ? " is-embed" : ""}`}>
      {!embed && (
        <div className="dsc-bar">
          <div className="dsc-bar-inner">
            <a href="https://www.pacificachristian.org" aria-label="Pacifica Christian High School">
              <PacificaLogo />
            </a>
          </div>
        </div>
      )}
      <div className="dsc-wrap">
        <header className="dsc-intro">
          <p className="dsc-eyebrow">Discover Pacifica</p>
          <h1>
            Tell us about your child. <em>We&apos;ll show you where they could grow.</em>
          </h1>
          <p className="dsc-lede">
            Every student at Pacifica starts somewhere particular: a project, a question, a team, a habit nobody else
            has. Start there.
          </p>
          {!embed && (
            <ol className="dsc-promise">
              <li><b>1</b><span>Tell us a little about your child, in your own words.</span></li>
              <li><b>2</b><span>Our admissions team reads it and gets in touch.</span></li>
              <li><b>3</b><span>If you&apos;d like, we prepare a Formation Pathway: where your child could grow here, built from what you shared.</span></li>
            </ol>
          )}
        </header>

        {open ? (
          <InquiryForm years={entryYears()} source={cleanSource(q.src)} referral={cleanRef(q.ref)} />
        ) : (
          <section className="dsc-thanks">
            <p className="dsc-eyebrow" style={{ marginTop: 0 }}>Opening soon</p>
            <h2>This form isn&apos;t open yet.</h2>
            <p className="dsc-lede" style={{ maxWidth: "46ch" }}>
              We&apos;d still love to hear from you. Please use the inquiry form on our website for now.
            </p>
            <p style={{ marginTop: 22 }}>
              <a className="dsc-link" href={WEBSITE_INQUIRY} target="_top">Request information from Pacifica</a>
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
