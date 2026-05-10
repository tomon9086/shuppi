/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { shuppiDataPlugin } from './vite-plugin-shuppi-data'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), shuppiDataPlugin()],
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/utils.ts', 'vite-plugin-shuppi-data.ts'],
      reporter: ['text', 'html'],
    },
  },
})
