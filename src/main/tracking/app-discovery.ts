/**
 * app-discovery.ts
 *
 * Scanne les applications installées sur Windows via le registre.
 * Retourne une liste de {name, exePath} pour que l'utilisateur puisse
 * choisir quoi bloquer sans taper les noms à la main.
 */

import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import * as path from 'node:path'

const execAsync = promisify(exec)

export type DiscoveredApp = {
  name: string
  exeName: string
  exePath: string
  publisher: string
}

/**
 * Scanne le registre Windows pour les applications installées.
 * Interroge HKLM et HKCU Uninstall keys.
 */
export async function discoverInstalledApps(): Promise<DiscoveredApp[]> {
  const apps: DiscoveredApp[] = []
  const seen = new Set<string>()

  // PowerShell script pour lister les apps installées
  const script = `
    $paths = @(
      'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
      'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
      'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
    )
    $apps = foreach ($p in $paths) {
      Get-ItemProperty $p -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -and ($_.InstallLocation -or $_.DisplayIcon) } |
        Select-Object DisplayName, InstallLocation, DisplayIcon, Publisher
    }
    $apps | ConvertTo-Json -Depth 1
  `

  try {
    const { stdout } = await execAsync(
      `powershell -NoProfile -NonInteractive -Command "${script.replace(/"/g, '\\"')}"`,
      { windowsHide: true, maxBuffer: 10 * 1024 * 1024, timeout: 15000 },
    )

    const parsed = JSON.parse(stdout || '[]')
    const items = Array.isArray(parsed) ? parsed : [parsed]

    for (const item of items) {
      if (!item?.DisplayName) continue
      const name = String(item.DisplayName).trim()
      if (!name || seen.has(name.toLowerCase())) continue
      seen.add(name.toLowerCase())

      // Tenter de trouver l'exe
      let exePath = ''
      let exeName = ''

      // Essayer DisplayIcon (souvent le chemin de l'exe)
      if (item.DisplayIcon) {
        const iconPath = String(item.DisplayIcon).split(',')[0]?.trim() ?? ''
        if (iconPath.toLowerCase().endsWith('.exe')) {
          exePath = iconPath
          exeName = path.basename(iconPath)
        }
      }

      // Sinon essayer InstallLocation
      if (!exeName && item.InstallLocation) {
        const loc = String(item.InstallLocation).trim()
        if (loc) {
          // On met juste le dossier, l'utilisateur devra préciser l'exe
          exePath = loc
          exeName = ''
        }
      }

      if (exeName) {
        apps.push({
          name,
          exeName,
          exePath,
          publisher: item.Publisher ? String(item.Publisher).trim() : '',
        })
      }
    }
  } catch {
    // PowerShell non disponible ou erreur — on retourne une liste vide
  }

  // Ajouter aussi les apps UWP courantes
  try {
    const { stdout } = await execAsync(
      'powershell -NoProfile -NonInteractive -Command "Get-AppxPackage | Select-Object Name, PackageFamilyName | ConvertTo-Json"',
      { windowsHide: true, maxBuffer: 5 * 1024 * 1024, timeout: 10000 },
    )
    const uwpApps = JSON.parse(stdout || '[]')
    const items = Array.isArray(uwpApps) ? uwpApps : [uwpApps]
    for (const item of items) {
      if (!item?.Name) continue
      const name = String(item.Name)
      // Filtrer les noms système Microsoft
      if (name.startsWith('Microsoft.') && !name.includes('Office') && !name.includes('Teams')) continue
      if (name.startsWith('Windows.') || name.startsWith('windows.')) continue
      if (seen.has(name.toLowerCase())) continue
      seen.add(name.toLowerCase())
      // Les apps UWP n'ont pas un .exe simple, on les skip pour l'instant
    }
  } catch {
    // Ignore
  }

  // Trier par nom
  apps.sort((a, b) => a.name.localeCompare(b.name, 'fr'))

  return apps
}
