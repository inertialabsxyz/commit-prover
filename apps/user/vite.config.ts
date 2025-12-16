import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [react(), nodePolyfills()],
  server: {
    port: 3001
  },
  optimizeDeps: {
      exclude: ['@aztec/bb.js'],
    },
    resolve: {
      alias: {
        pino: 'pino/browser.js',
      },
    },
})
