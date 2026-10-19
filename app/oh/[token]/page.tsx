import { notFound } from "next/navigation";
import { OhShare } from "@/components/openhouse/OhShare";
import { familyPage, openHouseCatalog } from "@/lib/openhouse-server";
import { requestOrigin } from "@/lib/origin";

export const metadata = { title: "Your Formation Pathway · Pacifica Christian", referrer: "no-referrer" as const };

/** The family's own page: their card and one Share button. */
export default async function OhFamily({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const page = await familyPage(token);
  if (!page) notFound();
  const catalog = openHouseCatalog();
  if (page.status !== "live" || !page.pathways)
    return <p className="py-24 text-center font-display text-xl text-[var(--color-navy-ink)]">Your pathway is being updated. A Pacifica teacher will be in touch soon.</p>;
  return (
    <div className="space-y-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/oh/${token}/card`} alt={`${page.childFirstName}'s Formation Pathway`} className="w-full rounded-2xl shadow" />
      <OhShare token={token} firstName={page.childFirstName} shared={page.shared} keyText={catalog.keyText} waiver={page.waiver} origin={await requestOrigin()} />
      <p className="text-center text-sm text-[var(--color-ink-muted)]">
        {page.friends > 0 ? `${page.friends} friend${page.friends === 1 ? "" : "s"} joined through your link. ` : ""}
        {catalog.connect}
      </p>
    </div>
  );
}
