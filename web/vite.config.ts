import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const here = import.meta.dirname;

// Multi-page build. Each entry becomes a directory in dist/, which the relay
// serves from an embedded copy — so there is still one binary and no CORS.
export default defineConfig({
  appType: 'mpa',
  // KNOOT_NO_ENV points Vite at an empty env directory, so the dist committed
  // to the repository carries no project keys. See config/no-env/README.md.
  envDir: process.env.KNOOT_NO_ENV ? resolve(here, 'config/no-env') : undefined,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        site: resolve(here, 'index.html'),
        docs: resolve(here, 'docs/index.html'),
        app: resolve(here, 'app/index.html'),
        status: resolve(here, 'status/index.html'),
        lab: resolve(here, 'lab/index.html'),
        ops: resolve(here, 'ops/index.html'),
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:7499',
      '/ws': { target: 'ws://127.0.0.1:7499', ws: true },
      '/term': { target: 'ws://127.0.0.1:7499', ws: true },
    },
  },
});
