import { execSync } from 'node:child_process'
import { app, dialog } from 'electron'
import { exec as sudoExec } from 'sudo-prompt'
import log from '@main/logging/setup'

const RELAUNCH_ENV_KEYS = [
  'ELECTRON_RENDERER_URL',
  'NODE_ENV_ELECTRON_VITE',
  'NODE_ENV',
  'ELECTRON_ENTRY',
  'ELECTRON_CLI_ARGS',
  'NO_SANDBOX',
  'REMOTE_DEBUGGING_PORT',
  'V8_INSPECTOR_PORT',
  'V8_INSPECTOR_BRK_PORT',
]

/**
 * Détecte si le process Electron tourne avec privilèges administrateur.
 * Stratégie rapide via API Windows (is-elevated est pure ESM, donc dynamic import
 * obligatoire depuis ce module CJS), avec fallback `net session`.
 */
export async function isElevated(): Promise<boolean> {
  if (process.platform !== 'win32') return true
  try {
    const { default: isElevatedFast } = await import('is-elevated')
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

function collectRelaunchEnv(): Record<string, string> | undefined {
  const env: Record<string, string> = {}
  for (const key of RELAUNCH_ENV_KEYS) {
    const value = process.env[key]
    if (typeof value === 'string' && value.length > 0) {
      env[key] = value
    }
  }
  return Object.keys(env).length > 0 ? env : undefined
}

export async function requestElevatedRelaunch(): Promise<boolean> {
  if (process.platform !== 'win32') return true
  const command = [process.execPath, ...process.argv.slice(1)].map(quoteArg).join(' ')
  const options: { name: string; env?: Record<string, string> } = { name: 'Nexus' }
  const env = collectRelaunchEnv()
  if (env) options.env = env

  let releasedInstanceLock = false
  try {
    app.releaseSingleInstanceLock()
    releasedInstanceLock = true
  } catch (err) {
    log.warn('unable to release single instance lock before elevated relaunch', err)
  }

  return new Promise((resolve) => {
    sudoExec(command, options, (err) => {
      if (err) {
        log.error('elevated relaunch failed', err)
        if (releasedInstanceLock && !app.requestSingleInstanceLock()) {
          log.warn('unable to reacquire single instance lock after elevated relaunch failure')
        }
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
    const relaunched = await requestElevatedRelaunch()
    return !relaunched
  }
  if (result.response === 2) {
    app.exit(0)
    return false
  }
  return true
}
