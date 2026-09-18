import { app, BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'node:path'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import { appIconWindowOptions } from '../app-icon'
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
  syncOverlayWindow,
  watchProcessWindows,
  type ProcessWindowBounds,
} from './process-window-probe'

let activeStrictBlockWindow: BrowserWindow | null = null
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
  audioMutePending: boolean
  lastMediaPauseAt: number
  lastTaskbarHideAt: number
  protectedWindowIds: Set<string>
}

const activeAppOverlayGroups = new Map<string, AppOverlayGroup>()
const activeSiteOverlays = new Map<string, TrackedSiteOverlay>()

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
    ...appIconWindowOptions(),
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

async function destroyAppOverlayGroup(token: string): Promise<boolean> {
  const group = activeAppOverlayGroups.get(token)
  if (!group) return false
  group.stopped = true
  group.allowClose = true
  if (group.mediaGuardTimer) clearInterval(group.mediaGuardTimer)
  group.mediaGuardTimer = null
  try {
    group.stopWatching?.()
  } catch (err) {
    log.warn('[block-overlay] arrêt du watcher overlay impossible', { token, err })
  }
  group.stopWatching = null
  for (const overlay of group.overlays.values()) {
    if (overlay.closeTimer) clearTimeout(overlay.closeTimer)
    try {
      detachOverlayWindow(overlay.nativeWindowId)
    } catch (err) {
      log.warn('[block-overlay] détachement overlay impossible', {
        token,
        windowId: overlay.nativeWindowId,
        err,
      })
    }
    try {
      if (!overlay.win.isDestroyed()) overlay.win.destroy()
    } catch (err) {
      log.warn('[block-overlay] destruction overlay impossible', {
        token,
        windowId: overlay.nativeWindowId,
        err,
      })
    }
  }
  for (const windowId of group.protectedWindowIds) {
    try {
      restoreBlockedWindowPreview(windowId)
    } catch (err) {
      log.warn('[block-overlay] restauration preview impossible', { token, windowId, err })
    }
  }
  group.protectedWindowIds.clear()
  group.overlays.clear()
  activeAppOverlayGroups.delete(token)
  await restoreBlockedAppResources(token, group.args.pid, group.args.targetName)
  return true
}

export function closeAppBlockOverlay(attemptToken: string): Promise<boolean> {
  return destroyAppOverlayGroup(attemptToken)
}

export async function restoreBlockedAppResources(
  attemptToken: string,
  pid: number | undefined,
  targetName: string,
): Promise<void> {
  if (!pid) return
  try {
    const restored = await restoreAppAudioForTarget(attemptToken, pid, targetName)
    if (!restored) {
      log.warn('[block-overlay] restauration non confirmée', { pid, targetName })
    }
  } catch (err) {
    log.warn('[block-overlay] restauration audio/barre des tâches impossible', {
      pid,
      targetName,
      err,
    })
  }
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
      if (!attached) {
        log.warn('[block-overlay] attachement natif impossible', { targetWindowId: key })
        // Repli visible : même si Windows refuse la relation propriétaire,
        // l'application ne doit pas apparaître une fraction de seconde devant.
        win.setAlwaysOnTop(true, 'floating')
      }
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
  if (!group.audioMutePending && now - group.lastAudioMuteAt >= APP_AUDIO_GUARD_INTERVAL_MS) {
    group.lastAudioMuteAt = now
    if (group.args.pid) {
      group.audioMutePending = true
      void muteAppAudio(
        group.args.attemptToken ?? '',
        group.args.pid,
        group.args.targetName,
      ).finally(() => {
        group.audioMutePending = false
      })
    }
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
    audioMutePending: false,
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
    allowActiveBlockOverlayClose = true
    loadBlockOverlay(activeStrictBlockWindow, args)
    void positionBlockOverlay(activeStrictBlockWindow, args)
    activeStrictBlockWindow.show()
    activeStrictBlockWindow.focus()
    return
  }

  allowActiveBlockOverlayClose = true
  const win = createBlockOverlayWindow(args)
  activeStrictBlockWindow = win
  win.on('closed', () => {
    if (activeStrictBlockWindow === win) {
      activeStrictBlockWindow = null
    }
  })
  loadBlockOverlay(win, args)
}
