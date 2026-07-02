// Lance le service en dev : build puis exécution sur le binaire Electron
// en mode Node (ELECTRON_RUN_AS_NODE). Utilisé par `npm run dev:service`.
import { spawnSync, spawn } from 'node:child_process'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const build = spawnSync('npm', ['run', 'build:service'], { stdio: 'inherit', shell: true })
if (build.status !== 0) process.exit(build.status ?? 1)

// Résout le binaire Electron via Node — fonctionne même en worktree, où
// node_modules est résolu dans le repo parent.
const electronExe = createRequire(import.meta.url)('electron')
const child = spawn(electronExe, [join('out', 'service', 'index.js')], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', VETHOS_DEV: 'true' },
})
child.on('exit', (code) => process.exit(code ?? 0))
