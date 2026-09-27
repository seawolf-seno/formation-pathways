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
  // Parent-curated public shares (and their card images) are the one public
  // surface. They serve only a whitelisted snapshot; see docs/pathway-sharing.md.
  if (path.startsWith("/share/") || path.startsWith("/from/")) {
    // A public preview must not become a bypass for POSTed staff Server Actions.
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new NextResponse("Method not allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    }
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }
  if (path.startsWith("/spark/")) {
    // The one deliberate public WRITE surface: an applicant submits their
    // Spark survey with no school sign-in. submitSparkResponseAction (see
    // lib/actions.ts) is narrowly scoped by spark_token to a single
    // applicant's spark_response column only — it cannot touch essays,
    // status, or generated pathways. See docs/interest-survey.md.
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }
  const isSor = SOR_PREFIXES.some(
    (p) => path === p || path.startsWith(`${p}/`),
  );
  if (!isSor && process.env.NODE_ENV !== "production")
    return NextResponse.next();

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
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const schoolAccount = user?.email
    ?.toLowerCase()
    .endsWith("@pacificachristian.org");
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
