import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prompts, fictional sample exports, the world-signals snapshot, the
  // migrations (read by the schema drift check) and card artwork use fs at
  // runtime, so the deployment trace can't see them. Ship them with every
  // server route.
  outputFileTracingIncludes: {
    "/*": ["./prompts/**/*", "./fixtures/sample/**/*", "./fixtures/world-signals.json", "./supabase/migrations/**/*", "./public/brand/**/*"],
  },
};

export default nextConfig;
