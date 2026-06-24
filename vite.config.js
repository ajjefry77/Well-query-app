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
        timeout: 70000,        // 70 ثانیه
        proxyTimeout: 70000    // 70 ثانیه
      }
    }
  }
})