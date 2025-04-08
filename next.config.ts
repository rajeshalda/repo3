import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  output: 'standalone',
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb'
    }
  },
  env: {
    PORT: process.env.PORT || '8080'
  },
  // Required for Azure Web App
  httpAgentOptions: {
    keepAlive: true,
  }
  // 'serverOptions' removed as it's not a valid Next.js config option
  // Port configuration should be handled through env variables or scripts
};

export default nextConfig;
