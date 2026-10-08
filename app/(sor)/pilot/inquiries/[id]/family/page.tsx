import { notFound, redirect } from "next/navigation";
import { getInquiry, logAccess, requireStaff } from "@/lib/sor/queries";
import { getConsentedAlumniStories } from "@/lib/queries";
import { syncDemoDb } from "@/lib/demo-persist";
import { pickStories } from "@/lib/inquiry";
import { welcomeMatches } from "@/lib/discover";
import { requestOrigin } from "@/lib/origin";
import { FamilyWelcome } from "@/components/discover/FamilyWelcome";

export const metadata = { title: "What the family sees · Formation Pathways" };

/**
 * Staff preview of an inquiring family's page: exactly what they'll see once
 * sending is built. Only the signed pathway is shown, never a draft. Graduate
 * stories are the demo's consented (fictional) set for now.
 */
export default async function FamilyPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await requireStaff();
  if (staff.role !== "admin" && staff.role !== "admissions") redirect("/capture");
  const found = await getInquiry(id);
  if (!found) notFound();
  const { inquiry: i, drafts } = found;
  await logAccess(staff, "view_inquiry_family_preview", null, { inquiry: i.id });

  await syncDemoDb();
  const { stories, sameSchool } = pickStories(getConsentedAlumniStories(), i.current_school ?? "");
  const signed = drafts.find((d) => d.status === "approved");
  const origin = await requestOrigin();

  return (
    <>
      <p className="sticky top-0 z-10 bg-[var(--color-gold-light)] px-4 py-2 text-center text-xs text-[var(--color-navy-ink)]">
        Staff preview{i.is_sample ? " of a fictional sample" : ""}. Families can&apos;t open this yet; sending it to them is the next step.
      </p>
      <FamilyWelcome
        familyName={i.parent_last_name}
        parentFirstName={i.parent_first_name}
        childFirstName={i.child_first_name}
        currentSchool={i.current_school}
        oneThing={i.one_thing}
        matches={welcomeMatches(i.interests)}
        stories={stories.map((s) => ({
          firstName: s.first_name, gradYear: s.grad_year, headline: s.headline, story: s.story, whereNow: s.where_now,
        }))}
        sameSchool={sameSchool}
        pathways={signed?.pathways ?? null}
        cardUrl={`/pilot/inquiries/${i.id}/card`}
        referralUrl={`${origin}/discover?ref=${i.share_code}`}
      />
    </>
  );
}
