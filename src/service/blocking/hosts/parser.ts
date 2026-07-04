import { SENTINEL_BEGIN, SENTINEL_END } from './sentinels'

export type HostsEntry = { ip: string; host: string }
export type VethosBlock = {
  sessionId: string | null
  startedAt: string | null
  entries: HostsEntry[]
}
export type ParsedHosts = {
  outside: string
  vethosBlock: VethosBlock | null
}

const META_RE = /^# session:\s*(\S+)\s*\|\s*started:\s*(\S+)\s*$/
const ENTRY_RE = /^(127\.0\.0\.1|::1)\s+([A-Za-z0-9.-]+)\s*$/

/**
 * Parse un hosts file. Extrait le PREMIER bloc Vethos (entre sentinels) et
 * retourne tout le reste comme `outside` (les autres blocs Vethos éventuels
 * sont aussi retirés de `outside` pour éviter une corruption persistante).
 */
export function parseHostsFile(raw: string): ParsedHosts {
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1)

  const beginIdx = raw.indexOf(SENTINEL_BEGIN)
  if (beginIdx === -1) {
    return { outside: raw, vethosBlock: null }
  }
  const endIdx = raw.indexOf(SENTINEL_END, beginIdx)
  if (endIdx === -1) {
    return { outside: raw.slice(0, beginIdx), vethosBlock: null }
  }

  const blockEnd = endIdx + SENTINEL_END.length
  const blockRaw = raw.slice(beginIdx, blockEnd)
  const before = raw.slice(0, beginIdx)
  let after = raw.slice(blockEnd)
  after = after.replace(/^\r?\n/, '')

  let outside = before + after
  for (;;) {
    const b2 = outside.indexOf(SENTINEL_BEGIN)
    if (b2 === -1) break
    const e2 = outside.indexOf(SENTINEL_END, b2)
    if (e2 === -1) break
    outside = outside.slice(0, b2) + outside.slice(e2 + SENTINEL_END.length).replace(/^\r?\n/, '')
  }

  const lines = blockRaw.split(/\r?\n/)
  let sessionId: string | null = null
  let startedAt: string | null = null
  const entries: HostsEntry[] = []
  for (const line of lines) {
    const meta = META_RE.exec(line)
    if (meta) {
      sessionId = meta[1] ?? null
      startedAt = meta[2] ?? null
      continue
    }
    const m = ENTRY_RE.exec(line)
    if (m && m[1] && m[2]) entries.push({ ip: m[1], host: m[2] })
  }

  return { outside, vethosBlock: { sessionId, startedAt, entries } }
}
