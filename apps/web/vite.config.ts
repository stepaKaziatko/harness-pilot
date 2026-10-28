import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// Ports come from the repository-root .env (see .env.example); /api is proxied to the API so the
// browser only ever talks to its own origin and the API needs no CORS.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../..', '');
  const apiPort = env.API_PORT ?? '3001';
  return {
    plugins: [react()],
    server: {
      port: Number(env.WEB_PORT ?? 5173),
      proxy: { '/api': `http://localhost:${apiPort}` },
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
    },
  };
});
