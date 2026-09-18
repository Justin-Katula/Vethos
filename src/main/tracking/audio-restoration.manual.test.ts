import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import {
  getAppAudioMuteState,
  muteAppAudio,
  restoreAppAudioForTarget,
  stopProcessWindowProbe,
  type AppAudioMuteState,
} from './process-window-probe'

const LIVE = process.platform === 'win32' && process.env['VETHOS_LIVE_AUDIO'] === '1'

function quietToneWav(): Buffer {
  const sampleRate = 16_000
  const samples = sampleRate
  const dataSize = samples * 2
  const wav = Buffer.alloc(44 + dataSize)
  wav.write('RIFF', 0)
  wav.writeUInt32LE(36 + dataSize, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(sampleRate, 24)
  wav.writeUInt32LE(sampleRate * 2, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(dataSize, 40)
  for (let index = 0; index < samples; index += 1) {
    const value = Math.round(Math.sin((2 * Math.PI * 440 * index) / sampleRate) * 250)
    wav.writeInt16LE(value, 44 + index * 2)
  }
  return wav
}

async function waitForState(
  pid: number,
  expected: AppAudioMuteState,
  timeoutMs = 8_000,
): Promise<AppAudioMuteState> {
  const startedAt = Date.now()
  let current: AppAudioMuteState = 'missing'
  while (Date.now() - startedAt < timeoutMs) {
    current = await getAppAudioMuteState(pid, 'powershell.exe')
    if (current === expected) return current
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  return current
}

async function terminate(child: ChildProcessWithoutNullStreams | null): Promise<void> {
  if (!child || child.exitCode !== null) return
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 2_000)
    child.once('close', () => {
      clearTimeout(timer)
      resolve()
    })
    child.kill()
  })
}

describe.runIf(LIVE)('restauration audio Windows réelle', () => {
  it(
    'coupe puis rétablit exactement la session audio ciblée',
    async () => {
      const testDir = await mkdtemp(join(tmpdir(), 'vethos-audio-live-'))
      const wavPath = join(testDir, 'quiet-tone.wav')
      let player: ChildProcessWithoutNullStreams | null = null
      try {
        await writeFile(wavPath, quietToneWav())
        const escapedPath = wavPath.replace(/'/gu, "''")
        player = spawn(
          'powershell.exe',
          [
            '-NoLogo',
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            `$player = [System.Media.SoundPlayer]::new('${escapedPath}'); $player.PlayLooping(); [Console]::Out.WriteLine('READY'); while ($true) { Start-Sleep -Seconds 1 }`,
          ],
          { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
        )

        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Lecteur audio non prêt.')), 5_000)
          player!.stdout.on('data', (chunk) => {
            if (!String(chunk).includes('READY')) return
            clearTimeout(timer)
            resolve()
          })
        })

        expect(await waitForState(player.pid!, 'unmuted')).toBe('unmuted')
        expect(await muteAppAudio('live-audio-test', player.pid!, 'powershell.exe')).toBe(true)
        expect(await waitForState(player.pid!, 'muted')).toBe('muted')

        expect(
          await restoreAppAudioForTarget('live-audio-test', player.pid!, 'powershell.exe'),
        ).toBe(true)
        expect(await waitForState(player.pid!, 'unmuted')).toBe('unmuted')
      } finally {
        await stopProcessWindowProbe()
        await terminate(player)
        await rm(testDir, { recursive: true, force: true })
      }
    },
    45_000,
  )
})
