import { NextResponse, type NextRequest } from "next/server";
import { getSorClient } from "@/lib/sor/supabase-server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next") ?? "/capture";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/capture";
  if (code) {
    const supabase = await getSorClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safeNext, request.url));
  }
  return NextResponse.redirect(new URL("/login?error=link", request.url));
}
