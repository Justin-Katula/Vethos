import { resolve } from 'node:path'
import { builtinModules } from 'node:module'
import { defineConfig } from 'vite'

// Build du process service. electron-vite ne gère nativement que
// main/preload/renderer ; on utilise une config Vite dédiée.
export default defineConfig({
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
    // Les builtins Node doivent rester externes (fournis par le runtime Node),
    // mais les dépendances npm doivent être bundlees pour fonctionner depuis
    // app.asar.unpacked sans node_modules adjacent.
    rollupOptions: {
      external: ['electron', /^node:/, ...builtinModules],
    },
  },
})
