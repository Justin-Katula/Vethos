import { resolve, join } from 'node:path'
import { builtinModules } from 'node:module'
import { existsSync, mkdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'

// Plugin pour compiler l'utilitaire de fenêtres pour le service
function compileProcessWindowHelperPlugin() {
  return {
    name: 'compile-process-window-helper',
    writeBundle() {
      try {
        const cscPath = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe'
        const srcPath = resolve(process.cwd(), 'src/ProcessWindowHelper.cs')
        const outDir = resolve(process.cwd(), 'out/service')
        const targetPath = join(outDir, 'ProcessWindowHelper.exe')

        if (!existsSync(outDir)) {
          mkdirSync(outDir, { recursive: true })
        }

        console.log('Compiling ProcessWindowHelper.cs to out/service...')
        execSync(`"${cscPath}" /out:"${targetPath}" /target:exe /optimize "${srcPath}"`, { stdio: 'inherit' })
      } catch (err) {
        console.error('Failed to compile ProcessWindowHelper.cs:', err)
      }
    }
  }
}

// Build du process service. electron-vite ne gère nativement que
// main/preload/renderer ; on utilise une config Vite dédiée.
export default defineConfig({
  plugins: [compileProcessWindowHelperPlugin()],
  resolve: {
    alias: { '@shared': resolve('src/shared') },
  },
  build: {
    outDir: 'out/service',
    emptyOutDir: false,
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

