import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    reactCompiler: true
  },
  typedRoutes: true,
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

    // Mark canvas as external only on the server, and handle both array/function shapes
    if (isServer) {
      const ext = config.externals;
      if (Array.isArray(ext)) {
        ext.push('canvas');
      } else if (typeof ext === 'function') {
        const orig = ext;
        config.externals = async (ctx: any, req: any, cb: any) => {
          if (req === 'canvas') return cb(null, 'commonjs canvas');
          return orig(ctx, req, cb);
        };
      } else {
        config.externals = ['canvas'];
      }
    }

    return config;
  }
};

export default nextConfig;
