import { getInquiry, getStaffOrNull } from "@/lib/sor/queries";
import { buildPublicShareContent, CARD_SIZES, type CardFormat } from "@/lib/share";
import { renderShareCard } from "@/lib/share-card";

/** Share-card image for an inquiring family's signed pathway (staff preview).
 *  First name and the pathway only, like the applicant cards. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getStaffOrNull();
  if (!staff || (staff.role !== "admin" && staff.role !== "admissions")) return new Response("Not found", { status: 404 });
  const { id } = await params;
  const found = await getInquiry(id);
  const signed = found?.drafts.find((d) => d.status === "approved");
  if (!found || !signed) return new Response("Not found", { status: 404 });

  const url = new URL(request.url);
  const format = (url.searchParams.get("format") ?? "feed") as CardFormat;
  if (!(format in CARD_SIZES)) return new Response("Unknown format", { status: 400 });
  const p = Number(url.searchParams.get("p") ?? 0);
  if (!Number.isInteger(p) || !signed.pathways[p]) return new Response("Not found", { status: 404 });

  const content = buildPublicShareContent(found.inquiry.child_first_name, signed.pathways, {
    pathwayIndex: p,
    highlightIndex: 0,
    includeStretch: false,
    includeHorizon: true,
    includeProgram: true,
  });
  const image = renderShareCard(content, format);
  image.headers.set("Cache-Control", "private, no-store");
  return image;
}
