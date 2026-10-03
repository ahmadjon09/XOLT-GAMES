// Vite configuration. Proxy ishlatilmaydi — client API bilan to'g'ridan-to'g'ri
// gaplashadi (VITE_API_URL, qarang: .env.development va src/api/api.js).
// Auth token Authorization: Bearer header orqali yuboriladi, shuning uchun
// cross-origin so'rovlar cookie'siz ham ishlaydi.
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
