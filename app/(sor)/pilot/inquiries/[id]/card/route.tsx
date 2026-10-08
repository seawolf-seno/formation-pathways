import { getInquiry, getStaffOrNull } from "@/lib/sor/queries";
import { familyCardResponse } from "@/lib/family-card";
import { cardContent, isCardStyle, parsePublicShare } from "@/lib/family-share";
import { isCardFormat } from "@/lib/share";

/** Card image for an inquiring family's signed pathway (staff preview): the
 *  same card the family shares, first name and the pathway only. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getStaffOrNull();
  if (!staff || (staff.role !== "admin" && staff.role !== "admissions")) return new Response("Not found", { status: 404 });
  const { id } = await params;
  const found = await getInquiry(id);
  const signed = found?.drafts.find((d) => d.status === "approved");
  if (!found || !signed) return new Response("Not found", { status: 404 });

  const q = new URL(request.url).searchParams;
  const format = q.get("format") ?? "feed";
  const style = q.get("style") ?? "tide";
  const p = Number(q.get("p") ?? 0);
  const pathway = Number.isInteger(p) ? signed.pathways[p] : undefined;
  if (!isCardFormat(format) || !isCardStyle(style) || !pathway) return new Response("Not found", { status: 404 });

  const share = parsePublicShare({ first_name: found.inquiry.child_first_name, style, ref: found.inquiry.share_code, pathway });
  if (!share) return new Response("Not found", { status: 404 });
  return familyCardResponse(cardContent(share), style, format, { download: q.has("download"), cache: "private" });
}
