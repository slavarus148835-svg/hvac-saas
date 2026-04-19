import type { NextConfig } from "next";

// auto-deploy marker: verify push → GitHub Actions → Vercel production (2026-04-19)

const nextConfig: NextConfig = {
  reactCompiler: true,
  redirects: async () => [
    {
      source: "/verify-email",
      destination: "/verify-email-code",
      permanent: true,
    },
    {
      source: "/verify-email/:path*",
      destination: "/verify-email-code",
      permanent: true,
    },
  ],
  headers: async () => [
    {
      source: "/",
      headers: [
        {
          key: "Cache-Control",
          value: "no-store, no-cache, must-revalidate, max-age=0",
        },
      ],
    },
  ],
};

export default nextConfig;
