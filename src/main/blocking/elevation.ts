import { execSync } from 'node:child_process'
import { app, dialog } from 'electron'
import isElevatedFast from 'is-elevated'
import { exec as sudoExec } from 'sudo-prompt'
import log from '@main/logging/setup'

/**
 * Détecte si le process Electron tourne avec privilèges administrateur.
 * Stratégie rapide via API Windows, avec fallback `net session`.
 */
export async function isElevated(): Promise<boolean> {
  if (process.platform !== 'win32') return true
  try {
    return await isElevatedFast()
  } catch (err) {
    log.warn('fast elevation check failed, falling back to net session', err)
  }
  try {
    execSync('net session', { stdio: 'pipe', windowsHide: true })
    return true
  } catch {
    return false
  }
}

function quoteArg(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`
}

export async function requestElevatedRelaunch(): Promise<boolean> {
  if (process.platform !== 'win32') return true
  const command = [process.execPath, ...process.argv.slice(1)].map(quoteArg).join(' ')

  return new Promise((resolve) => {
    sudoExec(command, { name: 'Nexus' }, (err) => {
      if (err) {
        log.error('elevated relaunch failed', err)
        resolve(false)
        return
      }
      app.exit(0)
      resolve(true)
    })
  })
}

export async function ensureElevatedAtStartup(): Promise<boolean> {
  const elevated = await isElevated()
  if (elevated) return true

  const result = await dialog.showMessageBox({
    type: 'warning',
    title: 'Droits administrateur requis',
    message: 'Nexus a besoin des droits admin pour bloquer les sites et apps.',
    detail: 'Sans admin, le blocage ne fonctionnera pas réellement.',
    buttons: ['Relancer en administrateur', 'Continuer sans blocage', 'Quitter'],
    defaultId: 0,
    cancelId: 2,
  })

  if (result.response === 0) {
    await requestElevatedRelaunch()
    return false
  }
  if (result.response === 2) {
    app.exit(0)
    return false
  }
  return false
}
