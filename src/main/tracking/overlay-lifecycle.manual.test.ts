import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { build, type Plugin } from 'esbuild'
import { describe, expect, it } from 'vitest'

type OverlayResult = {
  targetFound: boolean
  overlayVisible: boolean
  boundsMatch: boolean
  overlayClosed: boolean
}

const LIVE = process.platform === 'win32' && process.env['VETHOS_LIVE_OVERLAY'] === '1'

function aliases(root: string): Plugin {
  const mappings = [
    ['@main/', join(root, 'src/main/')],
    ['@shared/', join(root, 'src/shared/')],
    ['@/', join(root, 'src/renderer/src/')],
  ] as const
  return {
    name: 'vethos-aliases',
    setup(builder) {
      builder.onResolve({ filter: /^@(main|shared)?\//u }, (args) => {
        const mapping = mappings.find(([prefix]) => args.path.startsWith(prefix))
        if (!mapping) return null
        const unresolved = join(mapping[1], args.path.slice(mapping[0].length))
        const path = [unresolved, `${unresolved}.ts`, `${unresolved}.tsx`, join(unresolved, 'index.ts')].find(
          existsSync,
        )
        return path ? { path } : null
      })
    },
  }
}

describe.runIf(LIVE)('overlay Windows réel', () => {
  it(
    'crée un overlay visible aux dimensions de la cible puis le détruit',
    async () => {
      const root = process.cwd()
      const outfile = join(root, 'out/main/overlay-lifecycle-manual.cjs')
      const electronExe = join(root, 'node_modules/electron/dist/electron.exe')
      try {
        await build({
          entryPoints: [join(root, 'src/main/tracking/overlay-lifecycle.manual.runner.ts')],
          outfile,
          bundle: true,
          platform: 'node',
          format: 'cjs',
          target: 'node20',
          external: ['electron'],
          plugins: [aliases(root)],
        })

        const result = await new Promise<OverlayResult>((resolve, reject) => {
          const child = spawn(electronExe, [outfile], {
            cwd: root,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
          })
          let stdout = ''
          let stderr = ''
          let settled = false
          const timer = setTimeout(() => {
            if (settled) return
            settled = true
            child.kill()
            reject(new Error(`Test overlay expiré. ${stderr || stdout}`))
          }, 30_000)
          child.stdout.on('data', (chunk) => {
            stdout += String(chunk)
            const line = stdout
              .split(/\r?\n/u)
              .find((entry) => entry.startsWith('OVERLAY_RESULT|'))
            if (!line || settled) return
            settled = true
            clearTimeout(timer)
            resolve(
              JSON.parse(Buffer.from(line.slice('OVERLAY_RESULT|'.length), 'base64').toString('utf8')) as OverlayResult,
            )
            setTimeout(() => child.kill(), 500)
          })
          child.stderr.on('data', (chunk) => {
            stderr += String(chunk)
          })
          child.once('close', (code) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            const line = stdout
              .split(/\r?\n/u)
              .find((entry) => entry.startsWith('OVERLAY_RESULT|'))
            if (code !== 0 || !line) {
              reject(new Error(`Runner overlay échoué (${String(code)}): ${stderr || stdout}`))
              return
            }
            resolve(
              JSON.parse(Buffer.from(line.slice('OVERLAY_RESULT|'.length), 'base64').toString('utf8')) as OverlayResult,
            )
          })
        })

        expect(result).toEqual({
          targetFound: true,
          overlayVisible: true,
          boundsMatch: true,
          overlayClosed: true,
        })
      } finally {
        await rm(outfile, { force: true })
      }
    },
    45_000,
  )
})
