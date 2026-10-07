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

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    // Production only: dev's hot reload needs looser rules.
    return process.env.NODE_ENV === "production" ? [{ source: "/:path*", headers: securityHeaders }] : [];
  },
  // Prompts, fictional sample exports, the world-signals snapshot, the
  // migrations (read by the schema drift check) and card artwork use fs at
  // runtime, so the deployment trace can't see them. Ship them with every
  // server route.
  outputFileTracingIncludes: {
    "/*": ["./prompts/**/*", "./fixtures/sample/**/*", "./fixtures/world-signals.json", "./supabase/migrations/**/*", "./public/brand/**/*"],
  },
};

export default nextConfig;
