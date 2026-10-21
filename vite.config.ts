import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    // `npm run dev:server` runs the backend in mock mode on this port.
    proxy: { '/api': { target: 'http://127.0.0.1:2027', changeOrigin: false } },
  },
});
