import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // ESLint is verified via dedicated command; ignore during build to prevent Windows FlatCompat socket hang
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
