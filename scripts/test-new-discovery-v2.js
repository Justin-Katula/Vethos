const { execFile } = require('child_process');
const util = require('util');
const fs = require('fs');
const path = require('path');
const execFilePromise = util.promisify(execFile);

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

const NON_USER_EXE_RE =
  /[\\/][^\\/]*(unins\d*|uninstall|setup|installer|install|cleanup|updater?|maintenance|repair|service|daemon|helper|crash|bugreport|bootstrapper|elevator|utility|verify|verifier|extractor|accelerator|tunnel)[^\\/]*\.exe$/i;

const NON_USER_PATH_SEGMENT_RE =
  /[\\/](usr[\\/]bin|usr[\\/]libexec|resources|helpers|vendor|node_modules|__pycache__|electron[\\/]dist|squirrel|scripts|tools|autoupdate|autoupdater|__installer|__updater|bin[\\/](x86|x64|amd64|arm64))[\\/]/i;

function isUserFacingExe(exePath) {
  if (!exePath) return false;
  if (NON_USER_EXE_RE.test(exePath)) return false;
  if (NON_USER_PATH_SEGMENT_RE.test(exePath)) return false;
  return true;
}

function extractExePath(str) {
  if (!str) return '';
  const trimmed = expandEnvVars(str.trim());
  const match = /"([^"]+\.exe)"|([a-z]:\\[^,"]+?\.exe)(?:[\s,]|$)/i.exec(trimmed);
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

function sanitizeExeBase(value) {
  return value
    .normalize('NFKD')
    .replace(/[^\w.\- ]/g, '')
    .replace(/\s+/g, '')
    .replace(/\.exe$/i, '')
    .trim();
}

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

async function run() {
  // 1. Read start menu shortcuts for path resolution
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

  const { stdout: shortcutStdout } = await execFilePromise(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', shortcutScript],
    { maxBuffer: 10 * 1024 * 1024 }
  );
  const shortcuts = JSON.parse(shortcutStdout.trim() || '[]');

  const shortcutMap = new Map();
  for (const s of shortcuts) {
    const name = s.Name || '';
    let target = normalizeExePath(s.TargetPath || '');
    const args = s.Arguments || '';
    
    if (/chrome_proxy\.exe$/i.test(target) && /--app-id=/i.test(args)) {
      target = path.join(path.dirname(target), 'chrome.exe');
    }
    
    if (/update\.exe$/i.test(target) && /--processStart/i.test(args)) {
      const match = /--processStart\s+([^\s"]+\.exe)/i.exec(args);
      if (match?.[1]) {
        const appExe = match[1];
        const parentDir = path.dirname(target);
        let resolvedPath = path.join(parentDir, appExe);
        try {
          const dirs = fs.readdirSync(parentDir);
          for (const dir of dirs) {
            if (dir.startsWith('app-')) {
              const fullPath = path.join(parentDir, dir, appExe);
              if (fs.existsSync(fullPath)) {
                resolvedPath = fullPath;
                break;
              }
            }
          }
        } catch (e) {}
        target = resolvedPath;
      }
    }

    if (name && target && isUserFacingExe(target)) {
      const canonical = canonicalNameKey(name);
      shortcutMap.set(canonical, target);
    }
  }

  // 2. Read AppX Packages
  const appxScript = `
    $OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $apps = Get-AppxPackage | Where-Object { -not $_.IsFramework } | ForEach-Object {
      $pkg = $_
      $displayName = $pkg.Name
      $exePath = ''
      $publisher = ''
      $manifestPath = Join-Path $pkg.InstallLocation 'AppxManifest.xml'
      if (Test-Path -LiteralPath $manifestPath -ErrorAction SilentlyContinue) {
        try {
          [xml]$manifest = Get-Content -LiteralPath $manifestPath -ErrorAction SilentlyContinue
          $dn = $manifest.Package.Properties.DisplayName
          if ($dn -and $dn -notmatch '^ms-resource:') { $displayName = $dn }
          $pub = $manifest.Package.Properties.PublisherDisplayName
          if ($pub -and $pub -notmatch '^ms-resource:') { $publisher = $pub }
          $appElements = $manifest.Package.Applications.Application
          if ($appElements) {
            $firstApp = if ($appElements -is [array]) { $appElements[0] } else { $appElements }
            $exe = $firstApp.Executable
            if ($exe) { $exePath = Join-Path $pkg.InstallLocation $exe }
          }
        } catch {}
      }
      [pscustomobject]@{
        DisplayName = $displayName
        ExecutablePath = $exePath
        PackageFamilyName = $pkg.PackageFamilyName
        Publisher = $publisher
      }
    }
    @($apps) | ConvertTo-Json -Depth 2
  `;

  const { stdout: appxStdout } = await execFilePromise(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', appxScript],
    { maxBuffer: 10 * 1024 * 1024 }
  );
  const appxPackages = JSON.parse(appxStdout.trim() || '[]');

  // 3. Read Registry Uninstall Entries
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
        Select-Object DisplayName, InstallLocation, DisplayIcon, Publisher, SystemComponent, NoDisplay, ReleaseType, UninstallString
    }
    @($apps) | ConvertTo-Json -Depth 2
  `;

  const { stdout: registryStdout } = await execFilePromise(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', registryScript],
    { maxBuffer: 10 * 1024 * 1024 }
  );
  const registryItems = JSON.parse(registryStdout.trim() || '[]');

  const finalApps = new Map();

  function addCandidate(name, exePath, publisher, source, packageId = undefined) {
    const canonicalName = canonicalNameKey(name);
    if (!canonicalName) return;

    let hasExecutablePath = false;
    let exeName = '';

    if (exePath && isUserFacingExe(exePath)) {
      hasExecutablePath = true;
      exeName = path.basename(exePath);
    } else {
      exePath = '';
      const base = sanitizeExeBase(name);
      exeName = base ? `${base}.exe` : 'unknown.exe';
    }

    const newApp = {
      name,
      exeName,
      exePath,
      publisher: publisher || '',
      source,
      hasExecutablePath
    };
    if (packageId) newApp.packageId = packageId;

    const existing = finalApps.get(canonicalName);
    if (!existing || (!existing.hasExecutablePath && hasExecutablePath)) {
      finalApps.set(canonicalName, newApp);
    }
  }

  // Add AppX apps first
  const APPX_SYSTEM_PREFIXES = [
    'microsoft.windows.', 'microsoftwindows.', 'windows.', 'microsoft.win32',
    'microsoft.net.', 'microsoft.ui.', 'microsoft.vclibs', 'microsoft.services.',
    'microsoft.directx', 'microsoft.appruntime', 'microsoftcorporationii.winappruntime',
    'microsoft.winget.', 'microsoft.startexperiences', 'microsoft.windowsappruntime',
    'microsoft.crossdevice'
  ];
  const APPX_SYSTEM_NAMES = new Set([
    'microsoft.lockapp', 'microsoft.ecapp', 'microsoft.widgetsplatformruntime',
    'microsoft.storepurchaseapp', 'microsoft.webmediaextensions', 'microsoft.webpimageextension',
    'microsoft.hevcvideoextension', 'microsoft.vp9videoextensions', 'microsoft.rawimageextension',
    'microsoft.heifimageextension', 'microsoft.av1videoextension', 'microsoft.xboxidentityprovider',
    'microsoft.xboxspeechtotextoverlay', 'microsoft.xboxgamecallableui', 'pinningconfirmationdialog',
    'widgets platform runtime', 'udk package', 'winappruntime.main.1.8', 'winappruntime.singleton',
    'windows web experience pack', 'microsoft.applicationcompatibilityenhancements',
    'microsoft.sechealthui', 'microsoft.edge.gameassist',
    'microsoft.desktopappinstaller', 'microsoft.bingsearch', 'microsoft.bingnews'
  ]);
  const APPX_KEYWORD_RE =
    /\b(framework|runtime|extension|extensions|singleton|main\.\d|\.net\.|vclibs|directx|services\.|appruntime|speech pack|cbspreview|undocked|printdialog|cloudexperience|assignedaccess|captiveportal|connectionflow|parentalcontrols|peoplexperience|printqueueaction|secureassessment|engagement|windowsappruntime|winappruntime|xaml|native|audio processing|encoder|decoder)\b/i;

  for (const pkg of appxPackages) {
    const name = pkg.DisplayName || '';
    const family = pkg.PackageFamilyName || '';
    const lowerName = name.toLowerCase();
    const lowerFamily = family.toLowerCase();

    // System filters
    let isSystem = false;
    for (const prefix of APPX_SYSTEM_PREFIXES) {
      if (lowerName.startsWith(prefix) || lowerFamily.startsWith(prefix)) {
        isSystem = true;
        break;
      }
    }
    if (APPX_SYSTEM_NAMES.has(lowerName)) isSystem = true;
    if (APPX_KEYWORD_RE.test(name) || APPX_KEYWORD_RE.test(family)) isSystem = true;
    
    // GUID name filter
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(name)) isSystem = true;
    
    // SystemApps directory filter
    if (pkg.ExecutablePath && /SystemApps/i.test(pkg.ExecutablePath)) isSystem = true;

    if (!isSystem && name) {
      addCandidate(name, pkg.ExecutablePath, pkg.Publisher, 'appx', family);
    }
  }

  // Add Registry apps
  for (const item of registryItems) {
    const name = item.DisplayName || '';
    if (!name) continue;
    if (item.ReleaseType === 'Update' || item.ReleaseType === 'Hotfix') continue;

    let exePath = extractExePath(item.DisplayIcon || '');
    if (exePath && !isUserFacingExe(exePath)) exePath = '';

    if (!exePath) {
      exePath = extractExePath(item.UninstallString || '');
      if (exePath && !isUserFacingExe(exePath)) exePath = '';
    }

    if (!exePath) {
      const canonical = canonicalNameKey(name);
      if (shortcutMap.has(canonical)) {
        exePath = shortcutMap.get(canonical);
      } else {
        for (const [shortcutName, target] of shortcutMap.entries()) {
          if (canonical.startsWith(shortcutName) || shortcutName.startsWith(canonical)) {
            exePath = target;
            break;
          }
        }
      }
    }

    if (!exePath && item.InstallLocation) {
      const loc = expandEnvVars(item.InstallLocation.trim().replace(/^"|"$/g, ''));
      if (loc && fs.existsSync(loc)) {
        const exes = findExesInDir(loc, 2)
          .filter(e => isUserFacingExe(e));
        if (exes.length > 0) {
          const nameLower = name.toLowerCase();
          const scored = exes.map(e => {
            const base = path.basename(e, '.exe').toLowerCase();
            let score = 0;
            if (nameLower.includes(base) || base.includes(nameLower)) {
              score += 10;
            }
            score -= (e.split(path.sep).length * 0.1);
            return { path: e, score };
          });
          scored.sort((a, b) => b.score - a.score);
          exePath = scored[0].path;
        }
      }
    }

    addCandidate(name, exePath, item.Publisher, 'registry');
  }

  const sortedList = [...finalApps.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  
  console.log(`\nFinal count: ${sortedList.length} apps discovered.`);
  fs.writeFileSync('new-scan-results-v2.json', JSON.stringify(sortedList, null, 2), 'utf-8');
}

run();
