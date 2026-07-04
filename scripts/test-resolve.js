const { execFile } = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('path');
const execFilePromise = util.promisify(execFile);

// Helper from app-discovery.ts
function expandEnvVars(value) {
  if (!value) return '';
  return value.replace(/%([^%]+)%/g, (_, key) => {
    const match = Object.keys(process.env).find((envKey) => envKey.toLowerCase() === key.toLowerCase());
    return match ? (process.env[match] ?? '') : `%${key}%`;
  });
}

function normalizeExePath(value) {
  if (!value) return '';
  const expanded = expandEnvVars(value.trim().replace(/^"|"$/g, ''));
  if (!expanded || !/\.exe$/i.test(expanded)) return '';
  return path.normalize(expanded);
}

function extractExePathFromDisplayIcon(displayIcon) {
  if (!displayIcon) return '';
  const trimmed = expandEnvVars(displayIcon.trim());
  const match = /"([^"]+\.exe)"|([a-z]:\\[^,"]+?\.exe)(?:,|$)/i.exec(trimmed);
  return normalizeExePath(match?.[1] ?? match?.[2] ?? '');
}

function canonicalNameKey(value) {
  return value
    .replace(/\s*\((?:user|machine)\)\s*$/iu, '')
    .replace(/\s+\d+(?:\.\d+){1,3}\s*$/u, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Find all exe files in a folder recursively up to depth
function findExesInDir(dir, maxDepth = 2, currentDepth = 0) {
  const results = [];
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
          results.push(...findExesInDir(fullPath, maxDepth, currentDepth + 1));
        } else if (fileStat.isFile() && /\.exe$/i.test(file)) {
          results.push(fullPath);
        }
      } catch (e) {}
    }
  } catch (e) {}
  return results;
}

const NON_USER_EXE_RE =
  /[\\/][^\\/]*(unins\d*|uninstall|setup|installer|install|cleanup|updater?|maintenance|repair|service|daemon|helper|crash|bugreport|bootstrapper|elevator|utility|verify|verifier|extractor|accelerator|tunnel)[^\\/]*\.exe$/i;

const NON_USER_PATH_SEGMENT_RE =
  /[\\/](usr[\\/]bin|usr[\\/]libexec|resources|helpers|vendor|node_modules|__pycache__|electron[\\/]dist|squirrel|scripts|tools|autoupdate|autoupdater|__installer|__updater|bin[\\/](x86|x64|amd64|arm64))[\\/]/i;

async function run() {
  // 1. Read shortcuts
  const shortcutScript = `
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
                ShortcutPath = $_.FullName
              }
            } catch {}
          }
      }
    }
    @($items) | ConvertTo-Json -Depth 2
  `;

  console.log('Reading shortcuts...');
  const { stdout: shortcutStdout } = await execFilePromise(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', shortcutScript],
    { maxBuffer: 10 * 1024 * 1024 }
  );
  const shortcuts = JSON.parse(shortcutStdout.trim() || '[]');
  console.log(`Read ${shortcuts.length} shortcuts.`);

  // Create shortcuts map by canonical name
  const shortcutMap = new Map();
  for (const s of shortcuts) {
    const canonical = canonicalNameKey(s.Name || '');
    if (canonical && s.TargetPath) {
      const p = normalizeExePath(s.TargetPath);
      if (p) {
        shortcutMap.set(canonical, p);
      }
    }
  }

  // 2. Read registry
  const registryScript = `
    $OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $paths = @(
      'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
      'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
      'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
    )
    $apps = foreach ($p in $paths) {
      Get-ItemProperty $p -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -and -not $_.SystemComponent -and -not $_.ParentDisplayName -and -not $_.NoDisplay } |
        Select-Object DisplayName, InstallLocation, DisplayIcon, Publisher, SystemComponent, NoDisplay, ReleaseType
    }
    @($apps) | ConvertTo-Json -Depth 2
  `;

  console.log('Reading registry uninstall entries...');
  const { stdout: registryStdout } = await execFilePromise(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', registryScript],
    { maxBuffer: 10 * 1024 * 1024 }
  );
  const registryItems = JSON.parse(registryStdout.trim() || '[]');
  console.log(`Read ${registryItems.length} registry entries.`);

  const resolvedApps = [];
  for (const item of registryItems) {
    const name = item.DisplayName || '';
    if (!name) continue;

    // Filter out updates
    if (item.ReleaseType === 'Update' || item.ReleaseType === 'Hotfix') continue;

    let exePath = extractExePathFromDisplayIcon(item.DisplayIcon || '');
    let method = 'DisplayIcon';

    // If no exe from DisplayIcon, try shortcut mapping
    if (!exePath) {
      const canonical = canonicalNameKey(name);
      if (shortcutMap.has(canonical)) {
        exePath = shortcutMap.get(canonical);
        method = 'ShortcutMap';
      }
    }

    // If still no exe, and we have InstallLocation, scan folder
    if (!exePath && item.InstallLocation) {
      const loc = expandEnvVars(item.InstallLocation.trim().replace(/^"|"$/g, ''));
      if (loc && fs.existsSync(loc)) {
        const exes = findExesInDir(loc, 2)
          .filter(e => !NON_USER_EXE_RE.test(e) && !NON_USER_PATH_SEGMENT_RE.test(e));
        
        if (exes.length > 0) {
          // Score exes based on name similarity
          const nameLower = name.toLowerCase();
          const scored = exes.map(e => {
            const base = path.basename(e, '.exe').toLowerCase();
            let score = 0;
            if (nameLower.includes(base) || base.includes(nameLower)) {
              score += 10;
            }
            // Prefer shorter paths (less nested)
            score -= (e.split(path.sep).length * 0.1);
            return { path: e, score };
          });
          scored.sort((a, b) => b.score - a.score);
          exePath = scored[0].path;
          method = 'FolderScan';
        }
      }
    }

    resolvedApps.push({
      name,
      exePath,
      method,
      installLocation: item.InstallLocation,
      displayIcon: item.DisplayIcon
    });
  }

  // Print results
  console.log('\n--- RESOLVED APPS ---');
  for (const app of resolvedApps) {
    console.log(`Name: ${app.name}`);
    console.log(`  Path: ${app.exePath || 'FAILED TO RESOLVE'}`);
    console.log(`  Method: ${app.method}`);
  }
}

run();
