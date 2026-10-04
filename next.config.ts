import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    // Next.js buffers request bodies passing through proxy.ts (our auth
    // check) up to this size; the default 10MB is too small for a zip of
    // exported product photos.
    proxyClientMaxBodySize: "200mb",
  },
};

export default nextConfig;
