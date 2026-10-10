import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // @vercel/blob retries failed requests 10 times with exponential backoff
    // (~17 minutes), which makes a failing upload look frozen.
    VERCEL_BLOB_RETRIES: "2",
  },
};

export default nextConfig;
