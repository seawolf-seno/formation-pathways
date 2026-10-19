import { openHouseCatalog, sharedCard } from "@/lib/openhouse-server";
import { openHouseCard } from "@/lib/openhouse-card";
import { requestOrigin } from "@/lib/origin";

/** A shared card's image: the invite page and link previews (format=og). */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const card = await sharedCard(code);
  if (!card) return new Response("Not found", { status: 404 });
  const origin = await requestOrigin();
  const format = new URL(request.url).searchParams.get("format") === "og" ? "og" : "post";
  return openHouseCard({ ...card, firstName: card.childFirstName, url: `${origin}/oh?ref=${code.toUpperCase()}` }, openHouseCatalog(), format);
}
