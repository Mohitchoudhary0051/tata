import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'SafeForm — Offline-First Form & Scam Checker',
        short_name: 'SafeForm',
        description: 'Offline-first complaint form, scam message checker, and anonymous sponsor dashboard. Works with no internet.',
        theme_color: '#087B78',
        background_color: '#020617',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        // Cache the entire app shell for offline use
        globPatterns: ['**/*.{js,css,html,svg,png,ico,txt,woff,woff2}'],
        // No runtime caching for third-party fonts — we use system fonts only.
        // This ensures ZERO third-party requests at runtime.
        runtimeCaching: []
      }
    })
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
});
