import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': {
        target: 'https://api.geobox.ir/v1',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        timeout: 70000,
        proxyTimeout: 70000,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('mapbox-gl') || id.includes('@mapbox/mapbox-gl-draw')) return 'vendor-mapbox'
            if (id.includes('leaflet')) return 'vendor-leaflet'
          }
        },
      },
    },
  },
})