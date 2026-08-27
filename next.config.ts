import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Team customization submits name + image + walk-up song together in
      // one Server Action (docs/DESIGN.md's single full-width Save button) —
      // worst case is a max-size image (5MB) and audio file (10MB) at once,
      // so this needs real headroom over the 1MB default.
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
