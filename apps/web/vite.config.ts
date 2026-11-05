import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The browser calls /api/... on the Vite origin and Vite forwards to the NestJS API.
    // Same origin for the browser = the session cookie just works, no CORS in dev.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // Socket.IO (WebSocket upgrade included) goes to the same API server.
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
})
