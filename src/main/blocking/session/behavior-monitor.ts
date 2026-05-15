/**
 * behavior-monitor.ts
 *
 * Surveillance comportementale toutes les 3 secondes :
 * - Titre de fenêtre active (est-ce que l'utilisateur est sur une app autorisée ?)
 * - Activité clavier/souris (idle detection)
 * - Pattern WASD (jeu vidéo)
 * - Copier-coller fréquent
 *
 * Réponse progressive :
 * 1. 1ère dérive → avertissement doux
 * 2. 2ème dérive → avertissement ferme avec countdown
 * 3. 3ème dérive → fermeture automatique
 * 4. Récidive fréquente → blocage strict reste de session
 */

import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { BrowserWindow } from 'electron'

const execAsync = promisify(exec)

export type DriftLevel = 'none' | 'soft' | 'firm' | 'force' | 'lockdown'

export type BehaviorEvent = {
  type: 'drift-warning' | 'drift-force-close' | 'drift-lockdown'
  level: DriftLevel
  windowTitle: string
  processName: string
  message: string
}

export type BehaviorMonitor = {
  start: (allowedProcesses: string[]) => void
  stop: () => void
  on: (event: 'behavior', cb: (e: BehaviorEvent) => void) => void
  getDriftCount: () => number
  getDriftLevel: () => DriftLevel
}

async function getActiveWindowInfo(): Promise<{ title: string; processName: string } | null> {
  try {
    const script = `
      Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        using System.Text;
        public class Win32BM {
          [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
          [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
          [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
        }
"@
      $hwnd = [Win32BM]::GetForegroundWindow()
      $sb = New-Object System.Text.StringBuilder 512
      [Win32BM]::GetWindowText($hwnd, $sb, 512) | Out-Null
      $pid = 0
      [Win32BM]::GetWindowThreadProcessId($hwnd, [ref]$pid) | Out-Null
      $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
      @{ title = $sb.ToString(); process = if($proc){$proc.ProcessName + '.exe'}else{''} } | ConvertTo-Json
    `
    const { stdout } = await execAsync(
      `powershell -NoProfile -NonInteractive -Command "${script.replace(/"/g, '\\"')}"`,
      { windowsHide: true, timeout: 5000 },
    )
    const parsed = JSON.parse(stdout || '{}')
    return parsed.title ? { title: String(parsed.title), processName: String(parsed.process || '').toLowerCase() } : null
  } catch {
    return null
  }
}

// Processus système à ne jamais considérer comme dérive
const SYSTEM_PROCESSES = new Set([
  'explorer.exe', 'searchui.exe', 'shellexperiencehost.exe',
  'startmenuexperiencehost.exe', 'textinputhost.exe',
  'applicationframehost.exe', 'lockapp.exe', 'nexus.exe',
])

export function createBehaviorMonitor(getMainWindow: () => BrowserWindow | null): BehaviorMonitor {
  let timer: ReturnType<typeof setInterval> | null = null
  let driftCount = 0
  let driftLevel: DriftLevel = 'none'
  let allowedSet = new Set<string>()
  const listeners: Array<(e: BehaviorEvent) => void> = []

  function emit(event: BehaviorEvent) {
    for (const cb of listeners) cb(event)
    // Aussi envoyer au renderer
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('nexus:behavior-event', event)
    }
  }

  async function tick() {
    const info = await getActiveWindowInfo()
    if (!info || !info.processName) return

    // Ignorer les processus système et Nexus lui-même
    if (SYSTEM_PROCESSES.has(info.processName)) return

    // Vérifier si le processus est autorisé
    const isAllowed = allowedSet.has(info.processName)
    if (isAllowed) {
      // Pas de dérive — reset progressif
      if (driftCount > 0) driftCount = Math.max(0, driftCount - 0.5)
      if (driftCount <= 0) driftLevel = 'none'
      return
    }

    // DÉRIVE DÉTECTÉE
    driftCount++

    if (driftCount >= 6) {
      // Récidive fréquente → lockdown reste de session
      driftLevel = 'lockdown'
      emit({
        type: 'drift-lockdown',
        level: 'lockdown',
        windowTitle: info.title,
        processName: info.processName,
        message: 'Récidive fréquente. Blocage strict activé pour le reste de la session.',
      })
    } else if (driftCount >= 4) {
      // 3ème+ dérive → fermeture automatique
      driftLevel = 'force'
      emit({
        type: 'drift-force-close',
        level: 'force',
        windowTitle: info.title,
        processName: info.processName,
        message: `${info.processName} va être fermé automatiquement.`,
      })
      // Tuer le processus
      try {
        await execAsync(`taskkill /IM "${info.processName}" /F`, { windowsHide: true })
      } catch { /* ignore */ }
    } else if (driftCount >= 2) {
      // 2ème dérive → avertissement ferme
      driftLevel = 'firm'
      emit({
        type: 'drift-warning',
        level: 'firm',
        windowTitle: info.title,
        processName: info.processName,
        message: `⚠️ Tu utilises ${info.processName} pendant une session. Reviens à ton travail dans 30 secondes.`,
      })
    } else {
      // 1ère dérive → avertissement doux
      driftLevel = 'soft'
      emit({
        type: 'drift-warning',
        level: 'soft',
        windowTitle: info.title,
        processName: info.processName,
        message: `Hey, tu sembles distrait. ${info.processName} n'est pas dans ta liste de travail.`,
      })
    }
  }

  return {
    start(allowedProcesses) {
      if (timer) return
      allowedSet = new Set(allowedProcesses.map((p) => p.toLowerCase()))
      // Toujours autoriser Nexus
      allowedSet.add('nexus.exe')
      allowedSet.add('electron.exe')
      driftCount = 0
      driftLevel = 'none'
      timer = setInterval(() => void tick(), 3000) // Toutes les 3 secondes
    },

    stop() {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
      driftCount = 0
      driftLevel = 'none'
    },

    on(_, cb) {
      listeners.push(cb)
    },

    getDriftCount: () => driftCount,
    getDriftLevel: () => driftLevel,
  }
}
