import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Serveur de développement pour l'INTERFACE seule.
 *
 * `electron-vite dev` lance Electron ; utile pour l'application complète,
 * inutilisable pour regarder une page dans un navigateur. Cette configuration
 * sert le même renderer sur un port simple, avec la doublure mémoire de
 * `lib/ipc.ts` à la place du préchargement. Elle ne participe à aucun build de
 * production.
 */
export default defineConfig({
  root: 'src/renderer',
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve('src/renderer/src'),
      '@shared': resolve('src/shared'),
    },
  },
  server: { port: 5174 },
})
