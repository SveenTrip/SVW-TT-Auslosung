import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/SVW-TT-Auslosung/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Tischtennis Auslosung',
        short_name: 'TT Auslosung',
        description: 'Faire Einzel- und Doppel-Auslosungen für den Vereinsabend.',
        theme_color: '#862D38',
        background_color: '#F8F5EF',
        display: 'standalone',
        orientation: 'any',
        start_url: '/SVW-TT-Auslosung/',
        scope: '/SVW-TT-Auslosung/',
        lang: 'de-DE',
        categories: ['sports', 'utilities'],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: '/SVW-TT-Auslosung/index.html',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}']
      },
      devOptions: { enabled: true }
    })
  ]
});
