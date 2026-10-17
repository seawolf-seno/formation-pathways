import { redirect } from "next/navigation";
import { requireStaff, getPilotSettings } from "@/lib/sor/queries";
import { getSorClient } from "@/lib/sor/supabase-server";
import { openHouseCatalog } from "@/lib/openhouse-server";
import { qrSvg } from "@/lib/openhouse-card";
import { requestOrigin } from "@/lib/origin";
import type { OhPathway } from "@/lib/openhouse";
import { AutoRefresh, CardTile, Schools, type WallCard } from "@/components/openhouse/LiveWall";

export const metadata = { title: "Open House · Formation Pathways", robots: { index: false, follow: false } };

/** The Open House live wall: the QR code, a few numbers, every card as it's
 *  made (sign, pull, applied, waive), and feeder-school counts. */
export default async function OpenHouseWall() {
  const staff = await requireStaff();
  if (staff.role !== "admin" && staff.role !== "admissions") redirect("/capture");
  const supabase = await getSorClient();
  const [{ data: rows }, { data: schools }, settings, origin] = await Promise.all([
    supabase.from("openhouse_families").select("*").order("created_at", { ascending: false }).limit(500),
    supabase.from("openhouse_schools").select("name, students, highlights").order("name"),
    getPilotSettings(),
    requestOrigin(),
  ]);
  const catalog = openHouseCatalog();
  const families = (rows ?? []) as Record<string, unknown>[];
  const mentorName = new Map(catalog.mentors.map((m) => [m.id, m.name]));
  const cards: WallCard[] = families.map((f) => {
    const pathways = (Array.isArray(f.pathways) ? f.pathways : []) as OhPathway[];
    const friends = families.filter((r) => r.referred_by_code === f.share_code);
    return {
      id: String(f.id),
      firstName: String(f.child_first_name),
      grade: (f.grade as number) ?? null,
      interests: (f.interests as string[]) ?? [],
      titles: pathways.map((p) => p.title),
      mentors: [...new Set(pathways.flatMap((p) => p.mentors))].map((id) => mentorName.get(id) ?? id),
      status: String(f.status),
      usedAi: Boolean(f.used_ai),
      reviewedBy: (f.reviewed_by_name as string) ?? null,
      shared: Boolean(f.shared_at),
      applied: Boolean(f.applied),
      friends: friends.length,
      friendsApplied: friends.filter((r) => r.applied).length,
      waivedBy: (f.fee_waived_by as string) ?? null,
      created: String(f.created_at),
      sample: Boolean(f.is_sample),
    };
  });
  const url = `${origin}/oh`;
  const qr = await qrSvg(url);
  const n = (k: (c: WallCard) => boolean) => cards.filter(k).length;
  const waiverOn = Boolean(settings.referral_thanks_open);

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 sm:px-6">
      <AutoRefresh />
      <header className="flex flex-wrap items-center gap-6">
        <div className="w-40 rounded-xl bg-white p-2" dangerouslySetInnerHTML={{ __html: qr }} />
        <div className="flex-1">
          <h1 className="font-display text-3xl text-[var(--color-navy-ink)]">Open House</h1>
          <p className="text-sm text-[var(--color-ink-muted)]">{url}</p>
          {!settings.inquiries_open && <p className="mt-2 rounded-lg bg-[var(--color-gold-light)] px-3 py-2 text-sm text-[var(--color-navy-ink)]">Closed: record leadership&apos;s approval on Inquiries to open it.</p>}
          {!waiverOn && <p className="mt-2 text-xs text-[var(--color-ink-muted)]">Fee waiver is off until leadership turns the thank-you on (Inquiries → Referrals).</p>}
        </div>
        <dl className="grid grid-cols-4 gap-4 text-center">
          {[["Families", cards.length], ["Shared", n((c) => c.shared)], ["Friends", n((c) => c.friends > 0)], ["Applied", n((c) => c.applied)]].map(([k, v]) => (
            <div key={k as string}>
              <dt className="text-xs text-[var(--color-ink-muted)]">{k}</dt>
              <dd className="font-display text-3xl text-[var(--color-navy-ink)]">{v}</dd>
            </div>
          ))}
        </dl>
      </header>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <CardTile key={c.id} c={c} waiverOn={waiverOn} />
        ))}
        {!cards.length && <li className="text-sm text-[var(--color-ink-muted)]">No families yet. Cards appear here as they&apos;re made.</li>}
      </ul>
      <details className="rounded-2xl border border-[var(--color-border)] bg-white p-4">
        <summary className="cursor-pointer font-medium text-[var(--color-navy-ink)]">Feeder schools (counts only)</summary>
        <div className="mt-3">
          <Schools schools={(schools ?? []) as { name: string; students: number; highlights: string[] }[]} />
        </div>
      </details>
    </div>
  );
}
