import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { externalizeDepsPlugin } from 'electron-vite'

// Build du process service. electron-vite ne gère nativement que
// main/preload/renderer ; on utilise une config Vite dédiée.
export default defineConfig({
  plugins: [externalizeDepsPlugin()],
  resolve: {
    alias: { '@shared': resolve('src/shared') },
  },
  build: {
    outDir: 'out/service',
    emptyOutDir: true,
    minify: false,
    target: 'node18',
    lib: {
      entry: resolve('src/service/index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.js',
    },
    rollupOptions: { external: ['electron'] },
  },
})
