import { familyCardResponse } from "@/lib/family-card";
import { cardContent, isCardStyle } from "@/lib/family-share";
import { getFamilyPage, pageAsShare } from "@/lib/family-page";
import { isCardFormat } from "@/lib/share";

/** The family's own card previews (and saved images), by their private link. */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const q = new URL(request.url).searchParams;
  const style = q.get("style") ?? "tide";
  const format = q.get("format") ?? "feed";
  const p = Number(q.get("p") ?? 0);
  if (!isCardStyle(style) || !isCardFormat(format) || !Number.isInteger(p)) return new Response("Not found", { status: 404 });
  const page = await getFamilyPage(token);
  const share = page && pageAsShare(page, p, style);
  if (!share) return new Response("Not found", { status: 404 });
  return familyCardResponse(cardContent(share), style, format, { download: q.has("download"), cache: "private" });
}
