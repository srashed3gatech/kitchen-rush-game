import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Resolve @kitchen-rush/shared from .ts source in dev, compiled dist in prod build.
  // The shared package.json's exports field defines a "development" condition
  // pointing at src/*.ts; production "default" → dist/*.js.
  resolve: {
    conditions: command === 'serve' ? ['development'] : [],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.KR_DEV_SERVER_PORT ?? '4000'}`,
        changeOrigin: true,
      },
    },
  },
}));
