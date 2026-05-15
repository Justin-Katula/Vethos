import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/main/**/*.test.ts',
      'src/renderer/**/*.test.ts',
      'src/shared/**/*.test.ts',
      'src/service/**/*.test.ts',
    ],
  },
  resolve: {
    alias: {
      '@main': resolve('src/main'),
      '@shared': resolve('src/shared'),
      '@service': resolve('src/service'),
      '@': resolve('src/renderer/src'),
    },
  },
})
