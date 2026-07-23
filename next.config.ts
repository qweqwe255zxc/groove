import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // iTunes/Apple Music artwork is served from several mzstatic subdomains
      // (a1-a5, is1-is5, ...) — wildcard covers all of them.
      { protocol: "https", hostname: "**.mzstatic.com" },
    ],
  },
};

export default nextConfig;
