import { getPublicShare } from "@/lib/queries";
import { isCardFormat } from "@/lib/share";
import { renderShareCard } from "@/lib/share-card";

// Public. Renders the whitelisted snapshot as a PNG: ?format=feed (default),
// story, or og (link-preview size). ?download=1 sets a filename.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const content = getPublicShare(token);
  if (!content) return new Response("Not found", { status: 404 });

  const url = new URL(request.url);
  const requested = url.searchParams.get("format");
  const format = isCardFormat(requested) ? requested : "feed";

  const image = renderShareCard(content, format);
  const headers = new Headers(image.headers);
  headers.set("Cache-Control", "public, max-age=300");
  if (url.searchParams.get("download") === "1") {
    headers.set(
      "Content-Disposition",
      `attachment; filename="pacifica-pathway-${format}.png"`
    );
  }
  return new Response(image.body, { status: 200, headers });
}
