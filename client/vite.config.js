// Vite configuration: same-origin API/socket requests are proxied to the local backend.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    fs: { allow: [repoRoot] },
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': { target: 'https://xolt-games-is5h.onrender.com', changeOrigin: true },
      '/uploads': { target: 'https://xolt-games-is5h.onrender.com', changeOrigin: true },
      '/socket.io': { target: 'https://xolt-games-is5h.onrender.com', changeOrigin: true, ws: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ['recharts'],
          qr: ['html5-qrcode', 'qrcode.react'],
          vendor: ['react', 'react-dom', 'react-router-dom', 'socket.io-client', 'i18next', 'react-i18next', 'lucide-react'],
        },
      },
    },
  },
});
