import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/main/tracking/overlay-lifecycle.manual.test.ts'],
    exclude: [],
  },
  resolve: {
    alias: {
      '@main': resolve('src/main'),
      '@shared': resolve('src/shared'),
      '@': resolve('src/renderer/src'),
    },
  },
})
