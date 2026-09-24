import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The API base URL is read from VITE_API_URL; this proxy is a
    // convenience for local development so the frontend can call /api
    // directly without CORS concerns.
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:5000',
        changeOrigin: true
      }
    }
  },
  build: { outDir: 'dist', sourcemap: false }
});
