import { StemHub } from "@/components/stem/StemHub";
import { getRoster, logAccess, requireStaff } from "@/lib/sor/queries";
import { getStemHub } from "@/lib/sor/stem-queries";

export default async function StemPage({ searchParams }: { searchParams: Promise<{ person?: string }> }) {
  const staff = await requireStaff();
  if (!["admin", "admissions", "teacher"].includes(staff.role)) return <div className="mx-auto max-w-3xl p-8"><h1 className="font-display text-3xl">STEM Scholars Hub</h1><p className="mt-4">Ask a school admin for teacher or coordinator access to STEM Scholars.</p></div>;
  const hub = await getStemHub();
  if (!hub) return <div className="mx-auto max-w-3xl p-8"><h1 className="font-display text-3xl">STEM Scholars Hub</h1><p className="mt-4">The hub is ready for setup. Ask your school admin to apply the STEM Scholars migration using the setup guide in docs/stem-scholars.md.</p></div>;
  const roster = await getRoster();
  const { person } = await searchParams;
  await logAccess(staff, "stem_hub_view", null);
  return <StemHub hub={hub} people={roster} eligible={roster.filter(p => p.stage !== "withdrawn" && (p.is_sample || p.consents.some(c => c.scope === "student_voice"))).map(p => p.id)} isAdmin={staff.role === "admin"} initialPerson={person} />;
}
