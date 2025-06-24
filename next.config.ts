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
    },
    esmExternals: true,
  },
  env: {
    PORT: process.env.PORT || '8080',
  },
  // Required for Azure Web App
  httpAgentOptions: {
    keepAlive: true,
  },
  // Webpack configuration to handle timezone data properly
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Ensure timezone data is available on the server
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
      };
    }
    return config;
  },
};

export default nextConfig;
