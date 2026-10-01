import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.NEXT_STANDALONE === "1" ? "standalone" : undefined,
  // Books and secrets are runtime data, never deployment artifacts.
  outputFileTracingExcludes: {
    "/*": ["./data/**/*", "./.env*", "./tests/**/*", "./deploy/**/*"],
  },
};

export default nextConfig;
