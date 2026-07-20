import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // Build output — Azure Static Web Apps expects the dist folder
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Chunk size warning threshold (Azure has no hard limit but keep bundles manageable)
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Split vendor libraries into a separate chunk for better caching on Azure CDN
        manualChunks(id) {
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3') || id.includes('node_modules/victory')) {
            return 'charts';
          }
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router-dom')) {
            return 'vendor';
          }
        },
      },
    },
  },

  server: {
    port: 5173,
    proxy: {
      // Proxy /api and /health to the backend so CORS headers are never an issue
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
      '/health': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
