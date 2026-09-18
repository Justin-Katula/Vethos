import { app, type BrowserWindowConstructorOptions } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Icône Vethos utilisable par les fenêtres Electron.
 *
 * En dev, le fichier généré vit dans `build/` ou, au pire, dans les assets du
 * renderer. En application empaquetée, `electron-builder` copie `icon.ico`
 * dans `process.resourcesPath` via `extraResources`.
 */
export function resolveAppIconPath(): string | undefined {
  const resourcesPath =
    typeof process.resourcesPath === 'string' && process.resourcesPath.length > 0
      ? process.resourcesPath
      : null

  const candidates = [
    resourcesPath ? join(resourcesPath, 'icon.ico') : null,
    join(app.getAppPath(), 'build', 'icon.ico'),
    join(__dirname, '..', '..', 'build', 'icon.ico'),
    join(app.getAppPath(), 'src', 'renderer', 'src', 'assets', 'vethos-logo.png'),
  ]

  for (const candidate of candidates) {
    if (candidate === null) continue
    try {
      if (existsSync(candidate)) return candidate
    } catch {
      // Chemin illisible : on essaie le suivant.
    }
  }

  return undefined
}

export function appIconWindowOptions(): Pick<BrowserWindowConstructorOptions, 'icon'> {
  const icon = resolveAppIconPath()
  return icon === undefined ? {} : { icon }
}
