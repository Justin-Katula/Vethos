/**
 * app-discovery.ts
 *
 * Scanne les applications visibles par l'utilisateur sur Windows.
 * Retourne une liste de {name, exePath} pour que l'utilisateur puisse
 * choisir quoi bloquer sans taper les noms à la main.
 */

import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'
import * as path from 'node:path'
import log from '@main/logging/setup'

const execFile = promisify(execFileCallback)

export type DiscoveredApp = {
  name: string
  exeName: string
  exePath: string
  publisher: string
}

type ShortcutRecord = {
  Name?: unknown
  TargetPath?: unknown
  Arguments?: unknown
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
}

type AppCandidate = DiscoveredApp & {
  source: 'shortcut' | 'registry'
  score: number
}

const NON_USER_APP_RE =
  /\b(uninstall|uninstaller|unins\d*|setup|installer|install manager|update|updater|maintenance|repair|service|daemon|driver|diagnostic|diagnostics|bug report|crash|redistributable|runtime|sdk|component|helper|bootstrapper)\b/i

const NON_USER_EXE_RE =
  /(?:^|[\\/])(unins\d*|uninstall|setup|installer|install|update|updater|maintenance|repair|service|daemon|helper|crash|bugreport|bootstrapper)\.exe$/i

/**
 * Scanne d'abord les raccourcis du menu Démarrer : c'est la source la plus
 * proche des apps que l'utilisateur voit réellement. Le registre reste un
 * complément pour les apps sans raccourci.
 */
export async function discoverInstalledApps(): Promise<DiscoveredApp[]> {
  log.info('[app-discovery] start')
  const candidates: AppCandidate[] = []

  try {
    candidates.push(...buildShortcutCandidates(await readStartMenuShortcuts()))
  } catch (err) {
    log.warn('[app-discovery] Start Menu scan failed', err)
  }

  try {
    candidates.push(...buildRegistryCandidates(await readRegistryApps()))
  } catch (err) {
    log.warn('[app-discovery] registry scan failed', err)
  }

  const apps = mergeCandidates(candidates)
  log.info(`[app-discovery] count=${apps.length}`)
  return apps
}

async function readStartMenuShortcuts(): Promise<ShortcutRecord[]> {
  const script = `
    $OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $roots = @(
      (Join-Path $env:ProgramData 'Microsoft\\Windows\\Start Menu\\Programs'),
      (Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs')
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
  const script = `
    $OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $paths = @(
      'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
      'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
      'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
    )
    $apps = foreach ($p in $paths) {
      Get-ItemProperty $p -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -and ($_.InstallLocation -or $_.DisplayIcon) } |
        Select-Object DisplayName, InstallLocation, DisplayIcon, Publisher, SystemComponent, NoDisplay, ReleaseType, ParentDisplayName, WindowsInstaller
    }
    @($apps) | ConvertTo-Json -Depth 2
  `

  const { stdout } = await execFile(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { windowsHide: true, maxBuffer: 10 * 1024 * 1024, timeout: 15000 },
  )
  return parseJsonArray<RegistryRecord>(stdout)
}

function buildShortcutCandidates(items: ShortcutRecord[]): AppCandidate[] {
  return items.flatMap((item) => {
    const exePath = normalizeExePath(String(item.TargetPath ?? ''))
    const name = normalizeDisplayName(String(item.Name ?? ''))
    if (!name || !exePath) return []
    return toCandidate({ name, exePath, publisher: '', source: 'shortcut' })
  })
}

function buildRegistryCandidates(items: RegistryRecord[]): AppCandidate[] {
  return items.flatMap((item) => {
    if (isHiddenRegistryEntry(item)) return []
    const name = normalizeDisplayName(String(item.DisplayName ?? ''))
    const exePath = extractExePathFromDisplayIcon(String(item.DisplayIcon ?? ''))
    if (!name || !exePath) return []
    return toCandidate({
      name,
      exePath,
      publisher: String(item.Publisher ?? '').trim(),
      source: 'registry',
    })
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
  if (!isLikelyUserFacingApp({ name: args.name, exeName, exePath })) return []

  return [
    {
      name: args.name,
      exeName,
      exePath,
      publisher: args.publisher,
      source: args.source,
      score: scoreCandidate(args.source, args.name, exePath),
    },
  ]
}

function mergeCandidates(candidates: AppCandidate[]): DiscoveredApp[] {
  const byPath = new Map<string, AppCandidate>()
  for (const candidate of candidates) {
    const key = candidate.exePath.toLowerCase()
    const existing = byPath.get(key)
    if (!existing || candidate.score > existing.score) byPath.set(key, candidate)
  }

  const byApp = new Map<string, AppCandidate>()
  for (const candidate of byPath.values()) {
    const key = `${canonicalNameKey(candidate.name)}|${candidate.exeName.toLowerCase()}`
    const existing = byApp.get(key)
    if (!existing || candidate.score > existing.score) byApp.set(key, candidate)
  }

  return [...byApp.values()]
    .map(({ name, exeName, exePath, publisher }) => ({ name, exeName, exePath, publisher }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

function isHiddenRegistryEntry(item: RegistryRecord): boolean {
  return Boolean(
    item.SystemComponent ||
      item.NoDisplay ||
      item.ParentDisplayName ||
      String(item.ReleaseType ?? '').trim(),
  )
}

function isLikelyUserFacingApp(app: {
  name: string
  exeName: string
  exePath: string
}): boolean {
  if (!app.exeName.toLowerCase().endsWith('.exe')) return false
  if (isWindowsSystemPath(app.exePath)) return false
  if (NON_USER_EXE_RE.test(app.exePath)) return false
  if (NON_USER_APP_RE.test(app.name)) return false
  return true
}

function scoreCandidate(source: AppCandidate['source'], name: string, exePath: string): number {
  let score = source === 'shortcut' ? 100 : 40
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
  return normalizeDisplayName(value).toLowerCase()
}

function normalizeExePath(value: string): string {
  const expanded = expandEnvVars(value.trim().replace(/^"|"$/g, ''))
  if (!expanded || !/\.exe$/i.test(expanded)) return ''
  return path.normalize(expanded)
}

function extractExePathFromDisplayIcon(displayIcon: string): string {
  const trimmed = expandEnvVars(displayIcon.trim())
  const match = /"([^"]+\.exe)"|([a-z]:\\[^,"]+?\.exe)(?:,|$)/i.exec(trimmed)
  return normalizeExePath(match?.[1] ?? match?.[2] ?? '')
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

export const __appDiscoveryTest = {
  buildRegistryCandidates,
  buildShortcutCandidates,
  extractExePathFromDisplayIcon,
  mergeCandidates,
  normalizeDisplayName,
}
