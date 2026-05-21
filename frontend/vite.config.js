import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server proxies /api to the backend so there are no CORS
// surprises during local development.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // bind to 0.0.0.0 so other PCs on the LAN can reach it
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
