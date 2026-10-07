import { NextResponse, type NextRequest } from "next/server";
import { logAccess, requireStaff } from "@/lib/sor/queries";
import { exchangeCode, FLOW_COOKIE, TOKEN_COOKIE, tokenCookieValue } from "@/lib/sor/blackbaud-auth";
import { requestOrigin } from "@/lib/origin";

// Blackbaud sends the admin back here with a code. Exchange it for a 60-minute
// token kept only in this browser's httpOnly cookie; nothing is stored or logged.
export async function GET(request: NextRequest) {
  const staff = await requireStaff();
  const back = (q: string) => NextResponse.redirect(new URL(`/pilot?blackbaud=${q}#import`, request.url));
  if (staff.role !== "admin") return back("admin-only");

  const p = request.nextUrl.searchParams;
  const [state, verifier] = (request.cookies.get(FLOW_COOKIE)?.value ?? "").split(".");
  if (p.get("error")) return back("declined");
  const code = p.get("code");
  if (!code || !state || !verifier || p.get("state") !== state) return back("expired");

  try {
    const { token, expiresIn } = await exchangeCode(await requestOrigin(), code, verifier);
    await logAccess(staff, "blackbaud_connect", null, {});
    const res = back("connected");
    const secure = process.env.NODE_ENV === "production" || request.nextUrl.protocol === "https:";
    res.cookies.set(TOKEN_COOKIE, tokenCookieValue(token, expiresIn), {
      httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: Math.max(60, expiresIn - 60),
    });
    res.cookies.set(FLOW_COOKIE, "", { path: "/auth/blackbaud", maxAge: 0 });
    return res;
  } catch {
    return back("error");
  }
}
