import { connection } from "next/server";
import { StemStudent } from "@/components/stem/StemStudent";
import { getStemStudentView } from "@/lib/sor/stem-queries";
import { isSorConfigured } from "@/lib/sor/supabase-server";
import type { StemStudentView } from "@/lib/stem";

export const metadata = { title: "Your STEM Scholars page · Pacifica", robots: { index: false, follow: false } };
export default async function StudentPage({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  let unavailable = "This private link is unavailable or has expired. Ask your STEM Scholars coordinator for a new one.";
  let view: StemStudentView | null = null;
  if (/^[0-9a-f]{64}$/.test(token) && isSorConfigured()) {
    try {
      view = await getStemStudentView(token);
    } catch { unavailable = "Your STEM Scholars page is temporarily unavailable. Ask your coordinator to check your link."; }
  }
  if (view) return <StemStudent view={view} token={token} />;
  return <div className="mx-auto max-w-xl p-8"><h1 className="font-display text-3xl">STEM Scholars</h1><p className="mt-4">{unavailable}</p></div>;
}
