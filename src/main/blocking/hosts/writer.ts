import { promises as fsp } from 'node:fs'
import * as path from 'node:path'
import { app } from 'electron'
import { SENTINEL_BEGIN, SENTINEL_END } from './sentinels'
import { expandDomain } from './subdomains'
import { parseHostsFile } from './parser'

export const HOSTS_PATH = 'C:\\Windows\\System32\\drivers\\etc\\hosts'

export function renderNexusBlock(args: {
  sessionId: string
  startedAt: string
  domains: string[]
}): string {
  const { sessionId, startedAt, domains } = args
  const lines: string[] = [SENTINEL_BEGIN, `# session: ${sessionId} | started: ${startedAt}`]
  for (const d of domains) {
    for (const variant of expandDomain(d)) lines.push(`127.0.0.1 ${variant}`)
  }
  for (const d of domains) {
    for (const variant of expandDomain(d)) lines.push(`::1 ${variant}`)
  }
  lines.push(SENTINEL_END)
  return lines.join('\r\n') + '\r\n'
}

/**
 * Lit le hosts, sépare le bloc Nexus existant, écrit le nouveau contenu de
 * façon atomique (staging → copy). Crée le backup au premier passage.
 */
export async function applyNexusBlock(args: {
  sessionId: string
  startedAt: string
  domains: string[]
}): Promise<void> {
  await ensureBackup()
  const raw = await fsp.readFile(HOSTS_PATH, 'utf8')
  const parsed = parseHostsFile(raw)
  const block = renderNexusBlock(args)
  const newContent = ensureTrailingNewline(parsed.outside) + block
  await atomicWriteHosts(newContent)
}

/** Retire complètement le bloc Nexus du hosts et restaure l'extérieur. */
export async function clearNexusBlock(): Promise<void> {
  const raw = await fsp.readFile(HOSTS_PATH, 'utf8')
  const parsed = parseHostsFile(raw)
  await atomicWriteHosts(parsed.outside)
}

async function ensureBackup(): Promise<void> {
  const backupPath = path.join(app.getPath('userData'), 'hosts.nexus.backup')
  try {
    await fsp.access(backupPath)
    return
  } catch {
    // n'existe pas — créer
  }
  const raw = await fsp.readFile(HOSTS_PATH, 'utf8')
  const tmp = backupPath + '.tmp'
  await fsp.writeFile(tmp, raw, 'utf8')
  await fsp.rename(tmp, backupPath)
}

function ensureTrailingNewline(s: string): string {
  if (s.length === 0) return ''
  return /\r?\n$/.test(s) ? s : s + '\r\n'
}

async function atomicWriteHosts(content: string): Promise<void> {
  const stagingPath = path.join(app.getPath('userData'), 'hosts.nexus.staging')
  await fsp.writeFile(stagingPath, content, 'utf8')
  await fsp.copyFile(stagingPath, HOSTS_PATH)
  await fsp.unlink(stagingPath).catch(() => {})
}
