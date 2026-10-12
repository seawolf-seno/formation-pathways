import { cronAuthorized, runScheduledImport } from "@/lib/mastery/scheduled";

// Vercel Cron (vercel.json) calls this every few hours in production. It's the
// one route handler the Mastery Hub has: a cron job can only call a URL. It
// reads nothing from the request but the CRON_SECRET header, returns only
// counts and course ids, and does nothing until the importer is switched on
// (lib/mastery/scheduled.ts, docs/mastery-hub.md "Automatic imports").
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!cronAuthorized(request.headers.get("authorization"))) return new Response("Unauthorized", { status: 401 });
  try {
    return Response.json(await runScheduledImport());
  } catch (e) {
    console.error("[mastery-cron]", e instanceof Error ? e.message : e);
    return Response.json({ ran: false, reason: "The import couldn't connect or failed; see the function log." }, { status: 500 });
  }
}
