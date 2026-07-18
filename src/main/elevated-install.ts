import { exec as sudoExec } from 'sudo-prompt'
import { app } from 'electron'
import log from './logging/setup'

function quoteArg(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`
}

function relaunchElevated(flag: '--install-service' | '--uninstall-service'): Promise<boolean> {
  return new Promise((resolve) => {
    const appArg = process.defaultApp ? ` ${quoteArg(app.getAppPath())}` : ''
    sudoExec(`${quoteArg(process.execPath)}${appArg} ${flag}`, { name: 'Vethos' }, (err) => {
      if (err) {
        log.error('[elevated-install] échec de la relance élevée', err)
        resolve(false)
        return
      }
      resolve(true)
    })
  })
}

export const requestServiceInstall = (): Promise<boolean> => relaunchElevated('--install-service')

export const requestServiceUninstall = (): Promise<boolean> =>
  relaunchElevated('--uninstall-service')
