import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backend = env.VITE_API_TARGET || 'http://localhost:8080'

  return {
    plugins: [react()],
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
  }
})
