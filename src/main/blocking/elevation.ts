import { execSync } from 'node:child_process'

/**
 * Détecte si le process Electron tourne avec privilèges administrateur.
 * Stratégie : `net session` qui retourne != 0 sans admin sur Windows.
 */
export function isElevated(): boolean {
  try {
    execSync('net session', { stdio: 'pipe', windowsHide: true })
    return true
  } catch {
    return false
  }
}
