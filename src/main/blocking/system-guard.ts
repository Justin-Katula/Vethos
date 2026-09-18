import path from 'path';

/**
 * SystemGuard
 *
 * Enforces inviolable safety rules to prevent Vethos from ever blocking critical
 * Windows components, administrative utilities, terminal environments, or itself.
 * Runs BOTH before DeepSeek candidate submission AND after DeepSeek target selection.
 */

function getSystemRoot(): string {
  const sysRoot = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
  return path.resolve(sysRoot).toLowerCase();
}

function normalizePath(p?: string): string {
  if (!p) return '';
  return path.resolve(p).toLowerCase();
}

/**
 * Checks if targetPath is strictly inside the Windows directory (e.g. C:\Windows or C:\Windows\System32).
 */
export function isUnderSystemRoot(targetPath?: string): boolean {
  if (!targetPath) return false;
  const normalized = normalizePath(targetPath);
  const sysRoot = getSystemRoot();
  return normalized === sysRoot || normalized.startsWith(sysRoot + path.sep);
}

/**
 * Known protected executable basenames (lowercase).
 */
export const PROTECTED_SYSTEM_EXES = new Set([
  'explorer.exe',
  'powershell.exe',
  'pwsh.exe',
  'cmd.exe',
  'windowsterminal.exe',
  'wt.exe',
  'taskmgr.exe',
  'systemsettings.exe',
  'sechealthui.exe',
  'vethos.exe',
  // Administrative & System Utilities
  'regedit.exe',
  'mmc.exe',
  'control.exe',
  'resmon.exe',
  'perfmon.exe',
  'msconfig.exe',
  'cleanmgr.exe',
  'mdsched.exe',
  'dism.exe',
  'sfc.exe',
  'chkdsk.exe',
  'defrag.exe',
  'services.msc',
  'comexp.msc',
  'compmgmt.msc',
  'eventvwr.msc',
  'eventvwr.exe',
  'devmgmt.msc',
  'diskmgmt.msc',
  'gpedit.msc',
  'secpol.msc',
  'lusrmgr.msc',
]);

/**
 * Protected package family names or AUMID prefixes (lowercase).
 */
export const PROTECTED_AUMIDS = new Set([
  'windows.immersivecontrolpanel_cw5n1h2txyewy',
  'microsoft.sechealthui_8wekyb3d8bbwe',
  'microsoft.windowsterminal_8wekyb3d8bbwe',
  'microsoft.windowsterminalpreview_8wekyb3d8bbwe',
]);

/**
 * Background hosts, helper processes, or system plumbing that should NEVER be exposed as blockable apps.
 */
export const HOST_OR_SUBPROCESS_EXES = new Set([
  'msedgewebview2.exe',
  'backgroundtaskhost.exe',
  'runtimebroker.exe',
  'smartscreen.exe',
  'conhost.exe',
  'dllhost.exe',
  'svchost.exe',
  'sihost.exe',
  'ctfmon.exe',
  'fontdrvhost.exe',
  'crashpad_handler.exe',
  'unitycrashhandler64.exe',
  'unitycrashhandler32.exe',
  'werfault.exe',
  'openconsole.exe',
  'searchhost.exe',
  'startmenuexperiencehost.exe',
  'shellexperiencehost.exe',
  'textinputhost.exe',
  'securityhealthservice.exe',
  'securityhealthsystray.exe',
  'audiodg.exe',
  'spoolsv.exe',
]);

export interface AppIdentifier {
  id?: string;
  name?: string;
  targetPath?: string;
  aumid?: string;
  packageFamilyName?: string;
  exeName?: string;
}

/**
 * Verifies if an executable name + path represents a protected system tool.
 * CRITICAL RULE: If a path is provided for explorer.exe, it MUST reside under SystemRoot.
 * A rogue 'C:\Users\...\Downloads\explorer.exe' or 'C:\Temp\explorer.exe' is NOT protected!
 */
export function isProtectedExe(exeName: string, targetPath?: string): boolean {
  const lowerExe = (exeName || '').toLowerCase().trim();
  if (!lowerExe) return false;

  // Always protect Vethos itself and current process
  if (lowerExe === 'vethos.exe') return true;
  const currentExec = path.basename(process.execPath || '').toLowerCase();
  if (currentExec && lowerExe === currentExec) return true;

  // explorer.exe MUST be canonical Windows explorer
  if (lowerExe === 'explorer.exe') {
    if (!targetPath) {
      // Without explicit path, assume canonical Windows shell
      return true;
    }
    return isUnderSystemRoot(targetPath);
  }

  // cmd.exe and powershell.exe: if path provided, must not be inside suspicious user directories
  if (lowerExe === 'cmd.exe' || lowerExe === 'powershell.exe') {
    if (targetPath) {
      const norm = normalizePath(targetPath);
      if (norm.includes('\\downloads\\') || norm.includes('\\temp\\') || norm.includes('\\appdata\\local\\temp\\')) {
        return false;
      }
    }
    return true;
  }

  // Administrative tools, terminals & management utilities
  if (PROTECTED_SYSTEM_EXES.has(lowerExe)) {
    if (targetPath) {
      const norm = normalizePath(targetPath);
      if (norm.includes('\\downloads\\') || norm.includes('\\temp\\')) {
        return false;
      }
    }
    return true;
  }

  return false;
}

/**
 * Checks if an application is a background helper, host, or system plumbing process.
 */
export function isHostOrSubprocess(exeName?: string): boolean {
  if (!exeName) return false;
  return HOST_OR_SUBPROCESS_EXES.has(exeName.toLowerCase().trim());
}

/**
 * Regex defining software components that are not independent user applications
 * (uninstaller, installer, setup, updater, diagnostic, driver, background agent, etc.).
 */
export const NON_USER_APP_RE =
  /\b(uninstall|uninstaller|unins\d*|setup|installer|install manager|update|updater|maintenance|repair|service|daemon|driver|driverpack|diagnostic|diagnostics|bug report|crash|redistributable|redist|runtime|sdk|component|helper|bootstrapper|framework|vcredist|msvc|visual c\+\+|chipset|firmware|middleware|webview2?|cleanup|utility|verifier|extractor|accelerator|shader|shaders|vulkan|openal|physx|directx|opengl|nvidia|realtek|intel|amd|hotfix|controller|agent|host|engine|library|libraries|package|packages|patch)\b/i;

/**
 * Checks whether an item represents a non-user background helper, driver, updater or diagnostic tool.
 */
export function isNonUserSystemHelper(name?: string, exeName?: string): boolean {
  if (name && NON_USER_APP_RE.test(name)) return true;
  if (exeName && NON_USER_APP_RE.test(exeName)) return true;
  return false;
}

/**
 * Full protection check on an AppRecord or app metadata.
 */
export function isProtectedApp(app: AppIdentifier): boolean {
  const exe = (app.exeName || (app.targetPath ? path.basename(app.targetPath) : '')).toLowerCase().trim();
  const aumid = (app.aumid || '').toLowerCase().trim();
  const pkg = (app.packageFamilyName || '').toLowerCase().trim();
  const name = (app.name || '').toLowerCase().trim();

  // Check AUMID or Package
  for (const protectedAumid of PROTECTED_AUMIDS) {
    if (aumid.startsWith(protectedAumid) || pkg.startsWith(protectedAumid)) {
      return true;
    }
  }

  // Check exe name + path
  if (exe && isProtectedExe(exe, app.targetPath)) {
    return true;
  }

  // Check display name matching vital utilities
  if (
    name === 'task manager' ||
    name === 'gestionnaire des tâches' ||
    name === 'windows terminal' ||
    name === 'terminal' ||
    name === 'windows powershell' ||
    name === 'powershell' ||
    name === 'windows powershell ise' ||
    name === 'windows powershell ise (x86)' ||
    name === 'invite de commandes' ||
    name === 'command prompt' ||
    name === 'paramètres' ||
    name === 'settings' ||
    name === 'sécurité windows' ||
    name === 'windows security' ||
    name === 'vethos' ||
    name === 'registry editor' ||
    name === 'éditeur du registre' ||
    name === 'services' ||
    name === 'windows tools' ||
    name === 'outils windows' ||
    name === 'resource monitor' ||
    name === 'moniteur de ressources' ||
    name === 'performance monitor' ||
    name === 'moniteur de performances' ||
    name === 'system configuration' ||
    name === 'configuration du système' ||
    name === 'disk cleanup' ||
    name === 'nettoyage de disque' ||
    name === 'computer management' ||
    name === 'gestion de l\'ordinateur' ||
    name === 'component services' ||
    name === 'services de composants' ||
    name === 'event viewer' ||
    name === 'observateur d\'événements' ||
    name === 'windows memory diagnostic' ||
    name === 'diagnostic de mémoire windows' ||
    name === 'local security policy' ||
    name === 'stratégie de sécurité locale' ||
    name === 'odbc data sources' ||
    name === 'sources de données odbc' ||
    name === 'iscsi initiator' ||
    name === 'initiateur iscsi'
  ) {
    return true;
  }

  return false;
}

/**
 * Strips protected apps from candidate lists BEFORE sending to DeepSeek.
 */
export function sanitizeCandidateApps<T extends AppIdentifier>(apps: T[]): T[] {
  return apps.filter((app) => !isProtectedApp(app) && !isHostOrSubprocess(app.exeName));
}

/**
 * Validates AI responses AFTER DeepSeek returns target IDs or names.
 * Rejects any protected target and returns sanitized lists.
 */
export function sanitizeBlockingTargets(
  targets: string[],
  inventory: AppIdentifier[]
): { allowedTargets: string[]; rejectedTargets: string[] } {
  const allowedTargets: string[] = [];
  const rejectedTargets: string[] = [];

  const inventoryById = new Map<string, AppIdentifier>();
  const inventoryByName = new Map<string, AppIdentifier>();
  const inventoryByExe = new Map<string, AppIdentifier>();

  for (const item of inventory) {
    if (item.id) inventoryById.set(item.id.toLowerCase(), item);
    if (item.name) inventoryByName.set(item.name.toLowerCase(), item);
    if (item.exeName) inventoryByExe.set(item.exeName.toLowerCase(), item);
    if (item.targetPath) {
      inventoryByExe.set(path.basename(item.targetPath).toLowerCase(), item);
    }
  }

  for (const target of targets) {
    const raw = (target || '').trim();
    if (!raw) continue;
    const lower = raw.toLowerCase();

    // Direct check on raw target as exe
    if (PROTECTED_SYSTEM_EXES.has(lower) || isProtectedExe(lower)) {
      rejectedTargets.push(raw);
      continue;
    }

    // Check against inventory records
    const matchedRecord =
      inventoryById.get(lower) ||
      inventoryByName.get(lower) ||
      inventoryByExe.get(lower);

    if (matchedRecord && isProtectedApp(matchedRecord)) {
      rejectedTargets.push(raw);
      continue;
    }

    allowedTargets.push(raw);
  }

  return { allowedTargets, rejectedTargets };
}

export type ProtectionLevel = 'NEVER_BLOCK' | 'BLOCKABLE';

export const BLOCK_REJECTED_PROTECTED = 'BLOCK_REJECTED_PROTECTED' as const;

/**
 * Inviolable SystemGuard boundary check.
 * Evaluates whether an app or exe name is strictly forbidden from any blocking operations.
 */
export function getProtectionLevel(target: string, targetPath?: string): ProtectionLevel {
  const cleanTarget = (target || '').trim();
  if (!cleanTarget) return 'BLOCKABLE';

  // Direct exe check
  if (PROTECTED_SYSTEM_EXES.has(cleanTarget.toLowerCase()) || isProtectedExe(cleanTarget, targetPath)) {
    return 'NEVER_BLOCK';
  }

  // App / name / AUMID check
  if (isProtectedApp({ name: cleanTarget, exeName: cleanTarget, targetPath })) {
    return 'NEVER_BLOCK';
  }

  return 'BLOCKABLE';
}

export type ProcessClassification = 'ROOT_APPLICATION' | 'CHILD_OR_HOST_PROCESS';

export interface ProcessOwnershipResolution {
  classification: ProcessClassification;
  ownerAppId?: string;
  status: 'ROOT' | 'OWNER_RESOLVED' | 'OWNER_UNRESOLVED';
}

/**
 * Resolves whether a process is an independent root application
 * or a child/host/helper process (e.g. msedgewebview2, electron renderer).
 * When it is a child process, links it to its owner application if parent PID is known.
 */
export function resolveProcessOwnership(
  processNode: { pid: number; exeName: string; parentPid?: number },
  activeRootApps?: Map<number, string>,
): ProcessOwnershipResolution {
  const isHelper = isHostOrSubprocess(processNode.exeName) || isNonRootHelperProcess(processNode.exeName);
  if (!isHelper) {
    return {
      classification: 'ROOT_APPLICATION',
      ownerAppId: processNode.exeName,
      status: 'ROOT',
    };
  }

  // Helper / Subprocess
  if (processNode.parentPid && activeRootApps && activeRootApps.has(processNode.parentPid)) {
    const owner = activeRootApps.get(processNode.parentPid)!;
    return {
      classification: 'CHILD_OR_HOST_PROCESS',
      ownerAppId: owner,
      status: 'OWNER_RESOLVED',
    };
  }

  return {
    classification: 'CHILD_OR_HOST_PROCESS',
    status: 'OWNER_UNRESOLVED',
  };
}

/**
 * Patterns de binaires ou noms représentant des processus helpers, crash handlers,
 * installeurs, updaters ou plomberie système qui ne sont JAMAIS des applications root.
 */
export const NON_ROOT_HELPER_PATTERNS: readonly RegExp[] = [
  // Crash handlers & rapport d'erreur
  /crashhandler/i,
  /crashpad/i,
  /dumphandler/i,
  /errorreport/i,
  /werfault/i,
  // WebView2 & Chromium/Electron hosts/helpers
  /msedgewebview2/i,
  /helper\.exe$/i,
  /broker\.exe$/i,
  /gpu-process/i,
  /renderer\.exe$/i,
  // Installers / Uninstallers
  /^setup(\.exe)?$/i,
  /^install(er)?(\.exe)?$/i,
  /^unins(tall|\d+)?(\.exe)?$/i,
  /unins\d+/i,
  // Updaters
  /^update(r)?(\.exe)?$/i,
  /autoupdate/i,
];

/**
 * Vérifie si un nom ou un exécutable correspond à un helper / processus enfant / installeur.
 */
export function isNonRootHelperProcess(exeName?: string, name?: string): boolean {
  const exe = (exeName || '').toLowerCase().trim();
  const baseName = (name || '').toLowerCase().trim();

  if (isHostOrSubprocess(exe)) return true;

  for (const pattern of NON_ROOT_HELPER_PATTERNS) {
    if (exe && pattern.test(exe)) return true;
    if (baseName && pattern.test(baseName)) return true;
  }

  return false;
}
