import { defineConfig } from 'vite';

// PROMO_NO_HMR=1 disables live reload: an offline render must never reload mid-run.
export default defineConfig({
  root: '.',
  publicDir: 'public',
  server: { port: 5173, strictPort: false, hmr: process.env.PROMO_NO_HMR ? false : undefined },
  build: { target: 'esnext', assetsInlineLimit: 0 },
});
