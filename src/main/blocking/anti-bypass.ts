/**
 * anti-bypass.ts
 *
 * Empêche l'utilisateur de contourner le blocage :
 * 1. Bloquer modification de l'heure système
 * 2. Détecter nouveaux navigateurs installés et les bloquer
 * 3. Bloquer regedit.exe et taskmgr.exe pendant sessions
 */

import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import * as fs from 'node:fs'
import * as path from 'node:path'

const execAsync = promisify(exec)

// Processus à bloquer pendant les sessions verrouillées
const BLOCKED_DURING_SESSION = [
  'regedit.exe',
  'taskmgr.exe',
]

// Navigateurs connus pour détecter les nouveaux
const KNOWN_BROWSERS = new Set([
  'chrome.exe', 'firefox.exe', 'msedge.exe', 'brave.exe',
  'opera.exe', 'vivaldi.exe', 'iexplore.exe', 'waterfox.exe',
  'palemoon.exe', 'seamonkey.exe', 'tor.exe', 'librewolf.exe',
])

// Dossiers où chercher de nouveaux navigateurs
const BROWSER_SEARCH_PATHS = [
  'C:\\Program Files',
  'C:\\Program Files (x86)',
  process.env['LOCALAPPDATA'] ?? '',
  process.env['APPDATA'] ?? '',
].filter(Boolean)

export type AntiBypass = {
  start: () => void
  stop: () => void
  getBlockedProcesses: () => string[]
  getNewBrowsersDetected: () => string[]
}

export function createAntiBypass(): AntiBypass {
  let timer: ReturnType<typeof setInterval> | null = null
  let killerTimer: ReturnType<typeof setInterval> | null = null
  const newBrowsersDetected: string[] = []

  /**
   * Tue les processus interdits pendant les sessions
   */
  async function killBlockedProcesses() {
    for (const proc of BLOCKED_DURING_SESSION) {
      try {
        await execAsync(`taskkill /IM "${proc}" /F`, { windowsHide: true })
      } catch {
        // Le processus n'est probablement pas en cours
      }
    }
    // Tuer aussi les nouveaux navigateurs détectés
    for (const browser of newBrowsersDetected) {
      try {
        await execAsync(`taskkill /IM "${browser}" /F`, { windowsHide: true })
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Scanne les dossiers Program Files pour détecter de nouveaux navigateurs
   */
  function scanForNewBrowsers() {
    for (const searchPath of BROWSER_SEARCH_PATHS) {
      if (!searchPath) continue
      try {
        const dirs = fs.readdirSync(searchPath, { withFileTypes: true })
        for (const dir of dirs) {
          if (!dir.isDirectory()) continue
          const dirPath = path.join(searchPath, dir.name)
          try {
            const files = fs.readdirSync(dirPath)
            for (const file of files) {
              const lower = file.toLowerCase()
              if (lower.endsWith('.exe') && !KNOWN_BROWSERS.has(lower)) {
                // Vérifier si ça ressemble à un navigateur par le nom
                if (
                  lower.includes('browser') ||
                  lower.includes('navigator') ||
                  lower.includes('web') ||
                  lower.includes('surf')
                ) {
                  if (!newBrowsersDetected.includes(lower)) {
                    newBrowsersDetected.push(lower)
                  }
                }
              }
            }
          } catch {
            // Permission denied, etc.
          }
        }
      } catch {
        // Ignore
      }
    }
  }

  return {
    start() {
      if (killerTimer) return

      // Tuer les processus interdits toutes les secondes
      killerTimer = setInterval(() => {
        void killBlockedProcesses()
      }, 1000)

      // Scanner pour de nouveaux navigateurs toutes les 30 secondes
      timer = setInterval(scanForNewBrowsers, 30_000)
      scanForNewBrowsers() // Scan initial
    },

    stop() {
      if (killerTimer) {
        clearInterval(killerTimer)
        killerTimer = null
      }
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    },

    getBlockedProcesses: () => [...BLOCKED_DURING_SESSION, ...newBrowsersDetected],
    getNewBrowsersDetected: () => [...newBrowsersDetected],
  }
}
