import { redirect } from "next/navigation";
import { getResourcesForReview, getRoster, requireStaff } from "@/lib/sor/queries";
import { ResourceReviewList } from "@/components/sor/ResourceReviewList";

export const metadata = { title: "Suggested resources · Formation Pathways" };

/**
 * Study links students have suggested for their classes, for a teacher or
 * admin to look at. A link reaches other students' Study Hubs only when it's
 * approved here (humans decide), and it's shown there without the student's
 * name. Open the link before approving it.
 */
export default async function ResourceReviewPage() {
  const staff = await requireStaff();
  // A view-only account may look (sample students only, by RLS); approving is refused.
  if (staff.role !== "admin" && staff.role !== "teacher" && staff.role !== "viewer") redirect("/capture");
  const [{ ready, pending, decided }, roster] = await Promise.all([getResourcesForReview(), getRoster()]);
  const people = new Map(roster.map((p) => [p.id, p]));

  return <ResourceReviewList ready={ready} pending={pending} decided={decided} people={people} />;
}
