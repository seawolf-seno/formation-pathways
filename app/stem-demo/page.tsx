import { StemHub } from "@/components/stem/StemHub";
import { requireDemoAccess } from "@/lib/demo-access";
import { stemDemo, STEM_DEMO_PEOPLE } from "@/lib/stem-demo";

export default async function StemDemoPage() {
  await requireDemoAccess();
  return <StemHub hub={stemDemo()} people={STEM_DEMO_PEOPLE} eligible={STEM_DEMO_PEOPLE.map(p => p.id)} isAdmin demo />;
}
