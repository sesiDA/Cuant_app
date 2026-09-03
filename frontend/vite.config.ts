import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Intercepta las peticiones que empiecen por /ws y las manda a FastAPI
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true, // Habilita el soporte para WebSockets
        changeOrigin: true
      }
    }
  }
})