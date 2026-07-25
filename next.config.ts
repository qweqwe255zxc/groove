import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits .next/standalone — a self-contained server bundle with only the
  // dependencies actually used, instead of shipping the whole node_modules.
  // Only affects `next build`'s output; Vercel ignores this and does its
  // own optimized packaging regardless.
  output: "standalone",
  images: {
    remotePatterns: [
      // iTunes/Apple Music artwork is served from several mzstatic subdomains
      // (a1-a5, is1-is5, ...) — wildcard covers all of them.
      { protocol: "https", hostname: "**.mzstatic.com" },
    ],
  },
};

export default nextConfig;
