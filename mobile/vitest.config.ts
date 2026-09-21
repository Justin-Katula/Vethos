import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// La logique pure se teste sans iPhone ni simulateur : c'est tout l'interet de
// l'avoir separee des appels natifs.
export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, '..', 'src', 'shared'),
    },
  },
})
