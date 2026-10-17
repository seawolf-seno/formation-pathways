import { familyPage, openHouseCatalog } from "@/lib/openhouse-server";
import { openHouseCard } from "@/lib/openhouse-card";
import { requestOrigin } from "@/lib/origin";

/** The family's card image (their own link only). */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const page = await familyPage(token);
  if (!page || page.status !== "live" || !page.pathways) return new Response("Not found", { status: 404 });
  const origin = await requestOrigin();
  return openHouseCard(
    { firstName: page.childFirstName, pathways: page.pathways, usedAi: page.usedAi, reviewedBy: page.reviewedBy, url: `${origin}/oh?ref=${page.shareCode}` },
    openHouseCatalog(),
    "post",
    { download: new URL(request.url).searchParams.has("download") },
  );
}
