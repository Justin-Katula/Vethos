import { exec as sudoExec } from 'sudo-prompt'
import log from './logging/setup'

function quoteArg(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`
}

function relaunchElevated(flag: '--install-service' | '--uninstall-service'): Promise<boolean> {
  return new Promise((resolve) => {
    sudoExec(`${quoteArg(process.execPath)} ${flag}`, { name: 'Nexus' }, (err) => {
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
