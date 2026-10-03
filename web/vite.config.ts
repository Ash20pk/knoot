import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'node:path';

const here = import.meta.dirname;

// The branch's Neon Auth, which `/neon-auth` is forwarded to in development the
// way Caddy forwards it in production, so the session cookie is first-party
// here too. Not a VITE_ variable: it never reaches the bundle.
const upstream = loadEnv('development', here, '').NEON_AUTH_UPSTREAM;
const neonAuth = upstream ? new URL(upstream) : null;

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
      ...(neonAuth && {
        '/neon-auth': {
          target: neonAuth.origin,
          changeOrigin: true,
          rewrite: (p: string) => neonAuth.pathname.replace(/\/$/, '') + p.slice('/neon-auth'.length),
        },
      }),
      '/api': 'http://127.0.0.1:7499',
      '/ws': { target: 'ws://127.0.0.1:7499', ws: true },
      '/term': { target: 'ws://127.0.0.1:7499', ws: true },
    },
  },
});
