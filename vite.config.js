import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig(({ mode }) => {
  const base = process.env.VITE_BASE_PATH || '/stocksUI/'
  return {
    plugins: [react()],
    base,
    server: {
      proxy: {
        '/api': {
          target: process.env.VITE_DEV_API_TARGET || 'http://localhost:3002',
          changeOrigin: true,
        }
      }
    },
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          aero: resolve(__dirname, 'INDEX2.html'),
        }
      }
    }
  }
})
