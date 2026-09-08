import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backend = env.VITE_API_TARGET || 'http://localhost:8080'

  return {
    plugins: [
      react(),

      // injectManifest, not generateSW: the worker has to handle `push` and
      // `notificationclick`, which a generated one cannot do. See src/sw.ts.
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',

        // 'prompt', not 'autoUpdate': a shell that swaps itself mid-session
        // can end up running against an API it was not built for. The app
        // asks before reloading.
        registerType: 'prompt',
        injectRegister: null,

        injectManifest: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          // The map fonts and Vazirmatn TTFs push the bundle past the 2 MiB
          // default; they are precached deliberately so the app renders
          // correctly offline.
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        },

        manifest: {
          name: 'Rad Gard — GPS Tracking',
          short_name: 'ردگَرد',
          description: 'Live vehicle tracking, theft alerts and remote control',
          start_url: '/dashboard',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#f6f8fb',
          theme_color: '#2a78d6',
          lang: 'fa',
          dir: 'rtl',
          categories: ['navigation', 'utilities', 'travel'],
          icons: [
            { src: '/pwa-64x64.png', sizes: '64x64', type: 'image/png' },
            { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          // Long-press / jump-list entries. The two things someone opens the
          // app in a hurry to reach.
          shortcuts: [
            {
              name: 'Alerts',
              short_name: 'Alerts',
              url: '/alerts',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }],
            },
            {
              name: 'Dashboard',
              short_name: 'Dashboard',
              url: '/dashboard',
              icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }],
            },
          ],
        },

        // Lets the worker be exercised with `npm run dev` instead of only in a
        // production build, which is the difference between testing push now
        // and testing it after a deploy.
        devOptions: {
          enabled: true,
          type: 'module',
          navigateFallback: 'index.html',
        },
      }),
    ],
    server: {
      // The app calls a relative "/api" base URL and opens its WebSocket on
      // window.location.host. In production nginx serves both from one origin;
      // in dev there was no proxy at all, so every request hit Vite and 404'd.
      proxy: {
        '/api': {
          target: backend,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    // `npm run preview` serves the real build, which is the only place the
    // generated service worker and manifest can actually be exercised — the
    // dev server serves a stand-in. Without the same proxy, every API call
    // from that build 404s and the app looks broken rather than built.
    preview: {
      proxy: {
        '/api': {
          target: backend,
          changeOrigin: true,
          ws: true,
        },
      },
    },
  }
})
