import { defineConfig, loadEnv } from 'vite';
import { devtools } from '@tanstack/devtools-vite';
import { sitemapPlugin } from '@mvp-kit/vite-sitemap-plugin';

import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { nitro } from 'nitro/vite';

import viteReact from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const config = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const baseUrl = env.VITE_BASE_URL?.replace(/\/+$/, '') || 'http://localhost:3000';

  return {
    // Nitro serves static assets from here; the sitemap plugin writes to build.outDir.
    build: {
      outDir: '.output/public'
    },
    resolve: {
      tsconfigPaths: true
    },
    plugins: [
      devtools(),
      tailwindcss(),
      tanstackStart(),
      nitro({
        // Vite 8.2 + Nitro splits the SSR service into a chunk that re-exports
        // an undeclared `ssr_exports`, which 500s every request.
        // https://github.com/TanStack/router/issues/8031
        inlineDynamicImports: true,
        // Runtime picks gnu vs musl, so the whole package (including .node files) is traced.
        traceDeps: ['lipilekhika*']
      }),
      viteReact({
        compiler: true
      }),
      sitemapPlugin({
        baseUrl,
        routes: ['/', '/learn'],
        getRouteChangefreq: (route) => (route === '/' ? 'monthly' : 'weekly'),
        getRoutePriority: (route) => (route === '/' ? 1 : 0.8),
        robotsTxt: {
          mode: 'overwrite',
          rules: [
            'User-agent: *',
            'Allow: /',
            'Allow: /learn',
            'Disallow: /dashboard',
            'Disallow: /admin',
            'Disallow: /analytics',
            'Disallow: /audio_assets',
            'Disallow: /gestures',
            'Disallow: /image_assets',
            'Disallow: /lessons',
            'Disallow: /api/'
          ]
        }
      })
    ]
  };
});

export default config;
