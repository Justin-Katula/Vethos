import { app } from 'electron'
import { join } from 'node:path'
import log from 'electron-log/main'

/**
 * Module logging initialisé paresseusement.
 *
 * Pourquoi paresseux : ce module est importé en cascade par presque tous
 * les modules main (notamment via tracking/app-usage-tracker.ts et
 * blocking/session/timer.ts). Si on touche `app.getPath()` ou
 * `app.isPackaged` au top-level, les tests Vitest qui importent ces
 * modules sans avoir mocké `electron` plantent avec "Cannot read
 * properties of undefined (reading 'isPackaged')".
 *
 * La solution : tout faire dans `setupLogging()`, appelé une seule fois
 * depuis main/index.ts au boot. Les autres modules importent `log` (le
 * default export) qui reste utilisable même avant setup — electron-log
 * a des defaults raisonnables.
 */
let initialized = false

export function setupLogging(): void {
  if (initialized) return
  initialized = true

  log.initialize({ preload: true, spyRendererConsole: true })

  log.transports.file.resolvePathFn = (): string =>
    join(app.getPath('userData'), 'logs', 'vethos.log')
  log.transports.file.maxSize = 10 * 1024 * 1024
  log.transports.file.format =
    '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] [{processType}] {text}'
  log.transports.console.level = app.isPackaged ? false : 'silly'

  log.errorHandler.startCatching({
    showDialog: false,
    onError: ({ error, processType }) => {
      log.error('UNHANDLED', {
        processType,
        message: error.message,
        stack: error.stack,
      })
    },
  })
}

export function getLogFilePath(): string {
  return log.transports.file.getFile().path
}

export default log
