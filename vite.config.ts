import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const basePath = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,ttf}'],
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-cache', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'gstatic-fonts-cache', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
      includeAssets: ['favicon.ico', 'icons/*.png'],
      manifest: {
        name: 'المتخصص الذكي للعقارات',
        short_name: 'المتخصص العقاري',
        description: 'نظام احترافي لإدارة العقارات والعقود والفواتير بدون اتصال بالإنترنت',
        theme_color: '#0F172A',
        background_color: '#020617',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        scope: './',
        lang: 'ar-SA',
        dir: 'rtl',
        icons: [
          { src: 'icons/icon-192.png',          type: 'image/png', sizes: '192x192',  purpose: 'any' },
          { src: 'icons/icon-512.png',          type: 'image/png', sizes: '512x512',  purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', type: 'image/png', sizes: '512x512',  purpose: 'maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          db: ['dexie', 'dexie-react-hooks'],
          charts: ['recharts'],
          pdf: ['pdfmake'],
          excel: ['xlsx'],
        },
      },
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
  },
  preview: {
    port: 4173,
    host: '0.0.0.0',
  },
  optimizeDeps: {
    include: ['pdfmake/build/pdfmake', 'pdfmake/build/vfs_fonts'],
  },
});
