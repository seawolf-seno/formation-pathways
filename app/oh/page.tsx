import type { Metadata } from "next";
import { OhForm } from "@/components/openhouse/OhForm";
import { feederSchools, ohMode, openHouseCatalog, sharedCard } from "@/lib/openhouse-server";
import { requestOrigin } from "@/lib/origin";

/** Scan the QR code, one screen, a pathway. A friend's link (?ref=) shows
 *  who invited you and counts toward their family. */
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ ref?: string }> }): Promise<Metadata> {
  const { ref } = await searchParams;
  const card = ref ? await sharedCard(ref) : null;
  const origin = await requestOrigin();
  return {
    title: card ? `${card.childFirstName}'s Formation Pathway · Pacifica Christian` : "Your Formation Pathway · Pacifica Christian",
    description: openHouseCatalog().keyText,
    openGraph: card ? { images: [{ url: `${origin}/oh/s/${ref!.toUpperCase()}/card?format=og`, width: 1200, height: 630 }] } : undefined,
  };
}

export default async function OpenHouse({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  const catalog = openHouseCatalog();
  const [card, schools, mode] = await Promise.all([ref ? sharedCard(ref) : null, feederSchools(), ohMode()]);
  if (mode === "closed")
    return <h1 className="pt-10 text-center font-display text-3xl text-[var(--color-navy-ink)]">Formation Pathways open soon.</h1>;
  return (
    <div className="space-y-6">
      {card ? (
        <div className="space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/oh/s/${ref!.toUpperCase()}/card`} alt={`${card.childFirstName}'s Formation Pathway`} className="w-full rounded-2xl shadow" />
          <h1 className="font-display text-2xl text-[var(--color-navy-ink)]">{card.childFirstName}&apos;s family invited you. Get yours.</h1>
        </div>
      ) : (
        <h1 className="font-display text-3xl text-[var(--color-navy-ink)]">Your child&apos;s Formation Pathway</h1>
      )}
      {mode === "test" && (
        <p className="rounded-xl bg-[var(--color-gold-light)] px-4 py-2 text-sm text-[var(--color-navy-ink)]">Test mode: made-up names only. It saves as a sample.</p>
      )}
      <OhForm interests={catalog.interests.map(({ id, label }) => ({ id, label }))} schools={schools.map((s) => s.name)} refCode={card ? ref!.toUpperCase() : null} />
    </div>
  );
}
