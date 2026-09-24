import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Refreshes the staff session cookie and bounces signed-out visitors to
// /login. This is only the optimistic check — real authorization for the
// system of record is Postgres RLS on every query.
//
// System-of-record routes always need sign-in. The fictional exec demo stays
// open in local dev (board rehearsals), but once deployed it's behind a
// signed-in @pacificachristian.org account too: it has no auth of its own and
// its Claude calls cost money.
const SOR_PREFIXES = ["/pilot", "/capture"];

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isSor = SOR_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
  if (!isSor && process.env.NODE_ENV !== "production") return NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    // Unconfigured production deploy: never serve the open demo by accident.
    return !isSor && process.env.NODE_ENV === "production"
      ? NextResponse.redirect(new URL("/login", request.url))
      : NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const schoolAccount = user?.email?.toLowerCase().endsWith("@pacificachristian.org");
  if (!user || (!isSor && !schoolAccount)) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", path);
    return NextResponse.redirect(login);
  }
  return response;
}

export const config = {
  // Everything except sign-in itself, Next internals and the files a phone
  // needs before sign-in (manifest, icons).
  matcher: [
    "/((?!login|auth/|_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|icons/).*)",
  ],
};
