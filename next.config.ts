import type { NextConfig } from "next";

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
