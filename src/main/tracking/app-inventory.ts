import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import { app as electronApp, nativeImage } from 'electron';
import log from '@main/logging/setup';
import { type AppCategory } from '@shared/app-categories';
import { type ClassificationSource } from '@shared/schemas';
import { resolveAppClassificationSync } from './classification-resolver';
import {
  isProtectedApp,
  isProtectedExe,
  isHostOrSubprocess,
  isNonUserSystemHelper,
} from '@main/blocking/system-guard';
import { extractIconWithPowerShell, isGenericWindowsIcon } from './app-discovery';
// Couche de decision supprimee le 2026-09-11 a la demande de l'utilisateur :
// catalogue, recherche web et moteur ALLOW/BLOCK sont a reconstruire de zero.
const enqueueUnknownAppForCatalogEnrichment = (_: unknown): void => {};

const execFile = promisify(execFileCallback);

// L'ecoute de l'enrichissement proactif a ete retiree avec la couche de decision.

export interface AppRecord {
  id: string; // Stable internal unique ID (e.g., 'win32:c:\...\discord.exe', 'aumid:...', 'pwa:...')
  name: string; // User-facing display name (e.g., 'Discord', 'Anime-Sama')
  exeName: string; // Executable basename (e.g., 'Discord.exe')
  exePath: string; // Resolved executable path (or target path)
  publisher: string;
  category: AppCategory | null;
  classificationState: 'RESOLVED' | 'UNRESOLVED';
  classificationSource: ClassificationSource;
  classificationReasonCode: string;
  classifierVersion: number;
  source: 'appsFolder' | 'registry' | 'shortcut' | 'passive' | 'custom';
  isProtected: boolean;
  targetPath?: string;
  steamAppId?: string;
  aumid?: string;
  packageFamilyName?: string;
  packageInstallPath?: string;
  logoPath?: string;
  iconDataUrl?: string;
  lastSeenAt?: number;
}

interface RawAppsFolderItem {
  Name?: string;
  ParsingPath?: string;
  TargetPath?: string;
  PackageFamilyName?: string;
  PackageInstallPath?: string;
  LogoPath?: string;
}

export interface RawRegistryItem {
  DisplayName?: string;
  DisplayVersion?: string;
  Publisher?: string;
  InstallLocation?: string;
  DisplayIcon?: string;
  UninstallString?: string;
}

export interface RawShortcutItem {
  Name?: string;
  TargetPath?: string;
  Arguments?: string;
  IconLocation?: string;
  ShortcutPath?: string;
}

// In-memory cache of inventory
let inventoryCache: AppRecord[] | null = null;
let lastInventoryScanTime = 0;
const INVENTORY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// In-memory icon cache to prevent redundant icon extractions
const iconCache = new Map<string, string | null>();

/**
 * Normalizes an executable or folder path for stable identity and deduplication.
 */
export function normalizeAppPath(filePath?: string): string {
  if (!filePath) return '';
  return path.resolve(filePath).toLowerCase().trim();
}

/**
 * Resolves Squirrel updater wrappers (e.g., Update.exe) to the true application executable.
 */
function resolveSquirrelTarget(targetPath: string, appName: string): string {
  if (!/update\.exe$/i.test(targetPath)) return targetPath;
  try {
    const parentDir = path.dirname(targetPath);
    if (!fs.existsSync(parentDir)) return targetPath;
    const entries = fs.readdirSync(parentDir);
    for (const entry of entries) {
      if (entry.toLowerCase().startsWith('app-')) {
        const appDir = path.join(parentDir, entry);
        if (fs.existsSync(appDir) && fs.statSync(appDir).isDirectory()) {
          const innerFiles = fs.readdirSync(appDir);
          const cleanName = appName.toLowerCase().replace(/[^a-z0-9]/g, '');
          // Look for matching exe
          const match = innerFiles.find((f) => {
            if (!f.toLowerCase().endsWith('.exe')) return false;
            const cleanF = f.toLowerCase().replace(/[^a-z0-9]/g, '');
            return cleanF.includes(cleanName) || cleanName.includes(cleanF);
          });
          if (match) {
            return path.join(appDir, match);
          }
          // Fallback to first non-installer exe in app dir
          const anyExe = innerFiles.find(
            (f) => f.toLowerCase().endsWith('.exe') && !/update|setup|unins/i.test(f)
          );
          if (anyExe) {
            return path.join(appDir, anyExe);
          }
        }
      }
    }
  } catch {
    // Ignore read errors
  }
  return targetPath;
}

/**
 * Query Windows shell:AppsFolder via COM to enumerate user-launchable applications.
 * Avoids a global Program Files scan; only launcher/icon metadata is traversed.
 */
export async function queryAppsFolder(): Promise<RawAppsFolderItem[]> {
  if (process.platform !== 'win32') return [];

  const script = `
    $ErrorActionPreference = 'SilentlyContinue'
    $shell = New-Object -ComObject Shell.Application
    $folder = $shell.NameSpace("shell:AppsFolder")
    if (-not $folder) { exit 0 }
    $items = $folder.Items()
    $list = [System.Collections.Generic.List[PSCustomObject]]::new($items.Count)

    # Pre-index Steam game icons
    $steamMap = @{}
    $steamRoots = @(
        (Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs'),
        (Join-Path $env:PUBLIC 'Desktop'),
        ([Environment]::GetFolderPath('Desktop'))
    )
    foreach ($r in $steamRoots) {
        if (Test-Path -LiteralPath $r) {
            Get-ChildItem -LiteralPath $r -Filter "*.url" -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
                $lines = Get-Content -LiteralPath $_.FullName -ErrorAction SilentlyContinue
                $url = ($lines | Where-Object { $_ -match '^URL=(.+)$' }) -replace '^URL=', ''
                $iconFile = ($lines | Where-Object { $_ -match '^IconFile=(.+)$' }) -replace '^IconFile=', ''
                if ($url -match 'steam://rungameid/(\\d+)' -and $iconFile -and (Test-Path -LiteralPath $iconFile)) {
                    $steamMap[$matches[1]] = $iconFile
                }
            }
        }
    }

    foreach ($item in $items) {
        $name = $item.Name
        $path = $item.Path
        $target = $item.ExtendedProperty("System.Link.TargetParsingPath")
        $pkgFamily = $item.ExtendedProperty("System.AppUserModel.PackageFamilyName")
        $pkgPath = $item.ExtendedProperty("System.AppUserModel.PackageInstallPath")

        # Skip folders / directories (user constraint: no bare folders)
        if ($target -and (Test-Path -LiteralPath $target -PathType Container)) { continue }
        if ($path -and (Test-Path -LiteralPath $path -PathType Container)) { continue }

        # Skip documentation files, web links, and virtual GUIDs
        if ($target -and ($target -match '\\.(pdf|txt|chm|html?|url|rtf|docx?)$')) { continue }
        if ($path -and ($path -match '\\.(pdf|txt|chm|html?|url|rtf|docx?)$')) { continue }
        if ($path -and ($path -match '^https?://')) { continue }
        if ($target -and ($target -match '^https?://')) { continue }
        if ($path -and ($path -match '^::\\{')) { continue }

        # Skip explicit uninstallers, installers, setup, and patchers
        if ($name -match '(?i)\\b(uninstall|désinstaller|unins\\d*|setup|installer|patcher)\\b') { continue }
        if ($target -and ($target -match '(?i)[\\\\/](unins\\d*|setup|installer|patcher|launcherpatcher)\\.exe$')) { continue }

        $logoPath = $null

        # Case 1: Steam game
        if ($path -match 'steam://rungameid/(\\d+)' -or ($target -and $target -match 'steam://rungameid/(\\d+)')) {
            $appId = $matches[1]
            if ($steamMap.ContainsKey($appId)) {
                $logoPath = $steamMap[$appId]
            }
        }

        # Case 2: UWP App with PackageInstallPath
        if (-not $logoPath -and $pkgPath -and (Test-Path -LiteralPath $pkgPath)) {
            $manifestPath = Join-Path $pkgPath "AppxManifest.xml"
            if (Test-Path -LiteralPath $manifestPath) {
                try {
                    [xml]$m = Get-Content -LiteralPath $manifestPath -ErrorAction SilentlyContinue
                    $visual = $m.SelectSingleNode("//*[local-name()='VisualElements']")
                    $logoRel = if ($visual) { $visual.GetAttribute('Square44x44Logo') } else { $null }
                    if (-not $logoRel) {
                        $logoNode = $m.SelectSingleNode("//*[local-name()='Properties']/*[local-name()='Logo']")
                        if ($logoNode) { $logoRel = $logoNode.InnerText }
                    }
                    if ($logoRel) {
                        $candidate = Join-Path $pkgPath $logoRel
                        if (Test-Path -LiteralPath $candidate) {
                            $logoPath = $candidate
                        } else {
                            $dir = [System.IO.Path]::GetDirectoryName($candidate)
                            $stem = [System.IO.Path]::GetFileNameWithoutExtension($candidate)
                            $ext = [System.IO.Path]::GetExtension($candidate)
                            if (Test-Path -LiteralPath $dir) {
                                $matchesFiles = Get-ChildItem -LiteralPath $dir -Filter "*$stem*$ext" -ErrorAction SilentlyContinue |
                                    Sort-Object Length -Descending
                                if ($matchesFiles) { $logoPath = $matchesFiles[0].FullName }
                            }
                        }
                    }
                } catch {}
            }
            if (-not $logoPath) {
                $pngs = Get-ChildItem -LiteralPath $pkgPath -Recurse -Filter "*logo*.png" -ErrorAction SilentlyContinue |
                    Sort-Object Length -Descending
                if ($pngs) { $logoPath = $pngs[0].FullName }
            }
        }

        # Case 3: Win32 executable
        if (-not $logoPath -and $target -and (Test-Path -LiteralPath $target)) {
            $logoPath = $target
        }

        $list.Add([PSCustomObject]@{
            Name = $name
            ParsingPath = $path
            TargetPath = $target
            PackageFamilyName = $pkgFamily
            PackageInstallPath = $pkgPath
            LogoPath = $logoPath
        })
    }
    @($list) | ConvertTo-Json -Compress
  `;

  try {
    const { stdout } = await execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, maxBuffer: 15 * 1024 * 1024, timeout: 10000 }
    );
    if (!stdout || !stdout.trim()) return [];
    const parsed = JSON.parse(stdout.trim());
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (err) {
    log.warn('[app-inventory] shell:AppsFolder COM query failed', err);
    return [];
  }
}

/**
 * Normalizes an executable or folder path for stable identity and deduplication across updates.
 * Strips transient version directories (e.g. \app-1.0.9168\ -> \) so that updates retain the same ID.
 */
export function normalizeAppPathForIdentity(filePath?: string): string {
  if (!filePath) return '';
  const resolved = path.resolve(filePath).toLowerCase().trim();
  // Strip Squirrel/Electron transient version directories (e.g. app-1.0.9168)
  // and numeric version subdirectories (e.g. \152.0.4191.66\ or \app-26.6.0\)
  return resolved
    .replace(/[\\/]app-\d+[\w.-]*([\\/])/gi, '$1')
    .replace(/[\\/]\d+(?:\.\d+)+(?:[\w.-]*)([\\/])/gi, '$1');
}

/**
 * Builds the canonical internal ID for an application.
 * Guarantees STABLE_RESCAN and STABLE_UPDATE across version upgrades.
 */
export function buildAppRecordId(
  targetPath?: string,
  parsingPath?: string,
  name?: string
): string {
  // Signal 0: Steam game protocol (e.g. steam://rungameid/2807960)
  const steamMatch =
    (targetPath && targetPath.match(/^steam:\/\/rungameid\/(\d+)/i)) ||
    (parsingPath && parsingPath.match(/^steam:\/\/rungameid\/(\d+)/i));
  if (steamMatch) {
    return `steam:${steamMatch[1]}`;
  }

  // Signal 1: PWA wrapper (chrome_proxy / msedge_proxy)
  if (targetPath && /chrome_proxy\.exe|msedge_proxy\.exe/i.test(targetPath) && parsingPath) {
    return `pwa:${parsingPath.toLowerCase().trim()}`;
  }

  // Signal 2: Stable Squirrel AUMID (invariant across updates)
  if (parsingPath && parsingPath.toLowerCase().startsWith('com.squirrel.')) {
    return `squirrel:${parsingPath.toLowerCase().trim()}`;
  }

  // Signal 3: Win32 Target Path with transient version folder normalization
  if (targetPath) {
    const stableNorm = normalizeAppPathForIdentity(targetPath);
    return `win32:${stableNorm}`;
  }

  // Signal 4: Packaged UWP AUMID or direct parsing path
  if (parsingPath) {
    const lowerParsing = parsingPath.toLowerCase().trim();
    if (lowerParsing.includes('!')) {
      return `aumid:${lowerParsing}`;
    }
    if (lowerParsing.endsWith('.exe')) {
      return `win32:${normalizeAppPathForIdentity(lowerParsing)}`;
    }
    return `app:${lowerParsing}`;
  }

  return `app:${(name || 'unknown').toLowerCase().trim().replace(/[^a-z0-9_-]/g, '_')}`;
}

/**
 * Cleans quotes and icon index suffix (e.g. "path\app.exe",0 -> path\app.exe)
 */
export function cleanDisplayIconPath(raw?: string): string {
  if (!raw) return '';
  const trimmed = raw.trim().replace(/^"|"$/g, '');
  const clean = trimmed.replace(/,\s*-?\d+$/, '');
  return clean.replace(/^"|"$/g, '').trim();
}

export function cleanNameKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Le filtrage par NOM se fait en aval — `app-discovery.ts` et `blocking/system-guard.ts`
// en portent chacun leur version. Ce fichier ne filtre que par CHEMIN d'exécutable :
// garder ici une troisième copie morte du motif ne faisait qu'inviter la divergence.
const NON_USER_EXE_RE =
  /[\\/][^\\/]*(unins\d*|uninstall|setup|installer|install|cleanup|updater?|maintenance|repair|service|daemon|helper|crash|bugreport|bootstrapper|elevator|utility|verify|verifier|extractor|accelerator|tunnel|dxwebsetup|quicksfv|patcher|launcherpatcher)[^\\/]*\.exe$/i;

function isUserFacingExe(exePath: string): boolean {
  if (!exePath || !exePath.toLowerCase().endsWith('.exe')) return false;
  if (NON_USER_EXE_RE.test(exePath)) return false;
  return true;
}

function findExesInDir(dir: string, maxDepth = 2, currentDepth = 0): string[] {
  const results: string[] = [];
  if (currentDepth > maxDepth) return results;
  try {
    if (!fs.existsSync(dir)) return results;
    const stat = fs.statSync(dir);
    if (!stat.isDirectory()) return results;
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      try {
        const fileStat = fs.statSync(fullPath);
        if (fileStat.isDirectory()) {
          if (!/^(?:_redist|redist|installers?|support|directx|commonredist|dependencies|tools|crashreporter)$/i.test(file)) {
            results.push(...findExesInDir(fullPath, maxDepth, currentDepth + 1));
          }
        } else if (fileStat.isFile() && /\.exe$/i.test(file) && isUserFacingExe(fullPath)) {
          results.push(fullPath);
        }
      } catch {
        // Ignore unreadable directory entry
      }
    }
  } catch {
    // Ignore unreadable directory
  }
  return results;
}

export async function queryRegistryAndShortcuts(): Promise<{
  registry: RawRegistryItem[];
  shortcuts: RawShortcutItem[];
}> {
  if (process.platform !== 'win32') return { registry: [], shortcuts: [] };

  const script = `
    $ErrorActionPreference = 'SilentlyContinue'
    $roots = @(
      (Join-Path $env:ProgramData 'Microsoft\\Windows\\Start Menu\\Programs'),
      (Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs'),
      (Join-Path $env:PUBLIC 'Desktop'),
      ([Environment]::GetFolderPath('Desktop'))
    )

    $sh = New-Object -ComObject WScript.Shell
    $shortcuts = [System.Collections.Generic.List[PSCustomObject]]::new()

    foreach ($r in $roots) {
      if (Test-Path -LiteralPath $r) {
        Get-ChildItem -LiteralPath $r -Filter *.lnk -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
          try {
            $sc = $sh.CreateShortcut($_.FullName)
            $shortcuts.Add([PSCustomObject]@{
              Name = $_.BaseName
              TargetPath = $sc.TargetPath
              Arguments = $sc.Arguments
              IconLocation = $sc.IconLocation
              ShortcutPath = $_.FullName
            })
          } catch {}
        }
      }
    }

    $keys = @(
      'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
      'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
      'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
    )

    $registry = [System.Collections.Generic.List[PSCustomObject]]::new()

    Get-ItemProperty $keys -ErrorAction SilentlyContinue |
      Where-Object {
        $_.DisplayName -and
        $_.SystemComponent -ne 1 -and
        -not $_.ParentKeyName -and
        -not $_.ParentDisplayName -and
        $_.ReleaseType -ne 'Update' -and
        $_.ReleaseType -ne 'Security Update' -and
        $_.ReleaseType -ne 'Hotfix' -and
        $_.NoDisplay -ne 1
      } | ForEach-Object {
        $registry.Add([PSCustomObject]@{
          DisplayName = $_.DisplayName
          DisplayVersion = $_.DisplayVersion
          Publisher = $_.Publisher
          InstallLocation = $_.InstallLocation
          DisplayIcon = $_.DisplayIcon
          UninstallString = $_.UninstallString
        })
      }

    [PSCustomObject]@{
      Shortcuts = $shortcuts
      Registry = $registry
    } | ConvertTo-Json -Depth 3 -Compress
  `;

  try {
    const { stdout } = await execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, maxBuffer: 25 * 1024 * 1024, timeout: 15000 }
    );
    if (!stdout || !stdout.trim()) return { registry: [], shortcuts: [] };
    const parsed = JSON.parse(stdout.trim());
    return {
      registry: Array.isArray(parsed?.Registry) ? parsed.Registry : [],
      shortcuts: Array.isArray(parsed?.Shortcuts) ? parsed.Shortcuts : [],
    };
  } catch (err) {
    log.warn('[app-inventory] registry and shortcuts query failed', err);
    return { registry: [], shortcuts: [] };
  }
}

/**
 * Attaches application icons using Electron nativeImage / getFileIcon / PowerShell ExtractAssociatedIcon.
 */
async function attachIcons(records: AppRecord[]): Promise<AppRecord[]> {
  if (process.platform !== 'win32') return records;

  const results = [...records];
  const workers = Array.from({ length: Math.min(8, results.length) }, async (_, workerIndex) => {
    for (let i = workerIndex; i < results.length; i += 8) {
      const record = results[i]!;
      const candidatePaths = [
        cleanDisplayIconPath(record.logoPath),
        record.targetPath,
        record.exePath,
      ].filter((p): p is string => Boolean(p && typeof p === 'string'));

      for (const iconPath of candidatePaths) {
        if (!iconPath) continue;

        const cacheKey = normalizeAppPath(iconPath);
        if (iconCache.has(cacheKey)) {
          const cached = iconCache.get(cacheKey);
          if (cached) {
            record.iconDataUrl = cached;
            break;
          }
          continue;
        }

        try {
          if (fs.existsSync(iconPath)) {
            const ext = path.extname(iconPath).toLowerCase();
            const isIco = ext === '.ico';
            const isImage = isIco || ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.webp';
            let dataUrl: string | null = null;

            if (isImage) {
              if (electronApp && typeof electronApp.isReady === 'function' && electronApp.isReady()) {
                const img = nativeImage.createFromPath(iconPath);
                if (!img.isEmpty()) {
                  dataUrl = img.resize({ width: 32, height: 32, quality: 'good' }).toDataURL();
                }
              }
              // Direct buffer fallback for .ico / image files
              if (!dataUrl) {
                try {
                  const buf = fs.readFileSync(iconPath);
                  if (buf && buf.length > 0) {
                    const mime = isIco
                      ? 'image/x-icon'
                      : ext === '.png'
                        ? 'image/png'
                        : ext === '.webp'
                          ? 'image/webp'
                          : 'image/jpeg';
                    dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
                  }
                } catch {
                  // Ignore read error on raw buffer fallback
                }
              }
            } else if (electronApp && typeof electronApp.getFileIcon === 'function' && electronApp.isReady()) {
              const icon = await electronApp.getFileIcon(iconPath, { size: 'normal' });
              if (icon && !icon.isEmpty()) {
                const res = icon.resize({ width: 32, height: 32, quality: 'good' }).toDataURL();
                if (!isGenericWindowsIcon(res)) {
                  dataUrl = res;
                }
              }
            }

            // Fallback to PowerShell ExtractAssociatedIcon if getFileIcon was empty or generic
            if (!dataUrl && (ext === '.exe' || ext === '.lnk' || ext === '.dll')) {
              const psIcon = await extractIconWithPowerShell(iconPath);
              if (psIcon && !isGenericWindowsIcon(psIcon)) {
                dataUrl = psIcon;
              }
            }

            if (dataUrl) {
              iconCache.set(cacheKey, dataUrl);
              record.iconDataUrl = dataUrl;
              break;
            } else {
              iconCache.set(cacheKey, null);
            }
          }
        } catch {
          iconCache.set(cacheKey, null);
        }
      }
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Reconciles and eliminates any duplicates across appsFolder and Registry records.
 * Ensures that for any application, only the highest-quality single record is retained.
 */
export function reconcileAndDeduplicateInventory(records: AppRecord[]): AppRecord[] {
  const byName = new Map<string, AppRecord[]>();

  for (const r of records) {
    // 0. Filter out protected system apps, hosts/subprocesses, and non-user helpers
    if (r.isProtected || isProtectedApp(r) || isHostOrSubprocess(r.exeName) || isNonUserSystemHelper(r.name, r.exeName)) {
      continue;
    }

    // 1. Filter out directories on disk
    if (r.targetPath && fs.existsSync(r.targetPath)) {
      try {
        if (fs.statSync(r.targetPath).isDirectory()) continue;
      } catch {
        /* ignore */
      }
    }
    if (r.exePath && fs.existsSync(r.exePath)) {
      try {
        if (fs.statSync(r.exePath).isDirectory()) continue;
      } catch {
        /* ignore */
      }
    }

    // 2. Filter out bare folders/items with no extension that are neither UWP nor Steam
    const isUwp = Boolean(r.packageFamilyName || r.aumid?.includes('!'));
    const isSteam = Boolean(r.steamAppId || r.targetPath?.startsWith('steam://') || r.exePath?.startsWith('steam://'));
    if (!isUwp && !isSteam && r.exeName && !r.exeName.includes('.')) {
      continue;
    }

    const key = cleanNameKey(r.name);
    const list = byName.get(key) || [];
    list.push(r);
    byName.set(key, list);
  }

  const result: AppRecord[] = [];

  for (const [, candidates] of byName.entries()) {
    if (candidates.length === 1) {
      result.push(candidates[0]!);
      continue;
    }

    // Sort candidates to pick the highest quality record
    candidates.sort((a, b) => {
      // 1. Real existing .exe file on disk wins
      const aExists = a.exePath && fs.existsSync(a.exePath) && a.exePath.toLowerCase().endsWith('.exe') ? 500 : 0;
      const bExists = b.exePath && fs.existsSync(b.exePath) && b.exePath.toLowerCase().endsWith('.exe') ? 500 : 0;

      // 2. Real executable name wins over bare protocol stub (e.g. bf6.exe > 2807960)
      const aReal = a.exeName && a.exeName.toLowerCase().endsWith('.exe') && !a.exeName.startsWith('steam') && !/^\d+$/.test(a.exeName) ? 300 : 0;
      const bReal = b.exeName && b.exeName.toLowerCase().endsWith('.exe') && !b.exeName.startsWith('steam') && !/^\d+$/.test(b.exeName) ? 300 : 0;

      // 3. User manual override bonus
      const aOverride = a.classificationSource === 'USER_OVERRIDE' ? 100 : 0;
      const bOverride = b.classificationSource === 'USER_OVERRIDE' ? 100 : 0;

      // 4. Main executable wins over patcher or setup
      const aPatcher = NON_USER_EXE_RE.test(a.exeName || a.exePath || '') ? -200 : 0;
      const bPatcher = NON_USER_EXE_RE.test(b.exeName || b.exePath || '') ? -200 : 0;

      // 5. Metadata richness
      const aMeta = (a.logoPath ? 10 : 0) + (a.publisher ? 10 : 0) + (a.iconDataUrl ? 10 : 0);
      const bMeta = (b.logoPath ? 10 : 0) + (b.publisher ? 10 : 0) + (b.iconDataUrl ? 10 : 0);

      const scoreA = aExists + aReal + aOverride + aPatcher + aMeta;
      const scoreB = bExists + bReal + bOverride + bPatcher + bMeta;
      return scoreB - scoreA;
    });

    const winner = { ...candidates[0]! };

    // If winner has a non-exe or numeric name (like 2807960), but another candidate has a real exeName:
    const realCandidate = candidates.find(
      (c) => c.exeName && c.exeName.toLowerCase().endsWith('.exe') && !c.exeName.startsWith('steam') && !/^\d+$/.test(c.exeName),
    );
    if (
      realCandidate &&
      (!winner.exeName || !winner.exeName.toLowerCase().endsWith('.exe') || winner.exeName.startsWith('steam') || /^\d+$/.test(winner.exeName))
    ) {
      winner.exeName = realCandidate.exeName;
      winner.exePath = realCandidate.exePath;
      winner.targetPath = realCandidate.targetPath;
    }

    // Transfer missing metadata or user override from losers to winner
    for (let i = 1; i < candidates.length; i++) {
      const loser = candidates[i]!;
      if (loser.classificationSource === 'USER_OVERRIDE' && winner.classificationSource !== 'USER_OVERRIDE') {
        winner.category = loser.category;
        winner.classificationSource = loser.classificationSource;
        winner.classificationState = loser.classificationState;
        winner.classificationReasonCode = loser.classificationReasonCode;
      }
      if (!winner.logoPath && loser.logoPath) winner.logoPath = loser.logoPath;
      if (!winner.publisher && loser.publisher) winner.publisher = loser.publisher;
      if (!winner.iconDataUrl && loser.iconDataUrl) winner.iconDataUrl = loser.iconDataUrl;
      if (!winner.steamAppId && loser.steamAppId) winner.steamAppId = loser.steamAppId;
    }

    result.push(winner);
  }

  return result;
}

/**
 * Scans, normalizes, deduplicates, and classifies the full application inventory.
 */
export async function scanAppsFolderInventory(): Promise<AppRecord[]> {
  const [rawItems, regAndShortcuts] = await Promise.all([
    queryAppsFolder(),
    queryRegistryAndShortcuts(),
  ]);

  const recordsMapById = new Map<string, AppRecord>();
  const recordsMapByTarget = new Map<string, AppRecord>();
  const recordsMapByName = new Map<string, AppRecord>();
  const recordsMapBySteamId = new Map<string, AppRecord>();

  // 1. Process shell:AppsFolder items
  for (const raw of rawItems) {
    const name = (raw.Name || '').trim();
    if (!name) continue;

    let targetPath = raw.TargetPath ? raw.TargetPath.trim() : '';
    const parsingPath = raw.ParsingPath ? raw.ParsingPath.trim() : '';
    const pkgFamily = raw.PackageFamilyName ? raw.PackageFamilyName.trim() : '';

    // Skip directories on disk (user rule: do not take folders as apps)
    if (targetPath && fs.existsSync(targetPath)) {
      try {
        if (fs.statSync(targetPath).isDirectory()) continue;
      } catch {
        /* ignore */
      }
    }
    if (parsingPath && fs.existsSync(parsingPath)) {
      try {
        if (fs.statSync(parsingPath).isDirectory()) continue;
      } catch {
        /* ignore */
      }
    }

    // Skip non-user executables (e.g. installers, updaters, patchers)
    if (targetPath && NON_USER_EXE_RE.test(targetPath)) {
      continue;
    }

    if (targetPath) {
      targetPath = resolveSquirrelTarget(targetPath, name);
    }

    // Detect Steam URL scheme (e.g. steam://rungameid/2807960)
    const steamTargetMatch =
      (targetPath && targetPath.match(/^steam:\/\/rungameid\/(\d+)/i)) ||
      (parsingPath && parsingPath.match(/^steam:\/\/rungameid\/(\d+)/i));
    const steamAppId = steamTargetMatch ? steamTargetMatch[1] : undefined;

    let exeName = '';
    if (targetPath) {
      exeName = path.basename(targetPath);
    } else if (parsingPath && parsingPath.toLowerCase().endsWith('.exe')) {
      exeName = path.basename(parsingPath);
      targetPath = parsingPath;
    } else if (pkgFamily) {
      exeName = `${pkgFamily.split('_')[0] || name}.exe`;
    } else {
      exeName = `${name}.exe`;
    }

    if (isHostOrSubprocess(exeName) || isNonUserSystemHelper(name, exeName)) {
      continue;
    }

    const isProtected = isProtectedApp({
      name,
      targetPath,
      aumid: parsingPath,
      packageFamilyName: pkgFamily,
      exeName,
    });

    if (isProtected) {
      continue;
    }

    const id = buildAppRecordId(targetPath, parsingPath, name);

    const classification = resolveAppClassificationSync(
      {
        id,
        name,
        exeName,
        exePath: targetPath || parsingPath || '',
        targetPath: targetPath || undefined,
        parsingPath: parsingPath || undefined,
        aumid: parsingPath || undefined,
        packageFamilyName: pkgFamily || undefined,
        publisher: '',
      },
      'SETTINGS_SCAN',
    );

    const record: AppRecord = {
      id,
      name,
      exeName,
      exePath: targetPath || parsingPath || '',
      publisher: '',
      category: classification.category,
      classificationState: classification.classificationState,
      classificationSource: classification.classificationSource,
      classificationReasonCode: classification.classificationReasonCode,
      classifierVersion: classification.classifierVersion,
      source: 'appsFolder',
      isProtected,
      targetPath: targetPath || undefined,
      steamAppId,
      aumid: parsingPath || undefined,
      packageFamilyName: pkgFamily || undefined,
      packageInstallPath: raw.PackageInstallPath || undefined,
      logoPath: raw.LogoPath || undefined,
      lastSeenAt: Date.now(),
    };

    if (classification.classificationState === 'UNRESOLVED' && !isProtected) {
      enqueueUnknownAppForCatalogEnrichment({
        id,
        name,
        exeName,
        targetPath: targetPath || undefined,
        packageFamilyName: pkgFamily || undefined,
        aumid: parsingPath || undefined,
        publisher: '',
      });
    }

    if (targetPath) {
      const normTarget = normalizeAppPath(targetPath);
      recordsMapByTarget.set(normTarget, record);
    }
    recordsMapById.set(id, record);
    recordsMapByName.set(cleanNameKey(name), record);
    if (steamAppId) {
      recordsMapBySteamId.set(steamAppId, record);
    }
  }

  // 2. Index shortcuts for fast matching
  const shortcutsMap = new Map<string, RawShortcutItem>();
  for (const sc of regAndShortcuts.shortcuts) {
    if (sc.Name) {
      shortcutsMap.set(cleanNameKey(sc.Name), sc);
    }
  }

  // 3. Process Windows Uninstall Registry items (Programs & Features)
  for (const item of regAndShortcuts.registry) {
    const rawName = (item.DisplayName || '').trim();
    if (!rawName || isNonUserSystemHelper(rawName) || isProtectedApp({ name: rawName })) continue;

    const cleanName = cleanNameKey(rawName);
    const installLoc = item.InstallLocation ? cleanDisplayIconPath(item.InstallLocation) : '';
    const cleanIcon = cleanDisplayIconPath(item.DisplayIcon);
    const uninst = item.UninstallString ? item.UninstallString.trim() : '';
    const isSteam = /steam:\/\/uninstall\/|steam\.exe/i.test(uninst);

    let exePath = '';
    let logoPath = '';

    // Step A: Check DisplayIcon for executable and icon
    if (cleanIcon && fs.existsSync(cleanIcon)) {
      logoPath = cleanIcon;
      if (cleanIcon.toLowerCase().endsWith('.exe') && isUserFacingExe(cleanIcon)) {
        exePath = cleanIcon;
      }
    }

    // Step B: Check matching desktop or start menu shortcut
    const matchedShortcut =
      shortcutsMap.get(cleanName) ||
      shortcutsMap.get(cleanNameKey(rawName.replace(/\s+\d+(\.\d+)*$/u, ''))) ||
      shortcutsMap.get(cleanNameKey(rawName.split(' - ')[0] || ''));

    if (matchedShortcut) {
      if (!exePath && matchedShortcut.TargetPath && fs.existsSync(matchedShortcut.TargetPath)) {
        const norm = matchedShortcut.TargetPath.trim();
        if (isUserFacingExe(norm)) {
          exePath = norm;
        }
      }
      if (!logoPath) {
        const scIcon = cleanDisplayIconPath(matchedShortcut.IconLocation);
        if (scIcon && fs.existsSync(scIcon)) {
          logoPath = scIcon;
        } else if (matchedShortcut.ShortcutPath && fs.existsSync(matchedShortcut.ShortcutPath)) {
          logoPath = matchedShortcut.ShortcutPath;
        }
      }
    }

    // Step C: Check InstallLocation for matching executable
    if (!exePath && installLoc && fs.existsSync(installLoc)) {
      const foundExes = findExesInDir(installLoc, 2);
      if (foundExes.length > 0) {
        let bestExe = '';
        let bestScore = -1;
        for (const fe of foundExes) {
          const base = path.basename(fe, '.exe');
          const cleanBase = cleanNameKey(base);
          let score = 0;
          if (cleanBase === cleanName) {
            score = 100;
          } else if (cleanName.startsWith(cleanBase) || cleanBase.startsWith(cleanName)) {
            score = 50;
          } else if (cleanName.includes(cleanBase) || cleanBase.includes(cleanName)) {
            score = 25;
          }
          score -= fe.split(path.sep).length * 0.1;
          if (score > bestScore) {
            bestScore = score;
            bestExe = fe;
          }
        }
        if (bestExe && bestScore > 0) {
          exePath = bestExe;
        }
      }
    }

    // Step D: Special resolution for Steam games
    if (isSteam && !exePath) {
      if (installLoc && fs.existsSync(installLoc)) {
        const exes = findExesInDir(installLoc, 2);
        if (exes[0]) exePath = exes[0];
      }
    }

    // STRICT USER CONSTRAINT: "sans pour autant prendre des folders qui sont normalement pas des apps"
    // If no valid executable was found on disk, SKIP this item (do not add bare folders or non-app stubs)
    if (!exePath || !fs.existsSync(exePath) || !isUserFacingExe(exePath)) {
      continue;
    }

    if (!logoPath) {
      logoPath = exePath;
    }

    const exeName = path.basename(exePath);
    if (isHostOrSubprocess(exeName) || isNonUserSystemHelper(rawName, exeName)) {
      continue;
    }

    const isProtected = isProtectedApp({
      name: rawName,
      targetPath: exePath,
      exeName,
    });

    if (isProtected) {
      continue;
    }

    const steamMatch = uninst.match(/uninstall[/:](?:.*\/)?(\d+)/i);
    const regSteamAppId = steamMatch ? steamMatch[1] : undefined;

    const id = regSteamAppId ? `steam:${regSteamAppId}` : buildAppRecordId(exePath, undefined, rawName);
    const normTarget = normalizeAppPath(exePath);

    // Look for existing record from appsFolder by Steam ID, target path, ID, or clean name
    const existing =
      (regSteamAppId ? recordsMapBySteamId.get(regSteamAppId) : null) ||
      recordsMapByTarget.get(normTarget) ||
      recordsMapById.get(id) ||
      recordsMapByName.get(cleanName);

    if (existing) {
      existing.exeName = exeName;
      existing.exePath = exePath;
      existing.targetPath = exePath;
      if (!existing.publisher && item.Publisher) {
        existing.publisher = String(item.Publisher).trim();
      }
      if (!existing.logoPath && logoPath) {
        existing.logoPath = logoPath;
      }
      if (regSteamAppId) {
        existing.steamAppId = regSteamAppId;
      }
      // If the existing record was unresolved, re-resolve classification with real executable
      if (existing.category === null || existing.classificationState === 'UNRESOLVED') {
        const reCl = resolveAppClassificationSync(
          {
            id: existing.id,
            name: existing.name,
            exeName,
            exePath,
            targetPath: exePath,
            publisher: existing.publisher,
          },
          'SETTINGS_SCAN',
        );
        if (reCl.classificationState === 'RESOLVED') {
          existing.category = reCl.category;
          existing.classificationState = reCl.classificationState;
          existing.classificationSource = reCl.classificationSource;
          existing.classificationReasonCode = reCl.classificationReasonCode;
          existing.classifierVersion = reCl.classifierVersion;
        }
      }
      recordsMapByTarget.set(normTarget, existing);
      continue;
    }

    const classification = resolveAppClassificationSync(
      {
        id,
        name: rawName,
        exeName,
        exePath,
        targetPath: exePath,
        publisher: String(item.Publisher || '').trim(),
      },
      'SETTINGS_SCAN',
    );

    const record: AppRecord = {
      id,
      name: rawName,
      exeName,
      exePath,
      publisher: String(item.Publisher || '').trim(),
      category: classification.category,
      classificationState: classification.classificationState,
      classificationSource: classification.classificationSource,
      classificationReasonCode: classification.classificationReasonCode,
      classifierVersion: classification.classifierVersion,
      source: 'registry',
      isProtected,
      targetPath: exePath,
      steamAppId: regSteamAppId,
      logoPath: logoPath || undefined,
      lastSeenAt: Date.now(),
    };

    if (classification.classificationState === 'UNRESOLVED' && !isProtected) {
      enqueueUnknownAppForCatalogEnrichment({
        id,
        name: rawName,
        exeName,
        targetPath: exePath,
        publisher: record.publisher,
      });
    }

    recordsMapByTarget.set(normTarget, record);
    recordsMapById.set(id, record);
    recordsMapByName.set(cleanName, record);
    if (regSteamAppId) {
      recordsMapBySteamId.set(regSteamAppId, record);
    }
  }

  const rawList = Array.from(recordsMapById.values());
  const list = reconcileAndDeduplicateInventory(rawList);

  // Deterministic sort: non-protected first, then alphabetical by name
  list.sort((a, b) => {
    if (a.isProtected !== b.isProtected) {
      return a.isProtected ? 1 : -1;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  const recordsWithIcons = await attachIcons(list);
  inventoryCache = recordsWithIcons;
  lastInventoryScanTime = Date.now();

  log.info(`[app-inventory] scanned ${recordsWithIcons.length} apps via shell:AppsFolder + Registry`);
  return recordsWithIcons;
}

/**
 * Returns the cached inventory or triggers a fresh scan if expired or forced.
 */
export async function getOrRefreshInventory(options: { force?: boolean } = {}): Promise<AppRecord[]> {
  const isExpired = Date.now() - lastInventoryScanTime > INVENTORY_CACHE_TTL_MS;
  if (!options.force && inventoryCache && !isExpired) {
    return inventoryCache;
  }
  return scanAppsFolderInventory();
}

/**
 * Passive discovery: when a window or process becomes active, check if it's already
 * in the inventory. If not, record it as a passive entry.
 */
export function recordActiveProcess(
  exePath: string,
  windowTitle?: string,
  pid?: number
): AppRecord | null {
  if (!exePath) return null;
  const normPath = normalizeAppPath(exePath);
  const exeName = path.basename(exePath);

  // Filter out system tools and helpers
  if (isProtectedExe(exeName, exePath) || isHostOrSubprocess(exeName)) {
    return null;
  }

  if (!inventoryCache) {
    inventoryCache = [];
  }

  // Check existing entry by exact canonical path (prevents collisions between two different game.exe)
  const existing = inventoryCache.find(
    (app) =>
      (app.targetPath && normalizeAppPath(app.targetPath) === normPath) ||
      (app.exePath && normalizeAppPath(app.exePath) === normPath) ||
      app.id === `passive:${normPath}`
  );

  if (existing) {
    existing.lastSeenAt = Date.now();
    return existing;
  }

  // Unknown application detected passively!
  const name = windowTitle && windowTitle.trim() ? windowTitle.trim() : path.basename(exePath, '.exe');
  const id = `passive:${normPath}`;

  const classification = resolveAppClassificationSync(
    {
      id,
      name,
      exeName,
      exePath,
      targetPath: exePath,
      publisher: '',
    },
    'PASSIVE_DISCOVERY'
  );

  const newRecord: AppRecord = {
    id,
    name,
    exeName,
    exePath,
    publisher: '',
    category: classification.category,
    classificationState: classification.classificationState,
    classificationSource: classification.classificationSource,
    classificationReasonCode: classification.classificationReasonCode,
    classifierVersion: classification.classifierVersion,
    source: 'passive',
    isProtected: false,
    targetPath: exePath,
    lastSeenAt: Date.now(),
  };

  inventoryCache.push(newRecord);
  log.info(`[app-inventory] passively registered new app: ${name} (${exeName}, pid=${pid})`);

  if (classification.classificationState === 'UNRESOLVED') {
    enqueueUnknownAppForCatalogEnrichment({
      id,
      name,
      exeName,
      targetPath: exePath,
      publisher: '',
    });
  }

  return newRecord;
}

/**
 * Met à jour une application de l'inventaire en mémoire si sa classification a changé.
 */
export function updateInventoryRecordCategory(
  idOrExe: string,
  updates: Partial<Pick<AppRecord, 'category' | 'classificationState' | 'classificationSource' | 'classificationReasonCode'>>
): boolean {
  if (!inventoryCache) return false;
  let changed = false;
  const target = idOrExe.toLowerCase().trim();
  for (const item of inventoryCache) {
    if (
      item.id.toLowerCase() === target ||
      item.exeName.toLowerCase() === target ||
      item.name.toLowerCase() === target
    ) {
      Object.assign(item, updates);
      changed = true;
    }
  }
  return changed;
}

export function getCachedInventory(): AppRecord[] | null {
  return inventoryCache;
}
