import { promises as fsp, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import * as path from 'node:path'
import { blockingDataDir } from '../blocking-paths'
import { SENTINEL_BEGIN, SENTINEL_END } from './sentinels'
import { expandDomain } from './subdomains'
import { parseHostsFile } from './parser'

export let HOSTS_PATH = 'C:\\Windows\\System32\\drivers\\etc\\hosts'

if (process.env.VETHOS_DEV === 'true') {
  HOSTS_PATH = path.join(blockingDataDir(), 'hosts.mock')
  if (!existsSync(HOSTS_PATH)) {
    try {
      const content = readFileSync('C:\\Windows\\System32\\drivers\\etc\\hosts', 'utf8')
      mkdirSync(path.dirname(HOSTS_PATH), { recursive: true })
      writeFileSync(HOSTS_PATH, content, 'utf8')
    } catch {
      try {
        writeFileSync(HOSTS_PATH, '', 'utf8')
      } catch {}
    }
  }
}

export function renderVethosBlock(args: {
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
 * Lit le hosts, sépare le bloc Vethos existant, écrit le nouveau contenu de
 * façon atomique (staging → copy). Crée le backup au premier passage.
 */
export async function applyVethosBlock(args: {
  sessionId: string
  startedAt: string
  domains: string[]
}): Promise<void> {
  await ensureBackup()
  const raw = await fsp.readFile(HOSTS_PATH, 'utf8')
  const parsed = parseHostsFile(raw)
  const block = renderVethosBlock(args)
  const newContent = ensureTrailingNewline(parsed.outside) + block
  await atomicWriteHosts(newContent)
}

/** Retire complètement le bloc Vethos du hosts et restaure l'extérieur. */
export async function clearVethosBlock(): Promise<void> {
  const raw = await fsp.readFile(HOSTS_PATH, 'utf8')
  const parsed = parseHostsFile(raw)
  await atomicWriteHosts(parsed.outside)
}

async function ensureBackup(): Promise<void> {
  const backupPath = path.join(blockingDataDir(), 'hosts.vethos.backup')
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
  const stagingPath = path.join(blockingDataDir(), 'hosts.vethos.staging')
  await fsp.writeFile(stagingPath, content, 'utf8')
  await fsp.copyFile(stagingPath, HOSTS_PATH)
  await fsp.unlink(stagingPath).catch(() => {})
}
