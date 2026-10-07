import { NextResponse, type NextRequest } from "next/server";
import { requireStaff } from "@/lib/sor/queries";
import { authorizeUrl, FLOW_COOKIE, isBlackbaudAppConfigured, newFlow } from "@/lib/sor/blackbaud-auth";
import { requestOrigin } from "@/lib/origin";

// Admin-only: sends the browser to Blackbaud's sign-in, remembering state and
// the PKCE verifier for ten minutes in an httpOnly cookie.
export async function GET(request: NextRequest) {
  const staff = await requireStaff();
  const back = (q: string) => NextResponse.redirect(new URL(`/pilot?blackbaud=${q}#import`, request.url));
  if (staff.role !== "admin") return back("admin-only");
  if (!isBlackbaudAppConfigured()) return back("not-configured");

  const { state, verifier, challenge } = newFlow();
  const res = NextResponse.redirect(authorizeUrl(await requestOrigin(), state, challenge));
  res.cookies.set(FLOW_COOKIE, `${state}.${verifier}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" || request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/auth/blackbaud",
    maxAge: 600,
  });
  return res;
}
