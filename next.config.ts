import type { NextConfig } from "next";

// Content-Security-Policy starts as Report-Only: violations show in the
// browser console without breaking anything. Switch the header name to
// "Content-Security-Policy" once a week of normal use shows no violations.
// The app makes no browser-side Supabase calls (Server Actions only) and
// self-hosts its fonts via next/font, so 'self' covers nearly everything.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://*.supabase.co https://accounts.google.com",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy-Report-Only", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Token pages (/share, /spark) set no-referrer in proxy.ts as well.
  { key: "Referrer-Policy", value: "same-origin" },
  // Microphone stays on for dictation (Spark, capture); everything else off.
  { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

// /discover (the family inquiry form) may be embedded on the school website,
// like Finalsite's form is today. X-Frame-Options can't list sites, so that
// route drops it and enforces frame-ancestors instead; everything else
// still refuses all framing.
const discoverFrameAncestors =
  process.env.DISCOVER_EMBED_ORIGINS?.trim() || "https://www.pacificachristian.org https://pacificachristian.org";
const discoverHeaders = [
  ...securityHeaders
    .filter((h) => h.key !== "X-Frame-Options")
    .map((h) =>
      h.key === "Content-Security-Policy-Report-Only"
        ? { ...h, value: h.value.replace("; frame-ancestors 'none'", "") }
        : h
    ),
  { key: "Content-Security-Policy", value: `frame-ancestors 'self' ${discoverFrameAncestors}` },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    // Production only: dev's hot reload needs looser rules.
    if (process.env.NODE_ENV !== "production") return [];
    return [
      { source: "/:path((?!discover(?:/|$)).*)", headers: securityHeaders },
      { source: "/discover", headers: discoverHeaders },
    ];
  },
  // Prompts, fictional sample exports, the world-signals snapshot, the
  // migrations (read by the schema drift check) and card artwork use fs at
  // runtime, so the deployment trace can't see them. Ship them with every
  // server route.
  outputFileTracingIncludes: {
    "/*": ["./prompts/**/*", "./fixtures/sample/**/*", "./fixtures/world-signals.json", "./supabase/migrations/**/*", "./public/brand/**/*", "./assets/fonts/**/*"],
  },
};

export default nextConfig;
