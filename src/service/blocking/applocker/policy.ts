import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const EVERYONE_SID = 'S-1-1-0'
const ADMINS_SID = 'S-1-5-32-544'

export type AppLockerMode = 'AuditOnly' | 'Enabled'

export type WindowsEdition = {
  productName: string
  editionId: string
  supportsAppLocker: boolean
}

export type BlockingStrategy = {
  processLayer: 'applocker' | 'unavailable'
  appLockerMode: AppLockerMode
  reason?: string
}

export type AppLockerHandle = {
  stop: () => void
  applied: boolean
  error?: string
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function normalizeExe(exeName: string): string {
  return exeName.trim().replace(/^.*[\\/]/, '')
}

function allowRule(name: string, sid: string, path: string): string {
  return `    <FilePathRule Id="${randomUUID()}" Name="${xmlEscape(name)}" Description="Nexus default allow" UserOrGroupSid="${sid}" Action="Allow">
      <Conditions>
        <FilePathCondition Path="${xmlEscape(path)}" />
      </Conditions>
    </FilePathRule>`
}

function denyRule(exeName: string): string {
  const normalized = normalizeExe(exeName)
  return `    <FilePathRule Id="${randomUUID()}" Name="Nexus block ${xmlEscape(normalized)}" Description="Nexus session app block" UserOrGroupSid="${EVERYONE_SID}" Action="Deny">
      <Conditions>
        <FilePathCondition Path="*\\${xmlEscape(normalized)}" />
      </Conditions>
    </FilePathRule>`
}

export function buildAppLockerPolicyXml(exeNames: string[], mode: AppLockerMode): string {
  const uniqueExeNames = [...new Set(exeNames.map(normalizeExe).filter(Boolean))]
  const rules = [
    allowRule('Nexus allow Windows', EVERYONE_SID, '%WINDIR%\\*'),
    allowRule('Nexus allow Program Files', EVERYONE_SID, '%PROGRAMFILES%\\*'),
    allowRule('Nexus allow Program Files x86', EVERYONE_SID, '%PROGRAMFILES(X86)%\\*'),
    allowRule('Nexus allow administrators', ADMINS_SID, '*'),
    ...uniqueExeNames.map(denyRule),
  ].join('\n')

  return `<?xml version="1.0" encoding="utf-8"?>
<AppLockerPolicy Version="1">
  <RuleCollection Type="Exe" EnforcementMode="${mode}">
${rules}
  </RuleCollection>
  <RuleCollection Type="Script" EnforcementMode="NotConfigured" />
  <RuleCollection Type="Msi" EnforcementMode="NotConfigured" />
  <RuleCollection Type="Dll" EnforcementMode="NotConfigured" />
  <RuleCollection Type="Appx" EnforcementMode="NotConfigured" />
</AppLockerPolicy>
`
}

function runPowerShell(command: string): void {
  execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
    { stdio: 'pipe', windowsHide: true },
  )
}

function readPowerShell(command: string): string {
  return execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
    { stdio: 'pipe', windowsHide: true, encoding: 'utf8' },
  )
}

export function getWindowsEdition(): WindowsEdition {
  if (process.platform !== 'win32') {
    return {
      productName: process.platform,
      editionId: 'non-windows',
      supportsAppLocker: false,
    }
  }

  try {
    const raw = readPowerShell(
      "(Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion' | Select-Object -ExpandProperty ProductName), (Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion' | Select-Object -ExpandProperty EditionID)",
    )
    const [productName = 'Windows', editionId = 'Unknown'] = raw
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)
    const normalizedEdition = editionId.toLowerCase()
    const normalizedProduct = productName.toLowerCase()
    const isHomeLike =
      normalizedEdition.includes('core') ||
      normalizedEdition.includes('home') ||
      normalizedProduct.includes('home')

    return {
      productName,
      editionId,
      supportsAppLocker: !isHomeLike,
    }
  } catch {
    return {
      productName: 'Windows',
      editionId: 'Unknown',
      supportsAppLocker: false,
    }
  }
}

export function pickBlockingStrategy(args: {
  elevated: boolean
  strictBlocking: boolean
  edition: WindowsEdition
}): BlockingStrategy {
  const appLockerMode: AppLockerMode = args.strictBlocking ? 'Enabled' : 'AuditOnly'
  if (!args.elevated) {
    return {
      processLayer: 'unavailable',
      appLockerMode,
      reason: 'Droits administrateur requis pour AppLocker.',
    }
  }
  if (!args.edition.supportsAppLocker) {
    return {
      processLayer: 'unavailable',
      appLockerMode,
      reason: `AppLocker non disponible sur ${args.edition.productName} (${args.edition.editionId}).`,
    }
  }
  return { processLayer: 'applocker', appLockerMode }
}

export function startAppLockerBlocker(
  exeNames: string[],
  mode: AppLockerMode,
): AppLockerHandle {
  const uniqueExeNames = [...new Set(exeNames.map(normalizeExe).filter(Boolean))]
  if (uniqueExeNames.length === 0) {
    return { applied: false, stop: () => undefined }
  }

  const dir = join(tmpdir(), `nexus-applocker-${randomUUID()}`)
  const backupPath = join(dir, 'before.xml')
  const policyPath = join(dir, 'nexus.xml')

  try {
    mkdirSync(dir, { recursive: true })
    runPowerShell(`Get-AppLockerPolicy -Local -Xml > '${backupPath.replace(/'/g, "''")}'`)
    writeFileSync(policyPath, buildAppLockerPolicyXml(uniqueExeNames, mode), 'utf8')
    runPowerShell('Start-Service AppIDSvc -ErrorAction SilentlyContinue')
    runPowerShell(`Set-AppLockerPolicy -XmlPolicy '${policyPath.replace(/'/g, "''")}' -Merge`)

    return {
      applied: true,
      stop: () => {
        try {
          if (existsSync(backupPath)) {
            runPowerShell(`Set-AppLockerPolicy -XmlPolicy '${backupPath.replace(/'/g, "''")}'`)
          }
        } finally {
          rmSync(dir, { recursive: true, force: true })
        }
      },
    }
  } catch (err) {
    rmSync(dir, { recursive: true, force: true })
    return {
      applied: false,
      error: (err as Error).message,
      stop: () => undefined,
    }
  }
}
