import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Refreshes the staff session cookie and bounces signed-out visitors to
// /login. This is only the optimistic check — real authorization for the
// system of record is Postgres RLS on every query.
//
// System-of-record routes always need sign-in. The fictional exec demo stays
// open in local dev (board rehearsals), but once deployed it's behind a
// signed-in @pacificachristian.org account too, and every demo page and
// action also requires active staff (lib/demo-access.ts): its Claude calls
// cost money, and a pending or deactivated account passes this check.
const SOR_PREFIXES = ["/pilot", "/capture", "/season", "/pathway", "/mastery", "/me", "/study", "/stem"];

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  // Parent-curated public shares (and their card images) are the one public
  // surface. They serve only a whitelisted snapshot; see docs/pathway-sharing.md.
  // /w/[code]: an inquiring family's shared pathway and its card image
  // (docs/family-sharing.md), read-only like the demo shares.
  // Vercel Cron: the route checks CRON_SECRET itself and touches no session.
  // The Mastery Hub browser extension: its routes take only the extension's
  // token, checked again by the database on every call.
  if (path.startsWith("/api/cron/") || path.startsWith("/api/mastery/extension/")) {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }
  if (path.startsWith("/share/") || path.startsWith("/from/") || path.startsWith("/w/")) {
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
  if (path.startsWith("/spark/") || path === "/discover" || path.startsWith("/discover/") || path.startsWith("/welcome/") || path.startsWith("/scholars/") || path === "/oh" || path.startsWith("/oh/")) {
    // The deliberate public WRITE surfaces, both with no school sign-in:
    // - /spark/[token]: an applicant's Spark survey (fictional demo).
    //   submitSparkResponseAction (lib/actions.ts) is scoped by spark_token to
    //   one applicant's spark_response only. See docs/interest-survey.md.
    // - /spark/family/[token]: at-home Spark for a pilot student. The
    //   database functions spark_link_greeting/submit check the token hash,
    //   expiry, single use and student_voice consent; write-only. See
    //   supabase/migrations/20261004150000_spark_family_links.sql.
    // - /discover: the family inquiry form (Fizzy #29). Saves only through
    //   the database function submit_inquiry(), which refuses until an
    //   admin records leadership's approval. Its page registers one action
    //   (lib/discover-actions.ts). See docs/inquiries.md.
    // - /welcome/[token]: an inquiring family's own page, by the private
    //   link admissions sends. Reads and shares only through the database
    //   functions family_page/family_share/family_stop_sharing, which check
    //   the token; its page registers two actions (lib/family-actions.ts).
    //   See docs/family-sharing.md.
    // - /oh, /oh/[token]: Open House pathways (Fizzy #38). Join, see your
    //   own card by its private link, share; all through the checked
    //   functions openhouse_join/_page/_share/_public. See docs/open-house.md.
    // - /scholars/[token]: STEM workspace; token-scoped database functions
    //   enforce expiry, active coordinator, consent and limited student writes.
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
