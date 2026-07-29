import { defineConfig } from 'vite';
import { devtools } from '@tanstack/devtools-vite';
import tsconfigPaths from 'vite-tsconfig-paths';

import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { nitro } from 'nitro/vite';

import viteReact from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const config = defineConfig({
  plugins: [
    devtools(),
    tsconfigPaths({ projects: ['./tsconfig.json'] }),
    tailwindcss(),
    tanstackStart(),
    nitro(),
    viteReact({
      babel: {
        plugins: ['babel-plugin-react-compiler']
      }
    })
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    setupFiles: ['./src/effect/test_setup.ts'],
    globals: false,
    pool: 'forks',
    fileParallelism: false,
    // DB module / ManagedRuntime can keep the event loop alive after suites
    teardownTimeout: 2000,
    hookTimeout: 5000
  }
});

export default config;
