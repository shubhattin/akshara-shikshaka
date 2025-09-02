import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    reactCompiler: true
  },
  webpack: (config, { isServer }) => {
    // Fix for Konva.js server-side rendering issues
    if (!isServer) {
      // For client-side builds, replace server-side modules with empty modules
      config.resolve.fallback = {
        ...config.resolve.fallback,
        canvas: false,
        fs: false,
        path: false
      };

      // Replace server-side Konva modules with client-side versions
      config.resolve.alias = {
        ...config.resolve.alias,
        'konva/lib/index-node.js': 'konva/lib/index.js'
      };
    }

    // Mark canvas as external to prevent bundling
    config.externals = config.externals || [];
    config.externals.push('canvas');

    return config;
  }
};

export default nextConfig;
