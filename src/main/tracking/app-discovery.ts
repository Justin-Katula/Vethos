/**
 * app-discovery.ts
 *
 * Scanne les applications visibles par l'utilisateur sur Windows.
 * Retourne une liste de {name, exePath} pour que l'utilisateur puisse
 * choisir quoi bloquer sans taper les noms à la main.
 */

import { execFile as execFileCallback } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { app as electronApp, nativeImage } from 'electron'
import { promisify } from 'node:util'
import * as path from 'node:path'
import log from '@main/logging/setup'
import { categorizeApp, type AppCategory } from './app-category'
import { classerParIA, type AiCache } from './app-category-ai'

const execFile = promisify(execFileCallback)

export type DiscoveredApp = {
  name: string
  exeName: string
  exePath: string
  publisher: string
  category: AppCategory
  /** Phrase descriptive fournie par l'IA, absente pour les apps classées localement. */
  description?: string
  iconDataUrl?: string
  /** Logo déclaré par un paquet Store. Interne : remplacé par iconDataUrl. */
  logoPath?: string
  /** Raccourci d'origine. Interne : sert de repli pour l'icône. */
  shortcutPath?: string
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
  /** Exécutable principal déduit du dossier d'installation, si DisplayIcon manque. */
  ResolvedExe?: unknown
  InstallLocation?: unknown
  Publisher?: unknown
  SystemComponent?: unknown
  NoDisplay?: unknown
  ReleaseType?: unknown
  ParentDisplayName?: unknown
  WindowsInstaller?: unknown
}

/**
 * Candidat avant fusion. La catégorie est délibérément absente : elle est
 * calculée une seule fois au moment de la fusion, sur l'entrée retenue, plutôt
 * que sur chaque doublon écarté.
 */
type AppCandidate = Omit<DiscoveredApp, 'category'> & {
  source: 'shortcut' | 'registry' | 'store'
  score: number
  /** Logo fourni par le manifeste d'un paquet Store, meilleur que l'icône de l'exe. */
  logoPath?: string
  /** Raccourci d'origine — repli quand l'icône de l'exe est introuvable. */
  shortcutPath?: string
}

const NON_USER_APP_RE =
  /\b(uninstall|uninstaller|unins\d*|setup|installer|install manager|update|updater|maintenance|repair|service|daemon|driver|diagnostic|diagnostics|bug report|crash|redistributable|runtime|sdk|component|helper|bootstrapper)\b/i

const NON_USER_EXE_RE =
  /(?:^|[\\/])(unins\d*|uninstall|setup|installer|install|update|updater|maintenance|repair|service|daemon|helper|crash|bugreport|bootstrapper)\.exe$/i

/**
 * Deuxième passe, écrite à partir de ce qui traversait réellement le premier
 * filtre sur une machine de développement : `Docker Desktop Installer.exe`,
 * `OneDriveSetup.exe`, `itch-setup.exe`, `ASUS-DriverHub-Installer.exe`,
 * `denuvo-anti-cheat-update-service.exe`, `chrome_proxy.exe`.
 *
 * Le premier filtre exigeait que le mot soit le nom complet du fichier ; ici
 * on l'accepte n'importe où, ce qui attrape les formes composées.
 */
// `setup` sans séparateur : `OneDriveSetup.exe` traversait les variantes
// `-setup` / `_setup`. Le mot collé au nom du produit est la forme la plus
// répandue. Testé sur le nom de fichier seul, jamais sur le chemin, pour
// qu'un dossier « Setup » ne fasse pas disparaître son contenu.
const NON_USER_EXE_SUBSTRING_RE =
  /(installer|setup|uninstall|anti-cheat|anticheat|driverhub|_proxy|-proxy|crashpad|crashhandler|elevation|watchdog|telemetry|reporter)/i

/** Noms qui trahissent un composant technique, pas une application ouvrable. */
const NON_USER_NAME_RE =
  /\b(anti-cheat|anticheat|driverhub|tray-icon|tray icon|agent settings|overlay host|gpuview|shader|prerequisites|dependencies|vc_redist|web installer|command prompt|developer (command|powershell))\b/i

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

  // Troisième source, indispensable : les applications du Microsoft Store.
  // Elles n'ont ni raccourci .lnk ni entrée de désinstallation classique, donc
  // les deux scans précédents les manquent entièrement — Spotify, WhatsApp,
  // Instagram, Netflix… C'est là que se cachaient les applications absentes.
  try {
    candidates.push(...buildStoreCandidates(await readStoreApps()))
  } catch (err) {
    log.warn('[app-discovery] Store scan failed', err)
  }

  const apps = await appliquerClassementIA(await attachAppIcons(mergeCandidates(candidates)))
  log.info(`[app-discovery] count=${apps.length}`)
  return apps
}

/** Cache des verdicts IA, à côté des données de l'application. */
function cheminCacheIA(): string {
  return path.join(electronApp.getPath('userData'), 'nexus_app_categories_ai.json')
}

async function lireCacheIA(): Promise<AiCache> {
  try {
    const brut = await readFile(cheminCacheIA(), 'utf8')
    const parsed: unknown = JSON.parse(brut)
    return typeof parsed === 'object' && parsed !== null ? (parsed as AiCache) : {}
  } catch {
    // Absent ou illisible : on repart d'un cache vide, sans bruit.
    return {}
  }
}

/**
 * Complète le classement local par l'IA, sur les seules applications tombées
 * dans « Autres ».
 *
 * Le classement par mots-clés ne connaît que ce qu'on a pensé à lister ; l'IA
 * sait ce qu'est « eFootball » ou « Antigravity » sans qu'on l'écrive. Elle
 * n'est sollicitée que pour le reliquat, par lots, et son verdict est mis en
 * cache définitivement — au deuxième lancement, plus aucun appel réseau.
 *
 * Sans clé d'API ou hors ligne, tout continue : les applications restent dans
 * « Autres ». Aucune découverte ne dépend de la disponibilité de l'IA.
 */
async function appliquerClassementIA(apps: DiscoveredApp[]): Promise<DiscoveredApp[]> {
  const inclassees = apps.filter((a) => a.category === 'others')
  if (inclassees.length === 0) return apps

  let cache: AiCache
  try {
    cache = await classerParIA(
      inclassees.map((a) => ({ exeName: a.exeName, name: a.name, publisher: a.publisher })),
      await lireCacheIA(),
    )
    await writeFile(cheminCacheIA(), JSON.stringify(cache, null, 2), 'utf8')
  } catch (err) {
    log.warn('[app-discovery] classement IA indisponible', err)
    return apps
  }

  return apps.map((app) => {
    const verdict = cache[app.exeName.toLowerCase()]
    if (verdict === undefined) return app
    return { ...app, category: verdict.category, description: verdict.description }
  })
}

const iconCache = new Map<string, string | null>()

async function attachAppIcons(apps: DiscoveredApp[]): Promise<DiscoveredApp[]> {
  if (process.platform !== 'win32') return apps

  const resultats = await Promise.all(
    apps.map(async (app) => {
      // Le logo du manifeste Store est un PNG net et transparent ; l'icône
      // extraite d'un .exe est une ressource ICO souvent basse définition.
      // Quand les deux existent, le manifeste gagne.
      const depuisManifeste =
        app.logoPath === undefined ? null : await readLogoFile(app.logoPath)
      const iconDataUrl =
        depuisManifeste ?? (await getIconDataUrl(app.exePath, app.shortcutPath))
      const { logoPath: _logo, shortcutPath: _lnk, ...reste } = app
      return iconDataUrl ? { ...reste, iconDataUrl } : reste
    }),
  )

  const avecIcone = resultats.filter((a) => a.iconDataUrl !== undefined).length
  log.info(`[app-discovery] icônes : ${avecIcone}/${resultats.length}`)
  return resultats
}

/** Lit un PNG de logo Store et le rend en data URL. */
async function readLogoFile(logoPath: string): Promise<string | null> {
  const key = `logo:${logoPath.toLowerCase()}`
  if (iconCache.has(key)) return iconCache.get(key) ?? null
  try {
    const image = nativeImage.createFromPath(logoPath)
    const dataUrl = image.isEmpty() ? null : image.toDataURL()
    iconCache.set(key, dataUrl)
    return dataUrl
  } catch {
    iconCache.set(key, null)
    return null
  }
}

/**
 * Icône d'un exécutable, avec replis successifs.
 *
 * `getFileIcon` échoue ou rend une image vide plus souvent qu'on ne l'imagine :
 * exécutable temporairement verrouillé, ressource icône absente du binaire
 * (fréquent pour les applications Electron dont l'icône vit dans un
 * `.ico` voisin), ou taille demandée indisponible. On essaie donc plusieurs
 * tailles, puis le raccourci du menu Démarrer s'il est connu — Windows sait
 * résoudre l'icône d'un `.lnk` même quand celle de la cible lui résiste.
 */
async function getIconDataUrl(exePath: string, shortcutPath?: string): Promise<string | null> {
  const key = exePath.toLowerCase()
  if (iconCache.has(key)) return iconCache.get(key) ?? null

  if (!electronApp.isReady()) {
    iconCache.set(key, null)
    return null
  }

  const tentatives: Array<{ chemin: string; taille: 'large' | 'normal' | 'small' }> = [
    { chemin: exePath, taille: 'large' },
    { chemin: exePath, taille: 'normal' },
  ]
  if (shortcutPath !== undefined && shortcutPath.length > 0) {
    tentatives.push({ chemin: shortcutPath, taille: 'large' })
  }

  for (const tentative of tentatives) {
    try {
      const image = await electronApp.getFileIcon(tentative.chemin, { size: tentative.taille })
      if (!image.isEmpty()) {
        const dataUrl = image.toDataURL()
        iconCache.set(key, dataUrl)
        return dataUrl
      }
    } catch {
      // Tentative suivante.
    }
  }

  iconCache.set(key, null)
  log.warn('[app-discovery] aucune icône trouvée', { exePath, shortcutPath })
  return null
}

type StoreRecord = {
  Name?: unknown
  Executable?: unknown
  InstallLocation?: unknown
  LogoPath?: unknown
  Publisher?: unknown
}

/**
 * Applications du Microsoft Store, via `Get-StartApps` croisé avec
 * `Get-AppxPackage`.
 *
 * `Get-StartApps` est la source d'autorité de « ce que l'utilisateur voit dans
 * le menu Démarrer » : par construction elle exclut les composants système,
 * les runtimes et les paquets de dépendance, sans qu'on ait à deviner. On la
 * croise avec `Get-AppxPackage` pour obtenir le dossier d'installation, puis
 * on lit le manifeste pour l'exécutable réel et le logo.
 *
 * Le logo est cherché en plusieurs variantes : Windows ne stocke pas le
 * fichier déclaré dans le manifeste, mais des déclinaisons par échelle
 * (`.scale-200`, `.targetsize-48`…). On prend la plus grande disponible.
 */
async function readStoreApps(): Promise<StoreRecord[]> {
  const script = `
    $OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $packages = @{}
    foreach ($p in Get-AppxPackage -ErrorAction SilentlyContinue) {
      if ($p.PackageFamilyName) { $packages[$p.PackageFamilyName] = $p }
    }

    function Get-BestLogo([string]$root, [string]$declared) {
      if (-not $declared) { return $null }
      $full = Join-Path $root $declared
      $dir = Split-Path $full -Parent
      $base = [IO.Path]::GetFileNameWithoutExtension($full)
      $ext = [IO.Path]::GetExtension($full)
      if (-not (Test-Path -LiteralPath $dir)) { return $null }
      # Les variantes d'echelle donnent une bien meilleure definition que le
      # fichier nominal, qui est souvent absent du disque.
      $variants = Get-ChildItem -LiteralPath $dir -Filter "$base*$ext" -ErrorAction SilentlyContinue |
        Sort-Object Length -Descending
      if ($variants) { return $variants[0].FullName }
      if (Test-Path -LiteralPath $full) { return $full }
      return $null
    }

    $items = foreach ($entry in (Get-StartApps -ErrorAction SilentlyContinue)) {
      $appId = [string]$entry.AppID
      if ($appId -notmatch '^(?<pfn>[^!]+)!(?<app>.+)$') { continue }
      $pkg = $packages[$Matches['pfn']]
      if (-not $pkg -or -not $pkg.InstallLocation) { continue }
      $manifestPath = Join-Path $pkg.InstallLocation 'AppxManifest.xml'
      if (-not (Test-Path -LiteralPath $manifestPath)) { continue }
      try {
        [xml]$manifest = Get-Content -LiteralPath $manifestPath -Raw -ErrorAction Stop
        $apps = @($manifest.Package.Applications.Application)
        $target = $apps | Where-Object { $_.Id -eq $Matches['app'] } | Select-Object -First 1
        if (-not $target) { $target = $apps | Select-Object -First 1 }
        if (-not $target) { continue }
        $visual = $target.VisualElements
        if (-not $visual) { $visual = $target.'uap:VisualElements' }
        $declaredLogo = $null
        if ($visual) {
          $declaredLogo = $visual.Square44x44Logo
          if (-not $declaredLogo) { $declaredLogo = $visual.Square150x150Logo }
          if (-not $declaredLogo) { $declaredLogo = $visual.Logo }
        }
        [pscustomobject]@{
          Name = [string]$entry.Name
          Executable = [string]$target.Executable
          InstallLocation = [string]$pkg.InstallLocation
          LogoPath = Get-BestLogo $pkg.InstallLocation $declaredLogo
          Publisher = [string]$pkg.Publisher
        }
      } catch {}
    }
    @($items) | ConvertTo-Json -Depth 3
  `

  const { stdout } = await execFile(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { windowsHide: true, maxBuffer: 20 * 1024 * 1024, timeout: 30000 },
  )
  return parseJsonArray<StoreRecord>(stdout)
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
    # Executable principal d'un dossier d'installation, quand DisplayIcon est
    # absent. Windows lui-meme liste ces applications sans chemin d'icone —
    # Blender, Node.js, GitHub CLI, Epic Games Launcher — et les ecarter
    # faisait perdre une vingtaine d'applications bien reelles.
    function Get-MainExecutable([string]$root, [string]$displayName) {
      if (-not $root -or -not (Test-Path -LiteralPath $root)) { return $null }
      $exes = Get-ChildItem -LiteralPath $root -Filter *.exe -Recurse -Depth 2 -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notmatch '(?i)(unins|setup|installer|update|crash|helper|service|daemon|report)' }
      if (-not $exes) { return $null }
      # On prefere l'executable dont le nom ressemble au nom affiche ; a defaut
      # le plus volumineux, qui est presque toujours le binaire principal.
      $cle = ($displayName -replace '[^a-zA-Z0-9]','').ToLower()
      $exact = $exes | Where-Object { ($_.BaseName -replace '[^a-zA-Z0-9]','').ToLower() -eq $cle } | Select-Object -First 1
      if ($exact) { return $exact.FullName }
      $partiel = $exes | Where-Object { $cle -and ($cle.StartsWith((($_.BaseName -replace '[^a-zA-Z0-9]','').ToLower()))) } |
        Sort-Object Length -Descending | Select-Object -First 1
      if ($partiel) { return $partiel.FullName }
      return ($exes | Sort-Object Length -Descending | Select-Object -First 1).FullName
    }

    $apps = foreach ($p in $paths) {
      Get-ItemProperty $p -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName } |
        ForEach-Object {
          $resolu = $null
          if (-not $_.DisplayIcon -and $_.InstallLocation) {
            $resolu = Get-MainExecutable $_.InstallLocation $_.DisplayName
          }
          [pscustomobject]@{
            DisplayName = $_.DisplayName
            InstallLocation = $_.InstallLocation
            DisplayIcon = $_.DisplayIcon
            ResolvedExe = $resolu
            Publisher = $_.Publisher
            SystemComponent = $_.SystemComponent
            NoDisplay = $_.NoDisplay
            ReleaseType = $_.ReleaseType
            ParentDisplayName = $_.ParentDisplayName
            WindowsInstaller = $_.WindowsInstaller
          }
        }
    }
    @($apps) | ConvertTo-Json -Depth 2
  `

  const { stdout } = await execFile(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    // Le balayage des dossiers d'installation prend du temps : 60 s, pas 15.
    { windowsHide: true, maxBuffer: 20 * 1024 * 1024, timeout: 60000 },
  )
  return parseJsonArray<RegistryRecord>(stdout)
}

function buildShortcutCandidates(items: ShortcutRecord[]): AppCandidate[] {
  return items.flatMap((item) => {
    const exePath = normalizeExePath(String(item.TargetPath ?? ''))
    const name = normalizeDisplayName(String(item.Name ?? ''))
    if (!name || !exePath) return []
    return toCandidate({
      name,
      exePath,
      publisher: '',
      source: 'shortcut',
      shortcutPath: String(item.ShortcutPath ?? ''),
    })
  })
}

function buildStoreCandidates(items: StoreRecord[]): AppCandidate[] {
  return items.flatMap((item) => {
    const name = normalizeDisplayName(String(item.Name ?? ''))
    const installLocation = String(item.InstallLocation ?? '')
    const executable = String(item.Executable ?? '')
    if (!name || !installLocation || !executable) return []

    const exePath = normalizeExePath(path.join(installLocation, executable))
    const logoPath = String(item.LogoPath ?? '')

    // Get-StartApps a déjà écarté les composants système : ces entrées sont
    // par définition ce que l'utilisateur voit dans son menu Démarrer. On ne
    // repasse donc pas le filtre heuristique, qui rejetterait à tort des noms
    // légitimes comme « Xbox Game Bar » ou « Paramètres de l'Assistant ».
    return [
      {
        name,
        exeName: path.basename(exePath),
        exePath,
        publisher: extractPublisherCommonName(String(item.Publisher ?? '')),
        logoPath: logoPath.length > 0 ? logoPath : undefined,
        source: 'store' as const,
        // Priorité maximale : c'est la source la plus fidèle à ce que
        // l'utilisateur voit, logo compris.
        score: 100,
      },
    ]
  })
}

/** « CN=Spotify AB, O=… » → « Spotify AB ». */
function extractPublisherCommonName(subject: string): string {
  const match = subject.match(/CN=([^,]+)/u)
  return match?.[1]?.trim() ?? ''
}

function buildRegistryCandidates(items: RegistryRecord[]): AppCandidate[] {
  return items.flatMap((item) => {
    if (isHiddenRegistryEntry(item)) return []
    const name = normalizeDisplayName(String(item.DisplayName ?? ''))
    // Repli sur l'exécutable résolu depuis le dossier d'installation quand
    // DisplayIcon manque : c'était la perte la plus grosse, une vingtaine
    // d'applications réelles dont Blender et Epic Games Launcher.
    const exePath =
      extractExePathFromDisplayIcon(String(item.DisplayIcon ?? '')) ||
      normalizeExePath(String(item.ResolvedExe ?? ''))
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
  shortcutPath?: string
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
      shortcutPath: args.shortcutPath,
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

  // Troisième passe, sur le nom seul. Une même application peut exposer
  // plusieurs exécutables sous un seul nom affiché — « Rockstar Games
  // Launcher » pointe à la fois sur `Launcher.exe` et `LauncherPatcher.exe`.
  // Pour l'utilisateur ce sont des doublons, pas deux applications.
  const byName = new Map<string, AppCandidate>()
  for (const candidate of byApp.values()) {
    const key = canonicalNameKey(candidate.name)
    const existing = byName.get(key)
    if (!existing || candidate.score > existing.score) byName.set(key, candidate)
  }

  return [...byName.values()]
    .map(({ name, exeName, exePath, publisher, logoPath, shortcutPath }) => ({
      name,
      exeName,
      exePath,
      publisher,
      category: categorizeApp({ name, exeName, publisher }),
      logoPath,
      shortcutPath,
    }))
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
  if (NON_USER_EXE_SUBSTRING_RE.test(app.exeName)) return false
  if (NON_USER_APP_RE.test(app.name)) return false
  if (NON_USER_NAME_RE.test(app.name)) return false
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
