import { app, BrowserWindow, ipcMain, screen, type IpcMainEvent } from 'electron'
import { join } from 'node:path'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import log from '../logging/setup'
import {
  attachOverlayWindow,
  closeProcessWindow,
  detachOverlayWindow,
  getProcessWindowBounds,
  minimizeProcessWindow,
  muteAppAudio,
  pauseAppMediaSession,
  protectBlockedWindowPreview,
  restoreBlockedWindowPreview,
  restoreAppAudioForTarget,
  restoreProcessTaskbar,
  syncOverlayWindow,
  watchProcessWindows,
  type ProcessWindowBounds,
} from './process-window-probe'

const JUSTIFICATION_CHANNEL = 'semantic-blocking:justification-submitted'
let activeStrictBlockWindow: BrowserWindow | null = null
let activeBlockOverlayArgs: BlockOverlayArgs | null = null
let allowActiveBlockOverlayClose = false
const WINDOW_CLOSE_GRACE_MS = 120
// Garde audio ciblé: il ne touche qu'aux sessions audio de l'application bloquée.
// Pas de touche média Windows ici: certaines apps transforment "pause" en
// play/pause, ce qui relance la musique au lieu de l'arrêter.
const APP_AUDIO_GUARD_INTERVAL_MS = 300
const APP_MEDIA_SESSION_PAUSE_INTERVAL_MS = 1_000
const APP_TASKBAR_HIDE_INTERVAL_MS = 1_500

type TrackedAppOverlay = {
  win: BrowserWindow
  nativeWindowId: string
  closeTimer: ReturnType<typeof setTimeout> | null
}

type TrackedSiteOverlay = {
  win: BrowserWindow
  nativeWindowId: string
  signature: string
}

type AppOverlayGroup = {
  args: BlockOverlayArgs
  overlays: Map<string, TrackedAppOverlay>
  stopWatching: (() => void) | null
  allowClose: boolean
  stopped: boolean
  mediaGuardTimer: ReturnType<typeof setInterval> | null
  lastAudioMuteAt: number
  lastMediaPauseAt: number
  lastTaskbarHideAt: number
  protectedWindowIds: Set<string>
}

const activeAppOverlayGroups = new Map<string, AppOverlayGroup>()
const activeSiteOverlays = new Map<string, TrackedSiteOverlay>()

function htmlShell(body: string, extraScript = ''): string {
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Vethos Focus Guard</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      overflow: hidden;
      color: #f8fafc;
      background:
        radial-gradient(circle at 20% 15%, rgba(125, 211, 252, 0.20), transparent 28rem),
        radial-gradient(circle at 80% 75%, rgba(52, 211, 153, 0.16), transparent 26rem),
        linear-gradient(135deg, #04111d 0%, #071827 48%, #0b1f24 100%);
    }
    .rain {
      position: fixed;
      inset: -20vh 0 0;
      pointer-events: none;
      opacity: 0.22;
      background-image: linear-gradient(180deg, rgba(255,255,255,0.55) 0 35%, transparent 35% 100%);
      background-size: 2px 30px;
      animation: rain 0.75s linear infinite;
      transform: rotate(12deg) scale(1.3);
    }
    @keyframes rain { from { background-position-y: 0; } to { background-position-y: 30px; } }
    .panel {
      width: min(760px, calc(100vw - 48px));
      padding: 44px;
      border: 1px solid rgba(148, 163, 184, 0.25);
      border-radius: 18px;
      background: rgba(2, 6, 23, 0.68);
      box-shadow: 0 32px 120px rgba(0, 0, 0, 0.42);
      backdrop-filter: blur(24px);
    }
    h1 { margin: 0; font-size: 28px; line-height: 1.15; letter-spacing: 0; }
    p { margin: 14px 0 0; color: #cbd5e1; line-height: 1.55; }
    .muted { color: #94a3b8; font-size: 13px; }
    .breath {
      width: 168px;
      height: 168px;
      margin: 34px auto 20px;
      border-radius: 999px;
      border: 1px solid rgba(186, 230, 253, 0.45);
      background: radial-gradient(circle, rgba(186, 230, 253, 0.24), rgba(14, 165, 233, 0.08));
      animation: boxBreath 16s ease-in-out infinite;
      box-shadow: 0 0 80px rgba(125, 211, 252, 0.18);
    }
    @keyframes boxBreath {
      0%, 100% { transform: scale(0.72); }
      25%, 50% { transform: scale(1); }
      75% { transform: scale(0.72); }
    }
    textarea {
      display: block;
      width: 100%;
      min-height: 116px;
      margin-top: 22px;
      resize: none;
      border: 1px solid rgba(148, 163, 184, 0.28);
      border-radius: 10px;
      padding: 14px 16px;
      color: #f8fafc;
      background: rgba(15, 23, 42, 0.82);
      outline: none;
      font: inherit;
    }
    textarea:focus { border-color: rgba(56, 189, 248, 0.75); }
    button {
      margin-top: 16px;
      border: 0;
      border-radius: 10px;
      padding: 11px 16px;
      color: #020617;
      background: #7dd3fc;
      font-weight: 700;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="rain"></div>
  ${body}
  ${extraScript}
</body>
</html>`
}

function createBlockingWindow(): BrowserWindow {
  const win = new BrowserWindow({
    fullscreen: true,
    alwaysOnTop: true,
    kiosk: true,
    frame: false,
    autoHideMenuBar: true,
    icon: join(__dirname, '../../build/icon.png'),
    backgroundColor: '#020617',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  return win
}

function loadHtml(win: BrowserWindow, html: string): void {
  void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
}

export type BlockOverlayArgs = {
  targetName: string
  type?: 'app' | 'site'
  mode?: 'work' | 'sleep'
  pid?: number
  attemptToken?: string
  windowId?: string
  focusLabel?: string
  taskTitle?: string
  objectiveName?: string
}

function isEnforcedAppOverlay(args: BlockOverlayArgs): boolean {
  return args.type === 'app' && Number.isInteger(args.pid) && Boolean(args.attemptToken)
}

function isAttachedSiteOverlay(args: BlockOverlayArgs): boolean {
  return args.type === 'site' && typeof args.windowId === 'string' && /^\d+$/u.test(args.windowId)
}

function createBlockOverlayWindow(
  args: BlockOverlayArgs,
  canClose: () => boolean = () => allowActiveBlockOverlayClose,
): BrowserWindow {
  const enforced = isEnforcedAppOverlay(args)
  const attachedSite = isAttachedSiteOverlay(args)
  const frameless = enforced || attachedSite
  const win = new BrowserWindow({
    width: 620,
    height: 640,
    minWidth: frameless ? undefined : 520,
    minHeight: frameless ? undefined : 540,
    resizable: false,
    maximizable: false,
    minimizable: !frameless,
    fullscreenable: false,
    alwaysOnTop: !frameless,
    frame: !frameless,
    hasShadow: !frameless,
    roundedCorners: true,
    thickFrame: !frameless,
    title: 'Rappel Vethos',
    autoHideMenuBar: true,
    skipTaskbar: true,
    show: false,
    icon: join(__dirname, '../../build/icon.png'),
    backgroundColor: '#020202',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: !frameless,
    },
  })
  if (!frameless) {
    win.setAlwaysOnTop(true, 'floating')
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.once('ready-to-show', () => {
    if (win.isDestroyed()) return
    if (frameless) {
      // Le groupe contrôleur a déjà décidé si cette fenêtre doit être visible.
      // Ne jamais la ressusciter ici : elle a pu être minimisée pendant le chargement.
      return
    }
    void positionBlockOverlay(win, args).then((positioned) => {
      if (win.isDestroyed()) return
      if (isEnforcedAppOverlay(args) && !positioned) return
      win.show()
      win.focus()
    })
  })
  win.on('close', (event) => {
    if (isEnforcedAppOverlay(args) && !canClose()) {
      event.preventDefault()
    }
  })
  return win
}

function centerOnCursorDisplay(win: BrowserWindow): void {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const [width = 620, height = 640] = win.getSize()
  const x = Math.round(display.workArea.x + (display.workArea.width - width) / 2)
  const y = Math.round(display.workArea.y + (display.workArea.height - height) / 2)
  win.setPosition(x, y)
}

export async function isProcessRunning(pid: number): Promise<boolean> {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function applyBlockOverlayBounds(win: BrowserWindow, bounds: ProcessWindowBounds): void {
  win.setBounds({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  })
}

function getNativeWindowId(win: BrowserWindow): string {
  const handle = win.getNativeWindowHandle()
  if (handle.length >= 8) return handle.readBigUInt64LE(0).toString()
  return String(handle.readUInt32LE(0))
}

function syncAttachedOverlay(overlay: TrackedAppOverlay, targetWindowId: string): void {
  syncOverlayWindow(overlay.nativeWindowId, targetWindowId)
}

async function positionBlockOverlay(win: BrowserWindow, args: BlockOverlayArgs): Promise<boolean> {
  if (!isEnforcedAppOverlay(args) || !args.pid) {
    centerOnCursorDisplay(win)
    return true
  }
  const bounds = await getProcessWindowBounds(args.pid, args.targetName)
  if (!bounds || win.isDestroyed()) return false
  applyBlockOverlayBounds(win, bounds)
  return true
}

function loadBlockOverlay(win: BrowserWindow, args: BlockOverlayArgs): void {
  const params = new URLSearchParams({
    app: args.targetName,
    type: args.type ?? 'app',
    mode: args.mode ?? 'work',
  })
  if (args.attemptToken) params.set('token', args.attemptToken)
  if (args.windowId) params.set('window', args.windowId)
  if (args.pid) params.set('pid', String(args.pid))
  if (args.focusLabel) params.set('focus', args.focusLabel)
  if (args.taskTitle) params.set('task', args.taskTitle)
  if (args.objectiveName) params.set('objective', args.objectiveName)
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) {
    void win.loadURL(`${devUrl}/#/block-overlay?${params.toString()}`)
    return
  }
  void win.loadFile(join(__dirname, '../renderer/index.html'), {
    hash: `/block-overlay?${params.toString()}`,
  })
}

function destroyAppOverlayGroup(token: string): boolean {
  const group = activeAppOverlayGroups.get(token)
  if (!group) return false
  group.stopped = true
  group.allowClose = true
  if (group.mediaGuardTimer) clearInterval(group.mediaGuardTimer)
  group.mediaGuardTimer = null
  group.stopWatching?.()
  group.stopWatching = null
  for (const overlay of group.overlays.values()) {
    if (overlay.closeTimer) clearTimeout(overlay.closeTimer)
    detachOverlayWindow(overlay.nativeWindowId)
    if (!overlay.win.isDestroyed()) overlay.win.destroy()
  }
  for (const windowId of group.protectedWindowIds) restoreBlockedWindowPreview(windowId)
  restoreBlockedAppResources(token, group.args.pid, group.args.targetName)
  group.protectedWindowIds.clear()
  group.overlays.clear()
  activeAppOverlayGroups.delete(token)
  return true
}

export function restoreBlockedAppResources(
  attemptToken: string,
  pid: number | undefined,
  targetName: string,
): void {
  if (!pid) return
  restoreProcessTaskbar(pid, targetName)
  restoreAppAudioForTarget(attemptToken, pid, targetName)
}

function siteOverlaySignature(args: BlockOverlayArgs): string {
  return [
    args.targetName,
    args.type ?? 'site',
    args.mode ?? 'work',
    args.focusLabel ?? '',
    args.taskTitle ?? '',
    args.objectiveName ?? '',
  ].join('\u001f')
}

function destroySiteOverlay(windowId: string): boolean {
  const overlay = activeSiteOverlays.get(windowId)
  if (!overlay) return false
  activeSiteOverlays.delete(windowId)
  detachOverlayWindow(overlay.nativeWindowId)
  if (!overlay.win.isDestroyed()) overlay.win.destroy()
  return true
}

export function closeSiteBlockOverlayWindow(windowId?: string): void {
  if (windowId) {
    destroySiteOverlay(windowId)
    return
  }
  for (const key of [...activeSiteOverlays.keys()]) destroySiteOverlay(key)
}

export function closeSiteBlockOverlayWindowsExcept(windowIds: Iterable<string>): void {
  const visible = new Set(windowIds)
  for (const key of [...activeSiteOverlays.keys()]) {
    if (!visible.has(key)) destroySiteOverlay(key)
  }
}

let appWindowControlHandlersRegistered = false

function ensureAppWindowControlHandlers(): void {
  if (appWindowControlHandlersRegistered) return
  appWindowControlHandlersRegistered = true
  ipcMain.handle(IPC_CHANNELS.BLOCKING_MINIMIZE_APP_WINDOW, async (event, rawArgs: unknown) => {
    const args = rawArgs as { token?: unknown; windowId?: unknown }
    const token = typeof args?.token === 'string' ? args.token : ''
    const windowId = typeof args?.windowId === 'string' ? args.windowId : ''
    const group = activeAppOverlayGroups.get(token)
    const overlay = group?.overlays.get(windowId)
    if (
      !group ||
      group.stopped ||
      !overlay ||
      overlay.win.isDestroyed() ||
      overlay.win.webContents !== event.sender
    ) {
      return false
    }

    const minimized = await minimizeProcessWindow(windowId)
    if (minimized && !overlay.win.isDestroyed()) overlay.win.hide()
    if (!minimized) log.warn('[block-overlay] minimisation native refusée', { windowId })
    return minimized
  })
  ipcMain.handle(IPC_CHANNELS.BLOCKING_CLOSE_APP_WINDOW, async (event, rawArgs: unknown) => {
    const args = rawArgs as { token?: unknown; windowId?: unknown }
    const token = typeof args?.token === 'string' ? args.token : ''
    const windowId = typeof args?.windowId === 'string' ? args.windowId : ''
    const group = activeAppOverlayGroups.get(token)
    const overlay = group?.overlays.get(windowId)
    if (
      !group ||
      group.stopped ||
      !overlay ||
      overlay.win.isDestroyed() ||
      overlay.win.webContents !== event.sender
    ) {
      return false
    }

    const closed = await closeProcessWindow(windowId)
    // Le watcher masquera uniquement l'overlay du processus fermé. Le groupe
    // reste armé afin que les autres fenêtres de la même application demeurent
    // bloquées et que toute réouverture soit recouverte immédiatement.
    if (!closed) log.warn('[block-overlay] fermeture native refusée', { windowId })
    return closed
  })
}

function updateAppOverlayGroup(group: AppOverlayGroup, boundsList: ProcessWindowBounds[]): void {
  if (group.stopped) return
  const present = new Set<string>()
  for (const bounds of boundsList) {
    const key = bounds.windowId ?? `${bounds.pid}:${bounds.x}:${bounds.y}`
    present.add(key)
    if (/^\d+$/u.test(key) && !group.protectedWindowIds.has(key)) {
      group.protectedWindowIds.add(key)
      protectBlockedWindowPreview(key)
    }
    const existing = group.overlays.get(key)
    if (existing) {
      if (existing.closeTimer) clearTimeout(existing.closeTimer)
      existing.closeTimer = null
      if (!existing.win.isDestroyed()) {
        if (bounds.minimized) {
          existing.win.hide()
        } else {
          // Le déplacement courant est déjà fait directement dans WinEvent.
          // Cette commande n'est nécessaire qu'à la restauration d'une fenêtre.
          if (!existing.win.isVisible()) {
            syncAttachedOverlay(existing, key)
            existing.win.showInactive()
          }
        }
      }
      continue
    }

    if (bounds.minimized) continue

    const win = createBlockOverlayWindow(group.args, () => group.allowClose)
    const overlay: TrackedAppOverlay = {
      win,
      nativeWindowId: getNativeWindowId(win),
      closeTimer: null,
    }
    group.overlays.set(key, overlay)
    applyBlockOverlayBounds(win, bounds)
    win.on('closed', () => {
      detachOverlayWindow(overlay.nativeWindowId)
      if (group.overlays.get(key)?.win === win) group.overlays.delete(key)
    })
    loadBlockOverlay(win, { ...group.args, windowId: key })
    // Le rattachement natif transforme l'overlay en fenêtre possédée par la
    // cible : une seule vignette Windows, même minimisation et bon ordre Z.
    void attachOverlayWindow(overlay.nativeWindowId, key).then((attached) => {
      if (group.stopped || group.overlays.get(key) !== overlay || win.isDestroyed()) return
      if (!attached) log.warn('[block-overlay] attachement natif impossible', { targetWindowId: key })
      // La couleur de fond bloque déjà l'application pendant le rendu React.
      win.showInactive()
    })
  }

  for (const [key, overlay] of group.overlays) {
    if (present.has(key) || overlay.closeTimer) continue
    overlay.closeTimer = setTimeout(() => {
      overlay.closeTimer = null
      if (group.stopped || group.overlays.get(key) !== overlay) return
      // Une fenêtre minimisée peut disparaître entièrement d'EnumWindows sans
      // être fermée. On garde donc son overlay caché afin de le rattacher au
      // même HWND dès sa restauration. Le groupe le détruira en fin de session.
      if (!overlay.win.isDestroyed()) overlay.win.hide()
    }, WINDOW_CLOSE_GRACE_MS)
  }

  enforceAppMediaGuard(group)
}

function enforceAppMediaGuard(group: AppOverlayGroup): void {
  if (group.stopped) return
  const now = Date.now()
  if (now - group.lastAudioMuteAt >= APP_AUDIO_GUARD_INTERVAL_MS) {
    group.lastAudioMuteAt = now
    if (group.args.pid) muteAppAudio(group.args.attemptToken ?? '', group.args.pid, group.args.targetName)
  }
  if (now - group.lastMediaPauseAt >= APP_MEDIA_SESSION_PAUSE_INTERVAL_MS) {
    group.lastMediaPauseAt = now
    if (group.args.pid) pauseAppMediaSession(group.args.pid, group.args.targetName)
  }
  if (now - group.lastTaskbarHideAt >= APP_TASKBAR_HIDE_INTERVAL_MS) {
    group.lastTaskbarHideAt = now
    for (const key of group.overlays.keys()) {
      if (/^\d+$/u.test(key)) protectBlockedWindowPreview(key)
    }
  }
}

function showEnforcedAppOverlay(args: BlockOverlayArgs): void {
  const token = args.attemptToken
  const pid = args.pid
  if (!token || !pid) return
  ensureAppWindowControlHandlers()
  const existing = activeAppOverlayGroups.get(token)
  if (existing) {
    existing.args = args
    return
  }

  const group: AppOverlayGroup = {
    args,
    overlays: new Map(),
    stopWatching: null,
    allowClose: false,
    stopped: false,
    mediaGuardTimer: null,
    lastAudioMuteAt: 0,
    lastMediaPauseAt: 0,
    lastTaskbarHideAt: 0,
    protectedWindowIds: new Set(),
  }
  activeAppOverlayGroups.set(token, group)
  group.mediaGuardTimer = setInterval(() => enforceAppMediaGuard(group), APP_AUDIO_GUARD_INTERVAL_MS)
  enforceAppMediaGuard(group)
  void watchProcessWindows(pid, args.targetName, (bounds) => {
    updateAppOverlayGroup(group, bounds)
  }).then((stopWatching) => {
    if (group.stopped || activeAppOverlayGroups.get(token) !== group) {
      stopWatching()
      return
    }
    group.stopWatching = stopWatching
  })
}

function showAttachedSiteOverlay(args: BlockOverlayArgs): void {
  const windowId = args.windowId
  if (!windowId || !/^\d+$/u.test(windowId)) return
  const signature = siteOverlaySignature(args)
  const existing = activeSiteOverlays.get(windowId)
  if (existing && !existing.win.isDestroyed()) {
    if (existing.signature !== signature) {
      existing.signature = signature
      loadBlockOverlay(existing.win, args)
    }
    syncOverlayWindow(existing.nativeWindowId, windowId)
    if (!existing.win.isVisible()) existing.win.showInactive()
    return
  }
  if (existing) activeSiteOverlays.delete(windowId)

  const win = createBlockOverlayWindow(args)
  const overlay: TrackedSiteOverlay = {
    win,
    nativeWindowId: getNativeWindowId(win),
    signature,
  }
  activeSiteOverlays.set(windowId, overlay)
  win.on('closed', () => {
    detachOverlayWindow(overlay.nativeWindowId)
    if (activeSiteOverlays.get(windowId)?.win === win) activeSiteOverlays.delete(windowId)
  })
  loadBlockOverlay(win, args)
  void attachOverlayWindow(overlay.nativeWindowId, windowId, { top: 80 }).then((attached) => {
    if (activeSiteOverlays.get(windowId) !== overlay || win.isDestroyed()) return
    if (!attached) {
      log.warn('[block-overlay] attachement site impossible', { targetWindowId: windowId })
      win.setAlwaysOnTop(true, 'floating')
    }
    syncOverlayWindow(overlay.nativeWindowId, windowId)
    win.showInactive()
  })
}

export function showBlockOverlayWindow(args: BlockOverlayArgs): void {
  if (isEnforcedAppOverlay(args)) {
    showEnforcedAppOverlay(args)
    return
  }
  if (isAttachedSiteOverlay(args)) {
    showAttachedSiteOverlay(args)
    return
  }

  if (activeStrictBlockWindow && !activeStrictBlockWindow.isDestroyed()) {
    activeBlockOverlayArgs = args
    allowActiveBlockOverlayClose = true
    loadBlockOverlay(activeStrictBlockWindow, args)
    void positionBlockOverlay(activeStrictBlockWindow, args)
    activeStrictBlockWindow.show()
    activeStrictBlockWindow.focus()
    return
  }

  allowActiveBlockOverlayClose = true
  activeBlockOverlayArgs = args
  const win = createBlockOverlayWindow(args)
  activeStrictBlockWindow = win
  win.on('closed', () => {
    if (activeStrictBlockWindow === win) {
      activeStrictBlockWindow = null
      activeBlockOverlayArgs = null
    }
  })
  loadBlockOverlay(win, args)
}

export function permitBlockOverlayClose(attemptToken: string): boolean {
  return destroyAppOverlayGroup(attemptToken)
}

export function closeBlockOverlayWindow(): void {
  allowActiveBlockOverlayClose = true
  activeStrictBlockWindow?.close()
  closeSiteBlockOverlayWindow()
  for (const token of [...activeAppOverlayGroups.keys()]) destroyAppOverlayGroup(token)
}

export function showStrictBlockWindow(
  reason: string,
  _durationMs = 10_000,
  title = 'Retourne au travail',
): void {
  showBlockOverlayWindow({
    targetName: title === 'Retourne au travail' ? reason : title,
    type: 'app',
    mode: title.toLowerCase().includes('dormir') ? 'sleep' : 'work',
  })
}

export function showRecoveryBreakWindow(restMinutes: number): void {
  const durationMs = Math.max(10_000, Math.round(restMinutes) * 60_000)
  const win = createBlockingWindow()
  loadHtml(
    win,
    htmlShell(`
      <main class="panel" aria-live="assertive">
        <h1>Pause de récupération</h1>
        <p>Le sprint de concentration est terminé. Cette pause protège ton énergie et évite que les blocs suivants repoussent ton coucher.</p>
        <div class="breath" aria-hidden="true"></div>
        <p class="muted">Pendant la pause: regarde à 20 pieds pendant 20 secondes, relâche les épaules, respire lentement, puis reprends au prochain bloc.</p>
      </main>
    `),
  )
  setTimeout(() => {
    if (!win.isDestroyed()) win.close()
  }, durationMs)
}

export function requestSemanticJustificationWindow(args: {
  domain: string
  title: string
  taskTitle: string
}): Promise<string | null> {
  return new Promise((resolve) => {
    const win = createBlockingWindow()
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    let settled = false

    const cleanup = (): void => {
      ipcMain.removeListener(JUSTIFICATION_CHANNEL, onSubmit)
      if (!settled) {
        settled = true
        resolve(null)
      }
    }

    const onSubmit = (_event: IpcMainEvent, payload: unknown): void => {
      const data = payload as { token?: string; text?: string }
      if (data?.token !== token) return
      settled = true
      cleanup()
      if (!win.isDestroyed()) win.close()
      resolve((data.text ?? '').trim())
    }

    ipcMain.on(JUSTIFICATION_CHANNEL, onSubmit)
    win.on('closed', cleanup)
    loadHtml(
      win,
      htmlShell(
        `
        <main class="panel">
          <h1>Justifie ce site pour la tâche active</h1>
          <p>Site: <strong>${args.domain}</strong></p>
          <p class="muted">${args.title}</p>
          <p>Tâche active: <strong>${args.taskTitle}</strong></p>
          <textarea id="justification" autofocus maxlength="500" placeholder="En une phrase, explique pourquoi ce site est nécessaire maintenant."></textarea>
          <button id="submit">Valider</button>
        </main>
        `,
        `<script>
          const { ipcRenderer } = require('electron');
          const submit = () => {
            const text = document.getElementById('justification').value || '';
            ipcRenderer.send('${JUSTIFICATION_CHANNEL}', { token: '${token}', text });
          };
          document.getElementById('submit').addEventListener('click', submit);
          document.getElementById('justification').addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) submit();
          });
        </script>`,
      ),
    )
  })
}
