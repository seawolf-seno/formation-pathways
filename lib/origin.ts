import "server-only";
import { headers } from "next/headers";

/**
 * The origin this request came in on (e.g. https://formation-pathways.vercel.app,
 * or http://localhost:3000 in dev), for links built on the server: sign-in
 * email redirects, outreach drafts. Never hard-code a host; client code uses
 * window.location.origin instead.
 */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
