import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import * as readline from 'node:readline'
import { describe, expect, it } from 'vitest'
import { createNetworkController } from './network-controller'

type ProbeResult = { id: string; ok: boolean; error?: string }

const LIVE = process.platform === 'win32' && process.env['VETHOS_LIVE_FIREWALL'] === '1'

function createProbeClient(child: ChildProcessWithoutNullStreams): {
  ready: Promise<void>
  request: () => Promise<ProbeResult>
} {
  let readyResolve: (() => void) | null = null
  const ready = new Promise<void>((resolve) => {
    readyResolve = resolve
  })
  const waiting = new Map<
    string,
    { resolve: (result: ProbeResult) => void; timer: ReturnType<typeof setTimeout> }
  >()
  const output = readline.createInterface({ input: child.stdout })
  output.on('line', (line) => {
    if (line.trim() === 'READY') {
      readyResolve?.()
      readyResolve = null
      return
    }
    let result: ProbeResult
    try {
      result = JSON.parse(line) as ProbeResult
    } catch {
      return
    }
    const request = waiting.get(result.id)
    if (!request) return
    waiting.delete(result.id)
    clearTimeout(request.timer)
    request.resolve(result)
  })

  return {
    ready,
    request() {
      const id = `${Date.now()}-${Math.random()}`
      return new Promise<ProbeResult>((resolve) => {
        const timer = setTimeout(() => {
          waiting.delete(id)
          resolve({ id, ok: false, error: 'timeout' })
        }, 10_000)
        waiting.set(id, { resolve, timer })
        child.stdin.write(`${id}\n`)
      })
    },
  }
}

describe.runIf(LIVE)('pare-feu Windows réel par application', () => {
  it(
    'autorise, coupe puis restaure Internet pour un exécutable isolé',
    async () => {
      const testDir = await mkdtemp(join(tmpdir(), 'vethos-firewall-live-'))
      const probeExe = join(testDir, 'vethos-network-probe.exe')
      const probeScript = join(testDir, 'probe.cjs')
      const controller = createNetworkController()
      let child: ChildProcessWithoutNullStreams | null = null

      try {
        await copyFile(process.execPath, probeExe)
        await writeFile(
          probeScript,
          `const https = require('node:https')
const readline = require('node:readline')
readline.createInterface({ input: process.stdin }).on('line', (id) => {
  const request = https.get({ hostname: 'example.com', path: '/', agent: false }, (response) => {
    response.resume()
    response.on('end', () => console.log(JSON.stringify({ id, ok: true })))
  })
  request.setTimeout(6000, () => request.destroy(new Error('timeout')))
  request.on('error', (error) => console.log(JSON.stringify({ id, ok: false, error: error.message })))
})
console.log('READY')
`,
          'utf8',
        )
        child = spawn(probeExe, [probeScript], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
        const probe = createProbeClient(child)
        await probe.ready

        expect((await probe.request()).ok).toBe(true)
        const lease = await controller.blockProcess(child.pid!, 'vethos-network-probe.exe')
        expect(lease).not.toBeNull()

        await new Promise((resolve) => setTimeout(resolve, 500))
        expect((await probe.request()).ok).toBe(false)

        await controller.unblockProcess(lease!)
        await new Promise((resolve) => setTimeout(resolve, 500))
        expect((await probe.request()).ok).toBe(true)
      } finally {
        await controller.stop()
        if (child && child.exitCode === null) {
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 2_000)
            child!.once('close', () => {
              clearTimeout(timer)
              resolve()
            })
            child!.kill()
          })
        }
        await rm(testDir, { recursive: true, force: true })
      }
    },
    60_000,
  )
})
