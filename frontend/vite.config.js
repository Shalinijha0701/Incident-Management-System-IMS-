import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite configuration for the IMS frontend. During development the
// dev server proxies API requests to the backend service running
// inside Docker. When packaged via Docker this proxy is not used
// because the Nginx container serves a static build.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/work-items': {
        target: 'http://backend:3000',
        changeOrigin: true
      },
      '/ingest': {
        target: 'http://backend:3000',
        changeOrigin: true
      },
      '/health': {
        target: 'http://backend:3000',
        changeOrigin: true
      },
      '/live-feed': {
        target: 'ws://backend:3000',
        ws: true
      }
    }
  }
});