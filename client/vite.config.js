// Vite sozlamalari - API va socket'ga proxy orqali ulanish
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Monorepo: packages/ papkasi client/ dan tashqarida.
// `@race/*` alias orqali ulanadi (nisbiy ../../../.. zanjirlari o'rniga).
const packagesRoot = fileURLToPath(new URL('../packages', import.meta.url));
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@race': packagesRoot,
    },
  },
  server: {
    host: '0.0.0.0',
    // packages/ papkasi loyiha ildizidan tashqarida — Vite ruxsat berishi kerak
    fs: { allow: [repoRoot] },
    port: 5173,
    allowedHosts: true,
    proxy: {
      // Lokal backend (npm run dev - server papkasida)
      '/api': { target: 'http://127.0.0.1:4000', changeOrigin: true },
      '/uploads': { target: 'http://127.0.0.1:4000', changeOrigin: true },
      '/socket.io': { target: 'http://127.0.0.1:4000', changeOrigin: true, ws: true },
      // Production uchun (lokal backend yo'q bo'lsa shuni oching):
      // '/api': { target: 'https://api.xolt.uz', changeOrigin: true },
      // '/uploads': { target: 'https://api.xolt.uz', changeOrigin: true },
      // '/socket.io': { target: 'https://api.xolt.uz', changeOrigin: true, ws: true },
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
          // Three.js alohida chunk — poyga sahifasigacha yuklanmaydi
          three: ['three'],
        },
      },
    },
  },
});
