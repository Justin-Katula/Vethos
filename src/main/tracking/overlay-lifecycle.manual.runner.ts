import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { app, BrowserWindow } from 'electron'
import {
  closeAppBlockOverlay,
  showBlockOverlayWindow,
} from './strict-block-window'
import {
  getVisibleWindowInfos,
  stopProcessWindowProbe,
  type ProcessWindowBounds,
} from './process-window-probe'

type OverlayResult = {
  targetFound: boolean
  overlayVisible: boolean
  boundsMatch: boolean
  overlayClosed: boolean
}

async function waitFor<T>(read: () => Promise<T | null> | T | null, timeoutMs = 12_000): Promise<T | null> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const value = await read()
    if (value !== null) return value
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return null
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

function sameBounds(a: Electron.Rectangle, b: ProcessWindowBounds): boolean {
  return (
    Math.abs(a.x - b.x) <= 2 &&
    Math.abs(a.y - b.y) <= 2 &&
    Math.abs(a.width - b.width) <= 2 &&
    Math.abs(a.height - b.height) <= 2
  )
}

async function run(): Promise<void> {
  let target: ChildProcessWithoutNullStreams | null = null
  const token = `overlay-live-${Date.now()}`
  const result: OverlayResult = {
    targetFound: false,
    overlayVisible: false,
    boundsMatch: false,
    overlayClosed: false,
  }

  try {
    process.stderr.write('OVERLAY_PROGRESS|spawn-target\n')
    target = spawn(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-STA',
        '-Command',
        "Add-Type -AssemblyName System.Windows.Forms; $form = [System.Windows.Forms.Form]::new(); $form.Text = 'Vethos Overlay Probe'; $form.Width = 720; $form.Height = 480; $form.StartPosition = 'CenterScreen'; [System.Windows.Forms.Application]::Run($form)",
      ],
      { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: false },
    )

    const targetWindow = await waitFor(async () => {
      const windows = await getVisibleWindowInfos()
      return windows.find((window) => window.title === 'Vethos Overlay Probe') ?? null
    })
    result.targetFound = targetWindow !== null
    if (!targetWindow) throw new Error('Fenêtre cible introuvable.')
    process.stderr.write('OVERLAY_PROGRESS|target-found\n')

    showBlockOverlayWindow({
      targetName: targetWindow.processName,
      type: 'app',
      mode: 'work',
      pid: targetWindow.pid,
      attemptToken: token,
    })

    const overlay = await waitFor(() => {
      const candidate = BrowserWindow.getAllWindows().find((window) => !window.isDestroyed())
      return candidate?.isVisible() ? candidate : null
    })
    result.overlayVisible = overlay !== null
    process.stderr.write(`OVERLAY_PROGRESS|overlay-visible:${String(result.overlayVisible)}\n`)
    if (overlay) result.boundsMatch = sameBounds(overlay.getBounds(), targetWindow)

    await closeAppBlockOverlay(token)
    process.stderr.write('OVERLAY_PROGRESS|overlay-closed\n')
    result.overlayClosed = BrowserWindow.getAllWindows().every((window) => window.isDestroyed())
  } finally {
    process.stderr.write('OVERLAY_PROGRESS|cleanup\n')
    await stopProcessWindowProbe()
    await terminate(target)
  }

  const encoded = Buffer.from(JSON.stringify(result), 'utf8').toString('base64')
  process.stderr.write('OVERLAY_PROGRESS|result\n')
  process.stdout.write(`OVERLAY_RESULT|${encoded}\n`)
}

void app
  .whenReady()
  .then(run)
  .then(() => app.quit())
  .catch(async (error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
    await stopProcessWindowProbe()
    app.exit(1)
  })
