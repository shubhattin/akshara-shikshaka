import { defineConfig, loadEnv } from 'vite';
import { devtools } from '@tanstack/devtools-vite';
import Sitemap from 'vite-plugin-sitemap';

import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { nitro } from 'nitro/vite';

import viteReact from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const config = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const hostname = env.VITE_BASE_URL?.replace(/\/+$/, '') || 'http://localhost:3000';

  return {
    resolve: {
      tsconfigPaths: true
    },
    plugins: [
      devtools(),
      tailwindcss(),
      tanstackStart(),
      nitro(),
      viteReact({
        compiler: true
      }),
      Sitemap({
        hostname,
        outDir: '.output/public',
        dynamicRoutes: ['/', '/learn'],
        readable: true,
        changefreq: {
          '/': 'monthly',
          '/learn': 'weekly'
        },
        priority: {
          '/': 1,
          '/learn': 0.8
        },
        robots: [
          {
            userAgent: '*',
            allow: ['/', '/learn'],
            disallow: [
              '/dashboard',
              '/analytics',
              '/audio_assets',
              '/gestures',
              '/image_assets',
              '/lessons',
              '/api/'
            ]
          }
        ]
      })
    ]
  };
});

export default config;
