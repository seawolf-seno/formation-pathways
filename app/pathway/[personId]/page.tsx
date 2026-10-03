import { notFound, redirect } from "next/navigation";
import { getPersonProfile, logAccess, requireStaff } from "@/lib/sor/queries";
import { displayName } from "@/lib/sor/types";
import { SignedPathwayConversation } from "@/components/sor/SignedPathwayConversation";

export const metadata = {
  title: "Your Pathway · Pacifica Christian",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};

/**
 * The student-and-family view of a SIGNED pathway, opened by a staff member
 * and explored together in person (product principle: AI works behind the
 * scenes; students stay present, with people). It shows only a draft a named
 * adult has approved, never the staff-facing portrait, and has no staff
 * navigation. Requires staff sign-in: there is no student or family login.
 * Who can open it follows RLS on pathway_drafts (admin and admissions today).
 */
export default async function SignedPathwayPage({ params }: { params: Promise<{ personId: string }> }) {
  const staff = await requireStaff();
  if (staff.role !== "admin" && staff.role !== "admissions") redirect("/capture");
  const { personId } = await params;
  const profile = await getPersonProfile(personId);
  if (!profile) notFound();
  const signed = profile.drafts.find((d) => d.status === "approved");
  await logAccess(staff, "view_signed_pathway", personId, { draftId: signed?.id ?? null });

  const name = displayName(profile.person);
  if (!signed) {
    return (
      <main className="mx-auto max-w-lg px-6 py-24 text-center">
        <p className="font-display text-xl text-[var(--color-navy-ink)]">{name}&apos;s pathway isn&apos;t signed yet.</p>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
          Draft it on their page, read it closely, edit if needed, and sign it. Only a signed pathway opens here.
        </p>
      </main>
    );
  }

  const canRecord =
    profile.person.is_sample || profile.consents.some((c) => c.scope === "staff_observations" && !c.revoked_at);
  return (
    <SignedPathwayConversation
      personId={personId}
      draftId={signed.id}
      firstName={profile.person.preferred_name || profile.person.first_name}
      pathways={signed.pathways}
      signedBy={signed.approved_by ?? "a Pacifica staff member"}
      signedOn={signed.approved_at?.slice(0, 10) ?? ""}
      aiAssisted={!signed.used_fallback}
      isSample={profile.person.is_sample}
      canRecord={canRecord}
    />
  );
}
