import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prompts and the fictional sample exports are read with fs at runtime, so
  // the deployment trace can't see them. Ship them with every server route.
  outputFileTracingIncludes: {
    "/*": ["./prompts/**/*", "./fixtures/sample/**/*"],
  },
};

export default nextConfig;
