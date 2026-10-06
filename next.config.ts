import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prompts, fictional sample exports, the world-signals snapshot and card
  // artwork use fs at runtime, so the deployment trace can't see them. Ship
  // them with every server route.
  outputFileTracingIncludes: {
    "/*": ["./prompts/**/*", "./fixtures/sample/**/*", "./fixtures/world-signals.json", "./public/brand/**/*"],
  },
};

export default nextConfig;
