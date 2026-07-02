/**
 * app-discovery.ts
 *
 * Scanne les applications visibles par l'utilisateur sur Windows.
 * Retourne une liste de {name, exePath} pour que l'utilisateur puisse
 * choisir quoi bloquer sans taper les noms à la main.
 */

import { execFile as execFileCallback } from 'node:child_process'
import { app as electronApp, nativeImage } from 'electron'
import { promisify } from 'node:util'
import * as path from 'node:path'
import * as fs from 'node:fs'
import log from '@main/logging/setup'
import { getInstalledApps } from 'get-installed-apps'

const execFile = promisify(execFileCallback)

export type DiscoveredApp = {
  name: string
  exeName: string
  exePath: string
  publisher: string
  source?: AppSource
  packageId?: string
  hasExecutablePath?: boolean
  iconDataUrl?: string
  /** Sources locales supplémentaires, retirées avant l'envoi au renderer. */
  iconSourcePaths?: string[]
}

type ShortcutRecord = {
  Name?: unknown
  TargetPath?: unknown
  Arguments?: unknown
  IconLocation?: unknown
  ShortcutPath?: unknown
}

type RegistryRecord = {
  DisplayName?: unknown
  DisplayIcon?: unknown
  InstallLocation?: unknown
  Publisher?: unknown
  SystemComponent?: unknown
  NoDisplay?: unknown
  ReleaseType?: unknown
  ParentDisplayName?: unknown
  WindowsInstaller?: unknown
  UninstallString?: unknown
}

type AppPathRecord = {
  Name?: unknown
  ExePath?: unknown
  Publisher?: unknown
}

type ProgramFileRecord = {
  Name?: unknown
  ExePath?: unknown
  Publisher?: unknown
}

type WingetRecord = {
  Name?: unknown
  Id?: unknown
  PackageIdentifier?: unknown
  Publisher?: unknown
  Source?: unknown
}

type AppxRecord = {
  DisplayName?: unknown
  ExecutablePath?: unknown
  PackageFamilyName?: unknown
  Publisher?: unknown
  AliasExeName?: unknown
  InstallLocation?: unknown
  LogoPath?: unknown
}

type AppSource = 'shortcut' | 'registry' | 'appPath' | 'programFiles' | 'winget' | 'appx'

type AppCandidate = DiscoveredApp & {
  source: AppSource
  score: number
}

const NON_USER_APP_RE =
  /\b(uninstall|uninstaller|unins\d*|setup|installer|install manager|update|updater|maintenance|repair|service|daemon|driver|driverpack|diagnostic|diagnostics|bug report|crash|redistributable|redist|runtime|sdk|component|helper|bootstrapper|framework|vcredist|msvc|visual c\+\+|chipset|firmware|middleware|webview2?|cleanup|utility|verifier|extractor|accelerator|shader|shaders|vulkan|openal|physx|directx|opengl|nvidia|realtek|intel|amd|hotfix|controller|agent|host|engine|library|libraries|package|packages|patch)\b/i

const NON_USER_EXE_RE =
  /[\\/][^\\/]*(unins\d*|uninstall|setup|installer|install|cleanup|updater?|maintenance|repair|service|daemon|helper|crash|bugreport|bootstrapper|elevator|utility|verify|verifier|extractor|accelerator|tunnel)[^\\/]*\.exe$/i

/** Paths containing these directory segments are internal tools, not user apps. */
const NON_USER_PATH_SEGMENT_RE =
  /[\\/](usr[\\/]bin|usr[\\/]libexec|resources|helpers|vendor|node_modules|__pycache__|electron[\\/]dist|squirrel|scripts|tools|autoupdate|autoupdater|__installer|__updater|bin[\\/](x86|x64|amd64|arm64))[\\/]/i

/**
 * Display names that are clearly not user-facing applications:
 * - Pure version numbers ("1.3", "2.0.1")
 * - Very short names (1-2 chars)
 * - Generic internal tool names
 */
const NON_USER_NAME_RE =
  /^(\d[\d.]*\w*|.{1,2}|bin|lib|libexec|scripts|tools|resources|helpers|install|setup|updater|cleanup|uninstall|x64|x86|amd64|arm64|host|worker|agent|server|client|proxy|bridge|wrapper|stub|shim|loader|launcher|monitor|watcher|tray|icon|elevate|elevator|crashpad|crashreporter|minidump|gpu[._]process|renderer|zygote|nacl|pnacl|mojo)$/i

const VERSION_OR_ARCH_NAME_RE =
  /^(?:v?\d+(?:[._-]\d+)+(?:[._-]?[a-z]+)?|(?:x86|x64|amd64|arm64|\d{2}\s*-?\s*bit))(?:\s*(?:x86|x64|amd64|arm64|\d{2}\s*-?\s*bit))?$/i

/**
 * Scanne les applications visibles par l'utilisateur sur Windows en s'alignant sur
 * la liste des paramètres d'installation de Windows. Utilise le registre et AppX
 * comme uniques sources primaires.
 */
export async function discoverInstalledApps(): Promise<DiscoveredApp[]> {
  log.info('[app-discovery] start refined scan')

  // 1. Get Get-StartApps localized name mappings
  const startAppsMap = new Map<string, string>()
  try {
    const startAppsScript = `Get-StartApps | ConvertTo-Json`
    const { stdout } = await execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', startAppsScript],
      { windowsHide: true, maxBuffer: 15 * 1024 * 1024, timeout: 10000 },
    )
    const items = parseJsonArray<{ Name?: string; AppID?: string }>(stdout)
    for (const app of items) {
      const appid = app.AppID || ''
      const name = app.Name || ''
      if (appid.includes('!') && name) {
        const parts = appid.split('!')
        const pkgFamily = (parts[0] || '').toLowerCase()
        if (pkgFamily) {
          const existing = startAppsMap.get(pkgFamily)
          if (!existing || name.length < existing.length) {
            startAppsMap.set(pkgFamily, name)
          }
        }
      }
    }
  } catch (err) {
    log.warn('[app-discovery] Get-StartApps query failed', err)
  }

  // 2. Read start menu shortcuts for resolving exe paths
  let shortcutRecords: ShortcutRecord[] = []
  try {
    shortcutRecords = await readStartMenuShortcuts()
  } catch (err) {
    log.warn('[app-discovery] shortcuts read failed', err)
  }

  const shortcutMap = new Map<string, string>()
  const shortcutIconMap = new Map<string, string>()
  const shortcutIconLocMap = new Map<string, string>()
  for (const s of shortcutRecords) {
    const name = normalizeDisplayName(String(s.Name || ''))
    const canonical = canonicalNameKey(name)
    let target = normalizeExePath(String(s.TargetPath || ''))
    const args = String(s.Arguments || '')

    const shortcutPath = normalizeLocalPath(String(s.ShortcutPath || ''))
    if (canonical && shortcutPath && fs.existsSync(shortcutPath)) {
      shortcutIconMap.set(canonical, shortcutPath)
    }

    const iconLoc = extractIconPathFromDisplayIcon(String(s.IconLocation || ''))
    if (canonical && iconLoc && fs.existsSync(iconLoc)) {
      shortcutIconLocMap.set(canonical, iconLoc)
    }

    if (/chrome_proxy\.exe$/i.test(target) && /--app-id=/i.test(args)) {
      target = path.join(path.dirname(target), 'chrome.exe')
    }

    if (/update\.exe$/i.test(target) && /--processStart/i.test(args)) {
      const match = /--processStart\s+([^\s"]+\.exe)/i.exec(args)
      if (match?.[1]) {
        const appExe = match[1]
        const parentDir = path.dirname(target)
        let resolvedPath = path.join(parentDir, appExe)
        try {
          const dirs = fs.readdirSync(parentDir)
          for (const dir of dirs) {
            if (dir.startsWith('app-')) {
              const fullPath = path.join(parentDir, dir, appExe)
              if (fs.existsSync(fullPath)) {
                resolvedPath = fullPath
                break
              }
            }
          }
        } catch {
          // Ignore unreadable updater directories during broad app discovery.
        }
        target = resolvedPath
      }
    }

    if (name && target && isUserFacingExe(target)) {
      shortcutMap.set(canonical, target)
    }
  }

  // 3. Scan AppX Packages
  let appxRecords: AppxRecord[] = []
  try {
    appxRecords = await readAppxPackages()
  } catch (err) {
    log.warn('[app-discovery] AppX read failed', err)
  }

  const candidates: AppCandidate[] = []

  for (const pkg of appxRecords) {
    const family = String(pkg.PackageFamilyName || '')
    const lowerFamily = family.toLowerCase()

    let name = normalizeDisplayName(String(pkg.DisplayName || ''))
    if (startAppsMap.has(lowerFamily)) {
      name = normalizeDisplayName(startAppsMap.get(lowerFamily)!)
    }

    const lowerName = name.toLowerCase()

    let isSystem = false
    for (const prefix of APPX_SYSTEM_PREFIXES) {
      if (lowerName.startsWith(prefix) || lowerFamily.startsWith(prefix)) {
        isSystem = true
        break
      }
    }
    if (APPX_SYSTEM_NAMES.has(lowerName)) isSystem = true
    if (APPX_KEYWORD_RE.test(name) || APPX_KEYWORD_RE.test(family)) isSystem = true
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(name)) isSystem = true
    if (pkg.ExecutablePath && /SystemApps/i.test(String(pkg.ExecutablePath))) isSystem = true

    if (!isSystem && name) {
      const exePath = normalizeExePath(String(pkg.ExecutablePath || ''))
      const logoPath = resolveLocalLogoPath(String(pkg.LogoPath || ''))
      const aliasExeName = String(pkg.AliasExeName || '')
      let exeName = ''
      if (aliasExeName && aliasExeName.toLowerCase().endsWith('.exe')) {
        exeName = aliasExeName
      } else if (exePath) {
        exeName = path.basename(exePath)
      }

      candidates.push({
        name,
        exeName,
        exePath: exePath || '',
        publisher: String(pkg.Publisher || '').trim(),
        source: 'appx',
        score: scoreCandidate('appx', name, exePath || ''),
        packageId: family || undefined,
        hasExecutablePath: Boolean(exePath || aliasExeName),
        ...(logoPath ? { iconSourcePaths: [logoPath] } : {}),
      })
    }
  }

  // 4. Scan Registry Uninstall Keys
  let registryRecords: RegistryRecord[] = []
  try {
    registryRecords = await readRegistryApps()
  } catch (err) {
    log.warn('[app-discovery] Registry read failed', err)
  }

  for (const item of registryRecords) {
    if (isHiddenRegistryEntry(item)) continue
    const name = normalizeDisplayName(String(item.DisplayName || ''))
    if (!name) continue

    const uninstStr = String(item.UninstallString || '')
    const isSteamGame = /steam:\/\/uninstall\/|steam\.exe/i.test(uninstStr)
    const canonical = canonicalNameKey(name)
    const registryIconPath = extractIconPathFromDisplayIcon(String(item.DisplayIcon || ''))
    const installLocation = normalizeLocalPath(String(item.InstallLocation || ''))

    let exePath = ''

    // A. DisplayIcon
    if (!exePath) {
      const p = extractExePathFromDisplayIcon(String(item.DisplayIcon || ''))
      if (p && isUserFacingExe(p)) {
        if (!isSteamGame || !/steam\.exe$/i.test(p)) {
          exePath = p
        }
      }
    }

    // B. UninstallString (for PWAs, etc.)
    if (!exePath && !isSteamGame) {
      const p = extractExePath(uninstStr)
      if (p && isUserFacingExe(p)) {
        exePath = p
      }
    }

    // C. Shortcut Mapping (Fuzzy)
    if (!exePath) {
      exePath = findFuzzyMappedPath(shortcutMap, name)
    }

    // E. Scan InstallLocation. Registry entries remain in the inventory even
    // when Windows does not expose a resolvable process target.
    if (!exePath && installLocation) {
      const loc = installLocation
      if (loc && fs.existsSync(loc)) {
        const exes = findExesInDir(loc, 2).filter((e) => isUserFacingExe(e))
        if (exes.length > 0) {
          const cleanApp = cleanString(name)
          const scored = exes.map((e) => {
            const base = path.basename(e, '.exe')
            const cleanBase = cleanString(base)
            let score = 0
            if (cleanBase === cleanApp) {
              score += 100
            } else if (cleanApp.includes(cleanBase) || cleanBase.includes(cleanApp)) {
              score += 10
            }
            score -= e.split(path.sep).length * 0.1
            return { path: e, score }
          })
          scored.sort((a, b) => b.score - a.score)
          if (scored[0]) {
            exePath = scored[0].path
          }
        }
      }
    }

    let hasExecutablePath = false
    let exeName = ''

    if (exePath && isUserFacingExe(exePath)) {
      hasExecutablePath = true
      exeName = path.basename(exePath)
    } else {
      exePath = ''
      exeName = ''
    }

    const shortcutIconPath = findFuzzyMappedPath(shortcutIconMap, name)
    const shortcutIconLocPath = findFuzzyMappedPath(shortcutIconLocMap, name)
    const hasValidIconPath =
      (registryIconPath && fs.existsSync(registryIconPath)) ||
      (shortcutIconLocPath && fs.existsSync(shortcutIconLocPath)) ||
      (shortcutIconPath && fs.existsSync(shortcutIconPath))
    const localAssetPath =
      !hasValidIconPath && installLocation && fs.existsSync(installLocation)
        ? findLocalIconAsset(installLocation, name)
        : ''
    let fallbackExeIcon = ''
    if (!hasValidIconPath && !localAssetPath && installLocation && fs.existsSync(installLocation)) {
      const allExes = findExesInDir(installLocation, 2)
      if (allExes.length > 0) {
        const cleanApp = cleanString(name)
        const scored = allExes.map((e) => {
          const base = path.basename(e, '.exe')
          const cleanBase = cleanString(base)
          let score = 0
          if (cleanBase === cleanApp) {
            score += 100
          } else if (cleanApp.includes(cleanBase) || cleanBase.includes(cleanApp)) {
            score += 10
          }
          score -= e.split(path.sep).length * 0.1
          return { path: e, score }
        })
        scored.sort((a, b) => b.score - a.score)
        fallbackExeIcon = scored[0]!.path
      }
    }
    const iconSourcePaths = uniqueLocalPaths([
      registryIconPath || '',
      shortcutIconLocPath,
      shortcutIconPath,
      localAssetPath,
      fallbackExeIcon,
    ])
    candidates.push({
      name,
      exeName,
      exePath,
      publisher: String(item.Publisher || '').trim(),
      source: 'registry',
      score: scoreCandidate('registry', name, exePath),
      hasExecutablePath,
      ...(iconSourcePaths.length > 0 ? { iconSourcePaths } : {}),
    })
  }

  // 5. Merge and deduplicate by canonical name
  const mergedApps = mergeCandidates(candidates)

  const apps = await attachAppIcons(mergedApps)
  log.info(`[app-discovery] count=${apps.length}`)
  return apps
}

const iconCache = new Map<string, string | null>()

async function attachAppIcons(apps: DiscoveredApp[]): Promise<DiscoveredApp[]> {
  if (process.platform !== 'win32') return apps

  const results = new Array<DiscoveredApp>(apps.length)
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(8, apps.length) }, async () => {
    while (nextIndex < apps.length) {
      const index = nextIndex++
      const app = apps[index]!
      const { iconSourcePaths, ...publicApp } = app
      // L'icône de l'exécutable était la source historique la plus fiable.
      // Les raccourcis et ressources avancées restent des solutions de secours.
      const sources = buildIconSourceOrder(app.exePath, iconSourcePaths, app.source, app.packageId)
      const iconDataUrl = await getIconDataUrl(sources)
      results[index] = iconDataUrl ? { ...publicApp, iconDataUrl } : publicApp
    }
  })
  await Promise.all(workers)
  return results
}

function getPathScore(filePath: string, isPackaged = false): number {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.ico' || ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.webp') {
    return 100 // Dedicated image assets are most preferred
  }
  if (isPackaged) {
    if (ext === '.lnk') return 50
    if (ext === '.exe') return 10
  } else {
    if (ext === '.exe') return 50
    if (ext === '.lnk') return 10
  }
  return 0
}

function buildIconSourceOrder(
  exePath: string,
  fallbackPaths?: string[],
  source?: AppSource,
  packageId?: string,
): string[] {
  const allPaths = uniqueLocalPaths([
    ...(fallbackPaths ?? []),
    exePath
  ])

  const isPackaged = source === 'appx' || Boolean(packageId)

  return allPaths.sort((a, b) => getPathScore(b, isPackaged) - getPathScore(a, isPackaged))
}

const GENERIC_ICON_SIGNATURES = [
  'iVBORw0KGgoAAAANSUhEUgAAACAgAAAAIAYAAABzenr0AAAByklEQVRYhe1WQUoDQRCs2Sh4CAreo3',
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAByklEQVRYhe1WQUoDQRCs2Sh4CAreo3',
  'iVBORw0KGgoAAAANSUhEUgAAACAgAAAAIAYAAABzenr0AAAB6UlEQVRYhe2WTUsbURSG37kJk4mGZJ',
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAB6UlEQVRYhe2WTUsbURSG37kJk4mGZJ'
]

function isGenericWindowsIcon(dataUrl: string): boolean {
  return GENERIC_ICON_SIGNATURES.some((sig) => dataUrl.includes(sig))
}

async function extractIconWithPowerShell(filePath: string): Promise<string | null> {
  const script = `
    Add-Type -AssemblyName System.Drawing
    $icon = [System.Drawing.Icon]::ExtractAssociatedIcon("${filePath.replace(/"/g, '""')}")
    $bitmap = $icon.ToBitmap()
    $ms = New-Object System.IO.MemoryStream
    $bitmap.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bytes = $ms.ToArray()
    $ms.Dispose()
    $bitmap.Dispose()
    $icon.Dispose()
    [Convert]::ToBase64String($bytes)
  `
  const buffer = Buffer.from(script, 'utf16le')
  const encoded = buffer.toString('base64')

  try {
    const { stdout } = await execFile('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-EncodedCommand',
      encoded
    ], { timeout: 4000, windowsHide: true })
    const base64 = stdout.trim()
    if (base64) {
      return `data:image/png;base64,${base64}`
    }
  } catch (err) {
    log.warn('[app-discovery] PowerShell icon extraction failed', { filePath, err })
  }
  return null
}

async function getIconDataUrl(sourcePaths: string[]): Promise<string | null> {
  for (const sourcePath of sourcePaths) {
    const key = sourcePath.toLowerCase()
    if (iconCache.has(key)) {
      const cached = iconCache.get(key) ?? null
      if (cached) return cached
      continue
    }

    try {
      if (!electronApp || typeof electronApp.isReady !== 'function' || !electronApp.isReady()) {
        // Do not cache null permanently if the app is not ready yet
        continue
      }
      const isImageFile = /\.(?:ico|png|jpe?g|webp)$/i.test(sourcePath)
      const image = isImageFile
        ? nativeImage.createFromPath(sourcePath)
        : await electronApp.getFileIcon(sourcePath, { size: 'normal' })
      const resized = image.isEmpty()
        ? image
        : image.resize({ width: 32, height: 32, quality: 'good' })
      let dataUrl = resized.isEmpty() ? null : resized.toDataURL()
      
      if (dataUrl && isGenericWindowsIcon(dataUrl)) {
        if (process.platform === 'win32') {
          const psDataUrl = await extractIconWithPowerShell(sourcePath)
          if (psDataUrl && !isGenericWindowsIcon(psDataUrl)) {
            dataUrl = psDataUrl
          } else {
            iconCache.set(key, null)
            continue
          }
        } else {
          iconCache.set(key, null)
          continue
        }
      }
      
      iconCache.set(key, dataUrl)
      if (dataUrl) return dataUrl
    } catch (err) {
      iconCache.set(key, null)
      log.warn('[app-discovery] icon read failed', { sourcePath, err })
    }
  }
  return null
}

async function readStartMenuShortcuts(): Promise<ShortcutRecord[]> {
  const script = `
    $OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $roots = @(
      (Join-Path $env:ProgramData 'Microsoft\\Windows\\Start Menu\\Programs'),
      (Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs'),
      (Join-Path $env:PUBLIC 'Desktop'),
      ([Environment]::GetFolderPath('Desktop'))
    )
    $shell = New-Object -ComObject WScript.Shell
    $items = foreach ($root in $roots) {
      if (Test-Path -LiteralPath $root) {
        Get-ChildItem -LiteralPath $root -Filter *.lnk -Recurse -ErrorAction SilentlyContinue |
          ForEach-Object {
            try {
              $shortcut = $shell.CreateShortcut($_.FullName)
              [pscustomobject]@{
                Name = [IO.Path]::GetFileNameWithoutExtension($_.Name)
                TargetPath = $shortcut.TargetPath
                Arguments = $shortcut.Arguments
                IconLocation = $shortcut.IconLocation
                ShortcutPath = $_.FullName
              }
            } catch {}
          }
      }
    }
    @($items) | ConvertTo-Json -Depth 2
  `

  const { stdout } = await execFile(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { windowsHide: true, maxBuffer: 10 * 1024 * 1024, timeout: 15000 },
  )
  return parseJsonArray<ShortcutRecord>(stdout)
}

async function readRegistryApps(): Promise<RegistryRecord[]> {
  try {
    const rawApps = (await getInstalledApps()) as Array<Record<string, unknown>>
    return rawApps.map((app) => ({
      DisplayName: app.appName || app.DisplayName,
      InstallLocation: app.InstallLocation,
      DisplayIcon: app.DisplayIcon,
      Publisher: app.appPublisher || app.Publisher,
      SystemComponent: app.SystemComponent,
      NoDisplay: app.NoDisplay,
      ReleaseType: app.ReleaseType,
      UninstallString: app.UninstallString,
      ParentDisplayName: app.ParentDisplayName,
    }))
  } catch (err) {
    log.error('[app-discovery] getInstalledApps native query failed', err)
    return []
  }
}

async function readAppPathRegistry(): Promise<AppPathRecord[]> {
  const script = `
    $OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $roots = @(
      'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths',
      'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths',
      'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths'
    )
    $apps = foreach ($root in $roots) {
      if (Test-Path -LiteralPath $root) {
        Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue |
          ForEach-Object {
            try {
              $key = Get-Item -LiteralPath $_.PSPath
              $exe = $key.GetValue('')
              if (-not $exe) { $exe = $key.GetValue('Path') }
              [pscustomobject]@{
                Name = [IO.Path]::GetFileNameWithoutExtension($_.PSChildName)
                ExePath = $exe
                Publisher = ''
              }
            } catch {}
          }
      }
    }
    @($apps) | ConvertTo-Json -Depth 2
  `

  const { stdout } = await execFile(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { windowsHide: true, maxBuffer: 10 * 1024 * 1024, timeout: 15000 },
  )
  return parseJsonArray<AppPathRecord>(stdout)
}

async function readProgramFilesExecutables(): Promise<ProgramFileRecord[]> {
  const script = `
    $OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $roots = @(
      $env:ProgramFiles,
      [Environment]::GetEnvironmentVariable('ProgramFiles(x86)'),
      (Join-Path $env:LOCALAPPDATA 'Programs')
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique
    $apps = foreach ($root in $roots) {
      Get-ChildItem -LiteralPath $root -Filter *.exe -File -Recurse -Depth 3 -ErrorAction SilentlyContinue |
        Where-Object {
          $_.FullName -notmatch '[\\\\/](resources|helpers|vendor|node_modules|__pycache__|electron[\\\\/]dist|squirrel|scripts|tools|autoupdate|autoupdater|__installer|__updater|bin[\\\\/](x86|x64|amd64|arm64))[\\\\/]'
        } |
        ForEach-Object {
          try {
            $version = $_.VersionInfo
            $name = $version.FileDescription
            if (-not $name -or $name -match '^(bin|lib|libexec|scripts|tools|resources|helpers|x64|x86|amd64|arm64)$') {
              $name = $_.BaseName
            }
            [pscustomobject]@{
              Name = $name
              ExePath = $_.FullName
              Publisher = $version.CompanyName
            }
          } catch {}
        }
    }
    @($apps) | ConvertTo-Json -Depth 2
  `

  const { stdout } = await execFile(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { windowsHide: true, maxBuffer: 25 * 1024 * 1024, timeout: 25000 },
  )
  return parseJsonArray<ProgramFileRecord>(stdout)
}

async function readWingetApps(): Promise<WingetRecord[]> {
  const jsonArgs = ['list', '--accept-source-agreements', '--output', 'json']
  try {
    const { stdout } = await execFile('winget', jsonArgs, {
      windowsHide: true,
      maxBuffer: 25 * 1024 * 1024,
      timeout: 25000,
    })
    const parsed = parseWingetJson(stdout)
    if (parsed.length > 0) return parsed
  } catch (err) {
    log.warn('[app-discovery] winget json scan failed, falling back to text', err)
  }

  const { stdout } = await execFile(
    'winget',
    ['list', '--accept-source-agreements'],
    { windowsHide: true, maxBuffer: 25 * 1024 * 1024, timeout: 25000 },
  )
  return parseWingetTable(stdout)
}

async function readAppxPackages(): Promise<AppxRecord[]> {
  let aliases: Map<string, string> = new Map()
  try {
    aliases = await readWindowsAppsAliases()
  } catch (err) {
    log.warn('[app-discovery] WindowsApps alias scan failed', err)
  }

  const script = `
    $OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $apps = Get-AppxPackage | Where-Object { -not $_.IsFramework } | ForEach-Object {
      $pkg = $_
      $displayName = $pkg.Name
      $exePath = ''
      $logoPath = ''
      $publisher = ''
      $manifestPath = Join-Path $pkg.InstallLocation 'AppxManifest.xml'
      if (Test-Path -LiteralPath $manifestPath -ErrorAction SilentlyContinue) {
        try {
          [xml]$manifest = Get-Content -LiteralPath $manifestPath -ErrorAction SilentlyContinue
          $dn = $manifest.Package.Properties.DisplayName
          if ($dn -and $dn -notmatch '^ms-resource:') {
            $displayName = $dn
          }
          $pub = $manifest.Package.Properties.PublisherDisplayName
          if ($pub -and $pub -notmatch '^ms-resource:') {
            $publisher = $pub
          } else {
            $publisher = $pkg.Publisher
          }
          $appElements = $manifest.Package.Applications.Application
          if ($appElements) {
            $firstApp = if ($appElements -is [array]) { $appElements[0] } else { $appElements }
            $exe = $firstApp.Executable
            if ($exe) {
              $exePath = Join-Path $pkg.InstallLocation $exe
            }
          }
          $visual = $manifest.SelectSingleNode("//*[local-name()='VisualElements']")
          $logo = if ($visual) { $visual.GetAttribute('Square44x44Logo') } else { '' }
          if (-not $logo) {
            $logoNode = $manifest.SelectSingleNode("//*[local-name()='Properties']/*[local-name()='Logo']")
            if ($logoNode) { $logo = $logoNode.InnerText }
          }
          if ($logo) {
            $logoPath = Join-Path $pkg.InstallLocation $logo
          }
        } catch {
          // Ignore unreadable updater directories during broad app discovery.
        }
      }
      [pscustomobject]@{
        DisplayName = $displayName
        ExecutablePath = $exePath
        PackageFamilyName = $pkg.PackageFamilyName
        Publisher = $publisher
        InstallLocation = $pkg.InstallLocation
        LogoPath = $logoPath
      }
    }
    @($apps) | ConvertTo-Json -Depth 2
  `

  const { stdout } = await execFile(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { windowsHide: true, maxBuffer: 10 * 1024 * 1024, timeout: 20000 },
  )
  const records = parseJsonArray<AppxRecord>(stdout)

  return records.map((record) => {
    const family = String(record.PackageFamilyName ?? '').toLowerCase()
    const aliasExe = aliases.get(family)
    return aliasExe ? { ...record, AliasExeName: aliasExe } : record
  })
}

async function readWindowsAppsAliases(): Promise<Map<string, string>> {
  const winAppsDir = path.join(process.env['LOCALAPPDATA'] ?? '', 'Microsoft', 'WindowsApps')
  const escapedDir = winAppsDir.replace(/\\/g, '\\\\')

  const script = `
    $OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $dir = '${escapedDir}'
    $results = @()
    if (Test-Path -LiteralPath $dir) {
      Get-ChildItem -LiteralPath $dir -Filter '*.exe' -File -ErrorAction SilentlyContinue |
        ForEach-Object {
          $results += [pscustomobject]@{ ExeName = $_.Name; PackageFamily = '' }
        }
      Get-ChildItem -LiteralPath $dir -Directory -ErrorAction SilentlyContinue |
        ForEach-Object {
          $subDir = $_
          Get-ChildItem -LiteralPath $subDir.FullName -Filter '*.exe' -File -ErrorAction SilentlyContinue |
            ForEach-Object {
              $results += [pscustomobject]@{ ExeName = $_.Name; PackageFamily = $subDir.Name }
            }
        }
    }
    @($results) | ConvertTo-Json -Depth 2
  `

  const { stdout } = await execFile(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { windowsHide: true, maxBuffer: 10 * 1024 * 1024, timeout: 10000 },
  )

  const items = parseJsonArray<{ ExeName?: string; PackageFamily?: string }>(stdout)
  const map = new Map<string, string>()
  for (const item of items) {
    const exeName = String(item.ExeName ?? '').trim()
    const family = String(item.PackageFamily ?? '').trim().toLowerCase()
    if (exeName && family) {
      map.set(family, exeName)
    }
  }
  return map
}

function buildShortcutCandidates(items: ShortcutRecord[]): AppCandidate[] {
  return items.flatMap((item) => {
    const rawTarget = String(item.TargetPath ?? '')
    const rawArgs = String(item.Arguments ?? '')
    const exePath = normalizeExePath(rawTarget)
    const name = normalizeDisplayName(String(item.Name ?? ''))
    if (!name || !exePath) return []

    if (/chrome_proxy\.exe$/i.test(exePath) && /--app-id=/i.test(rawArgs)) {
      const chromeDir = path.dirname(exePath)
      const chromeExe = path.join(chromeDir, 'chrome.exe')
      return [
        {
          name,
          exeName: 'chrome.exe',
          exePath: chromeExe,
          publisher: 'Google',
          source: 'shortcut',
          score: scoreCandidate('shortcut', name, chromeExe),
          hasExecutablePath: true,
        },
      ]
    }

    if (/update\.exe$/i.test(exePath) && /--processStart/i.test(rawArgs)) {
      const match = /--processStart\s+([^\s"]+\.exe)/i.exec(rawArgs)
      if (match?.[1]) {
        const appExe = match[1]
        const parentDir = path.dirname(exePath)
        let resolvedPath = path.join(parentDir, appExe)
        try {
          const dirs = fs.readdirSync(parentDir)
          for (const dir of dirs) {
            if (dir.startsWith('app-')) {
              const fullPath = path.join(parentDir, dir, appExe)
              if (fs.existsSync(fullPath)) {
                resolvedPath = fullPath
                break
              }
            }
          }
        } catch {
          // Ignore unreadable updater directories during legacy shortcut discovery.
        }
        return [
          {
            name,
            exeName: appExe,
            exePath: resolvedPath,
            publisher: '',
            source: 'shortcut',
            score: scoreCandidate('shortcut', name, resolvedPath),
            hasExecutablePath: true,
          },
        ]
      }
    }

    return toCandidate({ name, exePath, publisher: '', source: 'shortcut' })
  })
}

function buildRegistryCandidates(items: RegistryRecord[]): AppCandidate[] {
  return items.flatMap<AppCandidate>((item) => {
    if (isHiddenRegistryEntry(item)) return []
    const name = normalizeDisplayName(String(item.DisplayName ?? ''))
    const exePath =
      extractExePathFromDisplayIcon(String(item.DisplayIcon ?? '')) ||
      normalizeExePath(String(item.InstallLocation ?? ''))
    if (!name) return []
    if (exePath) {
      return [
        {
          name,
          exeName: path.basename(exePath),
          exePath,
          publisher: String(item.Publisher ?? '').trim(),
          source: 'registry',
          score: scoreCandidate('registry', name, exePath),
          hasExecutablePath: true,
        },
      ]
    }
    return [
      {
        name,
        exeName: '',
        exePath: '',
        publisher: String(item.Publisher ?? '').trim(),
        source: 'registry',
        score: scoreCandidate('registry', name, ''),
        hasExecutablePath: false,
      },
    ]
  })
}

function buildAppPathCandidates(items: AppPathRecord[]): AppCandidate[] {
  return items.flatMap((item) => {
    const name = normalizeDisplayName(String(item.Name ?? ''))
    const exePath = normalizeExePath(String(item.ExePath ?? ''))
    if (!name || !exePath) return []
    return toCandidate({
      name,
      exePath,
      publisher: String(item.Publisher ?? '').trim(),
      source: 'appPath',
    })
  })
}

function buildProgramFileCandidates(items: ProgramFileRecord[]): AppCandidate[] {
  return items.flatMap((item) => {
    const name = normalizeDisplayName(String(item.Name ?? ''))
    const exePath = normalizeExePath(String(item.ExePath ?? ''))
    if (!name || !exePath) return []
    return toCandidate({
      name,
      exePath,
      publisher: String(item.Publisher ?? '').trim(),
      source: 'programFiles',
    })
  })
}

function buildWingetCandidates(items: WingetRecord[]): AppCandidate[] {
  return items.flatMap((item) => {
    const name = normalizeDisplayName(String(item.Name ?? ''))
    const packageId = String(item.Id ?? item.PackageIdentifier ?? '').trim()
    if (!name || isLikelyNonUserDisplayName(name) || isLikelyNonUserWingetPackage(name, packageId)) {
      return []
    }
    return [
      {
        name,
        exeName: '',
        exePath: '',
        publisher: String(item.Publisher ?? '').trim(),
        source: 'winget',
        score: scoreCandidate('winget', name, ''),
        packageId: packageId || undefined,
        hasExecutablePath: false,
      },
    ]
  })
}

function buildAppxCandidates(items: AppxRecord[]): AppCandidate[] {
  return items.flatMap((item) => {
    const name = normalizeDisplayName(String(item.DisplayName ?? ''))
    const packageFamily = String(item.PackageFamilyName ?? '').trim()
    if (!name || isLikelyNonUserDisplayName(name) || isLikelyNonUserAppxPackage(name, packageFamily)) {
      return []
    }

    const exePath = normalizeExePath(String(item.ExecutablePath ?? ''))
    const aliasExeName = String(item.AliasExeName ?? '').trim()

    let exeName = ''
    if (aliasExeName && aliasExeName.toLowerCase().endsWith('.exe')) {
      exeName = aliasExeName
    } else if (exePath) {
      exeName = path.basename(exePath)
    }

    const hasExecutablePath = Boolean(exePath || aliasExeName)

    return [
      {
        name,
        exeName,
        exePath: exePath || '',
        publisher: String(item.Publisher ?? '').trim(),
        source: 'appx',
        score: scoreCandidate('appx', name, exePath || ''),
        packageId: packageFamily || undefined,
        hasExecutablePath,
      },
    ]
  })
}

function toCandidate(args: {
  name: string
  exePath: string
  publisher: string
  source: AppCandidate['source']
}): AppCandidate[] {
  const exePath = normalizeExePath(args.exePath)
  const exeName = path.basename(exePath)
  if (!isLikelyUserFacingApp({ name: args.name, exeName, exePath }, args.source)) return []

  return [
    {
      name: args.name,
      exeName,
      exePath,
      publisher: args.publisher,
      source: args.source,
      score: scoreCandidate(args.source, args.name, exePath),
      hasExecutablePath: true,
    },
  ]
}

function mergeCandidates(candidates: AppCandidate[]): DiscoveredApp[] {
  const finalApps = new Map<string, AppCandidate>()

  for (const sourceCandidate of candidates) {
    let candidate = sourceCandidate
    // 1. Exclude system packages for AppX
    if (candidate.source === 'appx' && candidate.packageId) {
      if (isLikelyNonUserAppxPackage(candidate.name, candidate.packageId)) {
        continue
      }
    }

    // 2. Validate real blocking targets. Inventory-only entries have no
    // executable name instead of receiving a guessed process name.
    if (candidate.hasExecutablePath) {
      if (!isLikelyUserFacingApp({
        name: candidate.name,
        exeName: candidate.exeName,
        exePath: candidate.exePath,
      }, candidate.source)) {
        candidate = {
          ...candidate,
          exeName: '',
          exePath: '',
          hasExecutablePath: false,
        }
      }
    } else if (!candidate.name.trim()) {
      continue
    }

    const key = canonicalNameKey(candidate.name)
    const existing = finalApps.get(key)
    if (!existing) {
      finalApps.set(key, candidate)
      continue
    }
    const candidateWins =
      (!existing.hasExecutablePath && candidate.hasExecutablePath) ||
      (existing.hasExecutablePath === candidate.hasExecutablePath && candidate.score > existing.score)
    const winner = candidateWins ? candidate : existing
    const packageId = winner.packageId ?? existing.packageId ?? candidate.packageId
    const iconSourcePaths = uniqueLocalPaths([
      ...(existing.iconSourcePaths ?? []),
      ...(candidate.iconSourcePaths ?? []),
    ])
    finalApps.set(
      key,
      {
        ...winner,
        ...(packageId ? { packageId } : {}),
        ...(iconSourcePaths.length > 0 ? { iconSourcePaths } : {}),
      },
    )
  }

  return [...finalApps.values()]
    .map(({ name, exeName, exePath, publisher, source, packageId, hasExecutablePath, iconSourcePaths }) => {
      const app: DiscoveredApp = {
        name,
        exeName,
        exePath,
        publisher,
        source,
        hasExecutablePath,
      }
      if (packageId) app.packageId = packageId
      if (iconSourcePaths?.length) app.iconSourcePaths = iconSourcePaths
      return app
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

function candidateIdentityKey(candidate: AppCandidate): string {
  if (candidate.exePath) return `path:${candidate.exePath.toLowerCase()}`
  if (candidate.packageId) return `pkg:${candidate.packageId.toLowerCase()}`
  return `name:${canonicalNameKey(candidate.name)}|${candidate.exeName.toLowerCase()}`
}

function isHiddenRegistryEntry(item: RegistryRecord): boolean {
  return Boolean(
    item.SystemComponent ||
      item.NoDisplay ||
      item.ParentDisplayName ||
      String(item.ReleaseType ?? '').trim(),
  )
}

function isKnownGamePlatformEntry(item: RegistryRecord): boolean {
  const combined = [
    item.DisplayName,
    item.DisplayIcon,
    item.InstallLocation,
    item.Publisher,
    item.UninstallString,
  ]
    .map((value) => String(value ?? ''))
    .join(' ')

  return (
    /steam:\/\/uninstall\/|steam\.exe/i.test(combined) ||
    /com\.epicgames\.launcher|epic games/i.test(combined) ||
    /ubisoft|uplay/i.test(combined) ||
    /gog galaxy|galaxyclient|gog\.com/i.test(combined) ||
    /origin|ea desktop|ea app|electronic arts/i.test(combined) ||
    /battle\.net|blizzard/i.test(combined)
  )
}

const ALLOWED_SYSTEM_EXES = new Set([
  'calc.exe',
  'calculatorapp.exe',
  'calculator.exe',
  'notepad.exe',
  'mspaint.exe',
  'cmd.exe',
  'powershell.exe',
  'pwsh.exe',
  'explorer.exe',
  'snippingtool.exe',
  'write.exe',
  'cleanmgr.exe',
  'taskmgr.exe'
])

function isLikelyUserFacingApp(
  app: {
    name: string
    exeName: string
    exePath: string
  },
  source?: string,
): boolean {
  if (!app.exeName.toLowerCase().endsWith('.exe')) return false
  if (app.exePath) {
    if (source !== 'appx' && source !== 'winget') {
      try {
        if (process.env.NODE_ENV !== 'test' && !fs.existsSync(app.exePath)) return false
      } catch {
        // Safe fallback for permission errors
      }
    }
    if (isWindowsSystemPath(app.exePath) && !ALLOWED_SYSTEM_EXES.has(app.exeName.toLowerCase())) return false
    if (NON_USER_EXE_RE.test(app.exePath)) return false
    if (NON_USER_PATH_SEGMENT_RE.test(app.exePath)) return false
  }
  if (NON_USER_APP_RE.test(app.name)) return false
  if (isLikelyNonUserDisplayName(app.name)) return false
  if (/^[A-Z][A-Za-z]*_[A-Za-z_]+$/.test(app.name.trim()) && !/^[A-Z][a-z]+_[A-Z][a-z]+$/.test(app.name.trim())) return false
  return true
}

function isLikelyNonUserDisplayName(name: string): boolean {
  const trimmed = name.trim()
  if (!trimmed) return true
  if (NON_USER_NAME_RE.test(trimmed)) return true
  if (VERSION_OR_ARCH_NAME_RE.test(trimmed)) return true
  if (/^TODO:/i.test(trimmed)) return true
  if (/\.(dll|sys|ini|inf|conf|json|xml|txt|bat|cmd)$/i.test(trimmed)) return true
  if (/^XboxPcApp(AdminServer|CE)$/i.test(trimmed)) return true
  if (/(MsgHost|ServiceInstaller|HostInstaller|Elevator|LauncherUI)$/i.test(trimmed)) return true
  if (/^(wslsettings|msal\.wsl\.proxy)$/i.test(trimmed)) return true
  if (/^\d+(?:[._-]\d+)+[._-][a-z][a-z0-9._-]*(?:\s|\(|$)/i.test(trimmed)) return true
  if (/^(?:x86|x64|amd64|arm64|\d{2}\s*-?\s*bit)(?:\s|\(|$)/i.test(trimmed)) return true
  return false
}

function isLikelyNonUserWingetPackage(name: string, packageId: string): boolean {
  const combined = `${name} ${packageId}`
  if (NON_USER_APP_RE.test(combined)) return true

  const idLower = packageId.toLowerCase()
  if (
    idLower.startsWith('arp\\') ||
    idLower.startsWith('msix\\')
  ) {
    const cleanId = idLower.replace(/^(arp\\(machine|user)\\(x86|x64|any)\\)|^(msix\\)/, '')
    if (
      cleanId.startsWith('microsoft.vc') ||
      cleanId.startsWith('microsoft.dotnet') ||
      cleanId.startsWith('microsoft.windowsappruntime') ||
      cleanId.startsWith('microsoft.ui.xaml') ||
      cleanId.startsWith('microsoft.directx') ||
      cleanId.startsWith('microsoft.gameinput') ||
      cleanId.startsWith('microsoft.net.native')
    ) {
      return true
    }
  }

  if (
    idLower.includes('vcredist') ||
    idLower.includes('vclibs') ||
    idLower.includes('.dotnet.') ||
    idLower.includes('windowsappruntime') ||
    idLower.includes('.ui.xaml') ||
    idLower.includes('directx') ||
    idLower.includes('gameinput')
  ) {
    return true
  }

  return isLikelyNonUserDisplayName(packageId.split('.').at(-1) ?? '')
}

const APPX_SYSTEM_PREFIXES = [
  'microsoft.windows.',
  'microsoftwindows.',
  'windows.',
  'microsoft.win32',
  'microsoft.net.',
  'microsoft.ui.',
  'microsoft.vclibs',
  'microsoft.services.',
  'microsoft.directx',
  'microsoft.appruntime',
  'microsoftcorporationii.winappruntime',
  'microsoft.winget.',
  'microsoft.startexperiences',
  'microsoft.windowsappruntime',
  'microsoft.crossdevice',
]

const APPX_SYSTEM_NAMES = new Set([
  'microsoft.lockapp',
  'microsoft.ecapp',
  'microsoft.widgetsplatformruntime',
  'microsoft.storepurchaseapp',
  'microsoft.webmediaextensions',
  'microsoft.webpimageextension',
  'microsoft.hevcvideoextension',
  'microsoft.vp9videoextensions',
  'microsoft.rawimageextension',
  'microsoft.heifimageextension',
  'microsoft.av1videoextension',
  'microsoft.xboxidentityprovider',
  'microsoft.xboxspeechtotextoverlay',
  'microsoft.xboxgamecallableui',
  'pinningconfirmationdialog',
  'widgets platform runtime',
  'udk package',
  'winappruntime.main.1.8',
  'winappruntime.singleton',
  'windows web experience pack',
  'microsoft.applicationcompatibilityenhancements',
  'microsoft.sechealthui',
  'microsoft.edge.gameassist',
  'microsoft.desktopappinstaller',
  'microsoft.bingsearch',
  'microsoft.bingnews',
])

const APPX_KEYWORD_RE =
  /\b(framework|runtime|extension|extensions|singleton|main\.\d|\.net\.|vclibs|directx|services\.|appruntime|speech pack|cbspreview|undocked|printdialog|cloudexperience|assignedaccess|captiveportal|connectionflow|parentalcontrols|peoplexperience|printqueueaction|secureassessment|engagement|windowsappruntime|winappruntime|xaml|native|audio processing|encoder|decoder)\b/i

const APPX_CRYPTIC_NAME_RE =
  /^ms-resource:|^\d+[.-]|\b\d{5,}\b/i

function isLikelyNonUserAppxPackage(name: string, packageFamily: string): boolean {
  const lower = name.toLowerCase()
  const familyLower = packageFamily.toLowerCase()

  if (APPX_CRYPTIC_NAME_RE.test(name) || APPX_CRYPTIC_NAME_RE.test(packageFamily)) return true
  for (const prefix of APPX_SYSTEM_PREFIXES) {
    if (lower.startsWith(prefix) || familyLower.startsWith(prefix)) return true
  }
  if (APPX_SYSTEM_NAMES.has(lower)) return true
  if (APPX_KEYWORD_RE.test(name) || APPX_KEYWORD_RE.test(packageFamily)) return true
  if (NON_USER_APP_RE.test(name)) return true
  return false
}

function scoreCandidate(source: AppCandidate['source'], name: string, exePath: string): number {
  let score =
    source === 'shortcut'
      ? 100
      : source === 'appPath'
        ? 70
        : source === 'appx'
          ? 60
          : source === 'registry'
            ? 45
            : source === 'programFiles'
              ? 25
              : 15
  if (/\((user|machine)\)$/i.test(name)) score -= 10
  if (/\s\d+(?:\.\d+){1,3}$/u.test(name)) score -= 10
  if (exePath.toLowerCase().includes('\\appdata\\local\\programs\\')) score += 3
  return score
}

function normalizeDisplayName(value: string): string {
  return value
    .replace(/\s*\((?:user|machine)\)\s*$/iu, '')
    .replace(/\s+\d+(?:\.\d+){1,3}\s*$/u, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function canonicalNameKey(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function findFuzzyMappedPath(map: Map<string, string>, name: string): string {
  const canonical = canonicalNameKey(name)
  const exact = map.get(canonical)
  if (exact) return exact

  const clean = name.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!clean) return ''

  // Try exact cleaned match first
  for (const [mappedName, mappedPath] of map.entries()) {
    const cleanMapped = mappedName.replace(/[^a-z0-9]/g, '')
    if (cleanMapped === clean) return mappedPath
  }

  // Try startsWith/similar match
  for (const [mappedName, mappedPath] of map.entries()) {
    const cleanMapped = mappedName.replace(/[^a-z0-9]/g, '')
    if (cleanMapped.startsWith(clean) && cleanMapped.length - clean.length <= 2) return mappedPath
    if (clean.startsWith(cleanMapped) && clean.length - cleanMapped.length <= 2) return mappedPath
  }

  return ''
}

function normalizeLocalPath(value: string): string {
  if (!value) return ''
  const expanded = expandEnvVars(value.trim().replace(/^"|"$/g, ''))
  return expanded ? path.normalize(expanded) : ''
}

function uniqueLocalPaths(values: string[]): string[] {
  const result: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const normalized = normalizeLocalPath(value)
    const key = normalized.toLowerCase()
    if (!normalized || seen.has(key)) continue
    seen.add(key)
    result.push(normalized)
  }
  return result
}

function resolveLocalLogoPath(value: string): string {
  const declaredPath = normalizeLocalPath(value)
  if (!declaredPath) return ''
  try {
    if (fs.statSync(declaredPath).isFile()) return declaredPath
  } catch {
    // Les packages Store utilisent souvent un suffixe .scale-* ou .targetsize-*.
  }

  const directory = path.dirname(declaredPath)
  const extension = path.extname(declaredPath).toLowerCase()
  const stem = path.basename(declaredPath, extension).toLowerCase()
  try {
    const variants = fs
      .readdirSync(directory)
      .filter((fileName) => {
        const lower = fileName.toLowerCase()
        if (path.extname(lower) !== extension) return false
        const base = path.basename(lower, extension)
        return base === stem || base.startsWith(`${stem}.scale-`) || base.startsWith(`${stem}.targetsize-`)
      })
      .map((fileName) => {
        const fullPath = path.join(directory, fileName)
        return { fullPath, size: fs.statSync(fullPath).size }
      })
      .sort((a, b) => b.size - a.size)
    return variants[0]?.fullPath ?? ''
  } catch {
    return ''
  }
}

function findLocalIconAsset(directory: string, appName: string): string {
  if (!directory) return ''
  const normalizedDirectory = normalizeLocalPath(directory)
  const protectedRoots = [
    process.env['ProgramFiles'],
    process.env['ProgramFiles(x86)'],
    process.env['LOCALAPPDATA'],
  ]
    .filter(Boolean)
    .map((root) => normalizeLocalPath(root!).toLowerCase())
  if (protectedRoots.includes(normalizedDirectory.toLowerCase())) return ''

  const appKey = cleanString(appName)
  const candidates: Array<{ path: string; score: number }> = []
  let inspected = 0

  const visit = (currentDirectory: string, depth: number): void => {
    if (depth > 2 || inspected >= 250) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(currentDirectory, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (inspected++ >= 250) return
      const fullPath = path.join(currentDirectory, entry.name)
      if (entry.isDirectory()) {
        if (!/^(?:node_modules|locales?|resources\.pak|cache|logs?|temp)$/i.test(entry.name)) {
          visit(fullPath, depth + 1)
        }
        continue
      }
      if (!/\.(?:ico|png|jpe?g|webp)$/i.test(entry.name)) continue
      const base = path.basename(entry.name, path.extname(entry.name))
      const cleanBase = cleanString(base)
      let score = 0
      if (/^(?:appicon|applicationicon|icon|logo|producticon|storelogo)$/i.test(base)) score += 100
      if (/\.(?:ico)$/i.test(entry.name)) score += 30
      if (appKey && (cleanBase.includes(appKey) || appKey.includes(cleanBase))) score += 40
      if (/[\\/](?:assets?|images?|icons?)[\\/]/i.test(fullPath)) score += 15
      if (/uninstall|setup|update|installer/i.test(fullPath)) score -= 100
      try {
        const size = fs.statSync(fullPath).size
        if (size < 256 || size > 5_000_000) continue
        score += Math.min(20, Math.log2(size))
      } catch {
        continue
      }
      if (score > 25) candidates.push({ path: fullPath, score })
    }
  }

  visit(normalizedDirectory, 0)
  candidates.sort((a, b) => b.score - a.score)
  return candidates[0]?.path ?? ''
}

function normalizeExePath(value: string): string {
  if (!value) return ''
  const expanded = expandEnvVars(value.trim().replace(/^"|"$/g, ''))
  if (!expanded || !/\.exe$/i.test(expanded)) return ''
  return path.normalize(expanded)
}

function isUserFacingExe(exePath: string): boolean {
  if (!exePath) return false
  if (NON_USER_EXE_RE.test(exePath)) return false
  if (NON_USER_PATH_SEGMENT_RE.test(exePath)) return false
  return true
}

function findExesInDir(dir: string, maxDepth = 2, currentDepth = 0): string[] {
  const results: string[] = []
  if (currentDepth > maxDepth) return results
  try {
    if (!fs.existsSync(dir)) return results
    const stat = fs.statSync(dir)
    if (!stat.isDirectory()) return results

    const files = fs.readdirSync(dir)
    for (const file of files) {
      const fullPath = path.join(dir, file)
      try {
        const fileStat = fs.statSync(fullPath)
        if (fileStat.isDirectory()) {
          results.push(...findExesInDir(fullPath, maxDepth, currentDepth + 1))
        } else if (fileStat.isFile() && /\.exe$/i.test(file)) {
          results.push(fullPath)
        }
      } catch {
        // Ignore unreadable files while scanning install directories.
      }
    }
  } catch {
    // Ignore unreadable directories while scanning install directories.
  }
  return results
}

function extractExePathFromDisplayIcon(displayIcon: string): string {
  const trimmed = expandEnvVars(displayIcon.trim())
  const match = /"([^"]+\.exe)"|([a-z]:\\[^,"]+?\.exe)(?:,|$)/i.exec(trimmed)
  return normalizeExePath(match?.[1] ?? match?.[2] ?? '')
}

function extractIconPathFromDisplayIcon(displayIcon: string): string {
  const trimmed = expandEnvVars(displayIcon.trim())
  const match =
    /^"([^"]+\.(?:exe|dll|ico|png|jpe?g|webp))"(?:,\s*-?\d+)?$/i.exec(trimmed) ??
    /^(.+?\.(?:exe|dll|ico|png|jpe?g|webp))(?:,\s*-?\d+)?$/i.exec(trimmed)
  return normalizeLocalPath(match?.[1] ?? '')
}

function parseWingetJson(stdout: string): WingetRecord[] {
  const raw = stdout.trim().replace(/^\uFEFF/, '')
  if (!raw) return []
  const parsed = JSON.parse(raw) as unknown
  const records: unknown[] = []
  collectWingetJsonPackages(parsed, records)
  return records.map(normalizeWingetJsonRecord).filter((record) => record.Name || record.Id)
}

function collectWingetJsonPackages(value: unknown, out: unknown[]): void {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const item of value) collectWingetJsonPackages(item, out)
    return
  }

  const record = value as Record<string, unknown>
  if (typeof record.Name === 'string' && (record.Id || record.PackageIdentifier)) {
    out.push(record)
  }

  for (const key of ['Packages', 'Package', 'Data', 'Sources']) {
    const nested = record[key]
    if (nested) collectWingetJsonPackages(nested, out)
  }
}

function normalizeWingetJsonRecord(value: unknown): WingetRecord {
  const record = value as Record<string, unknown>
  return {
    Name: record.Name,
    Id: record.Id ?? record.PackageIdentifier,
    PackageIdentifier: record.PackageIdentifier,
    Publisher: record.Publisher,
    Source: record.Source,
  }
}

function parseWingetTable(stdout: string): WingetRecord[] {
  const lines = stripAnsi(stdout)
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
  const headerIndex = lines.findIndex(
    (line) => /\bName\b/.test(line) && /\bId\b/.test(line) && /\bVersion\b/.test(line),
  )
  if (headerIndex < 0) return []

  const header = lines[headerIndex]!
  const idStart = header.indexOf('Id')
  const versionStart = header.indexOf('Version')
  const sourceStart = header.indexOf('Source')
  if (idStart <= 0 || versionStart <= idStart) return []

  return lines
    .slice(headerIndex + 1)
    .filter((line) => !/^[-\s]+$/.test(line))
    .map((line) => {
      const name = line.slice(0, idStart).trim()
      const id = line.slice(idStart, versionStart).trim()
      const source =
        sourceStart > versionStart
          ? line.slice(sourceStart).trim().split(/\s+/)[0]
          : undefined
      return { Name: name, Id: id, Source: source }
    })
    .filter((record) => Boolean(record.Name && record.Id))
}

const ANSI_ESCAPE_RE = new RegExp(String.raw`\u001B\[[0-?]*[ -/]*[@-~]`, 'g')

function stripAnsi(value: string): string {
  return value.replace(ANSI_ESCAPE_RE, '')
}

function isWindowsSystemPath(exePath: string): boolean {
  const normalized = path.normalize(exePath).toLowerCase()
  const windowsDir = path.normalize(process.env['SystemRoot'] ?? 'C:\\Windows').toLowerCase()
  return normalized === windowsDir || normalized.startsWith(`${windowsDir}\\`)
}

function expandEnvVars(value: string): string {
  return value.replace(/%([^%]+)%/g, (_, key: string) => {
    const match = Object.keys(process.env).find((envKey) => envKey.toLowerCase() === key.toLowerCase())
    return match ? (process.env[match] ?? '') : `%${key}%`
  })
}

function parseJsonArray<T>(stdout: string): T[] {
  const parsed = JSON.parse(stdout.trim().replace(/^\uFEFF/, '') || '[]') as unknown
  if (Array.isArray(parsed)) return parsed as T[]
  return parsed ? [parsed as T] : []
}

function cleanString(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function extractExePath(str: string): string {
  if (!str) return ''
  const trimmed = expandEnvVars(str.trim())
  const match = /"([^"]+\.exe)"|([a-z]:\\[^,"]+?\.exe)(?:[\s,]|$)/i.exec(trimmed)
  return normalizeExePath(match?.[1] ?? match?.[2] ?? '')
}

export const __appDiscoveryTest = {
  buildAppPathCandidates,
  buildIconSourceOrder,
  buildAppxCandidates,
  buildProgramFileCandidates,
  buildRegistryCandidates,
  buildShortcutCandidates,
  buildWingetCandidates,
  candidateIdentityKey,
  extractExePathFromDisplayIcon,
  extractIconPathFromDisplayIcon,
  isLikelyNonUserAppxPackage,
  isLikelyNonUserDisplayName,
  isKnownGamePlatformEntry,
  mergeCandidates,
  normalizeDisplayName,
  parseWingetJson,
  parseWingetTable,
  readAppPathRegistry,
  readProgramFilesExecutables,
  readWingetApps,
}
