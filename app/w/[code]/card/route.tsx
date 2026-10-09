import { familyCardResponse } from "@/lib/family-card";
import { cardContent } from "@/lib/family-share";
import { getPublicShare } from "@/lib/family-page";
import { isCardFormat } from "@/lib/share";

/** A shared card's image: the link preview social sites fetch (format=og). */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const q = new URL(request.url).searchParams;
  const format = q.get("format") ?? "og";
  if (!isCardFormat(format)) return new Response("Not found", { status: 404 });
  const share = await getPublicShare(code);
  if (!share) return new Response("Not found", { status: 404 });
  return familyCardResponse(cardContent(share), share.style, format, { download: q.has("download"), cache: "public" });
}
