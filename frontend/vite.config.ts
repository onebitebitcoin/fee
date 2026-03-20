import { readFileSync } from 'fs';
import { resolve } from 'path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const frontendPort = Number(process.env.FRONTEND_PORT ?? 5173);
const apiProxyTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:8000';

const appVersion = (() => {
  try {
    return readFileSync(resolve(__dirname, '../VERSION'), 'utf-8').trim();
  } catch {
    return '0.0.0';
  }
})();

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: frontendPort,
    proxy: {
      '/api': apiProxyTarget,
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
});
