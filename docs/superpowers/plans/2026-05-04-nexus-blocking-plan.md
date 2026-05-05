# Nexus — Sous-projet 2 : Système de blocage — Plan d'implémentation

> **Pour les agents :** SOUS-SKILL REQUISE : `superpowers:subagent-driven-development`. Exécution tâche par tâche en TDD. Étapes en checkboxes (`- [ ]`).

**Goal :** Livrer un moteur de blocage multi-couches (hosts / processes / firewall) avec session manager state-machine, drift detector, verrous adaptatifs (cooldown + justification), élévation admin, et UI 11/10. Survit au crash, atomique, testé.

**Spec source :** `docs/superpowers/specs/2026-05-04-nexus-blocking-design.md`

**Politique générale :**
- TDD obligatoire pour : parsers, state machine, locks (Vitest unitaires)
- Tests d'intégration (réel hosts/netsh/tasklist) gated par `NEXUS_INTEG=1`
- Pas de dépendances natives (`node-ffi` interdit) — `child_process.exec` only
- Atomique : tout écrit qui pourrait être vu en cours doit passer par `<file>.tmp` + `rename`
- Sécurité hosts : backup `hosts.nexus.backup` créé une fois, jamais écrasé ; sentinels exacts ; IPv4 + IPv6 ; flush DNS après chaque write

---

## Vue d'ensemble des fichiers à créer

| Fichier | Responsabilité |
|---|---|
| `src/shared/schemas.ts` (modif) | + `BlockingProfileSchema`, `ActiveSessionSchema`, `BlockingStateSchema`, étend `STORAGE_KEYS` avec `blocking`, `blocking_active` |
| `src/shared/ipc-channels.ts` (modif) | + 9 channels `BLOCKING_*` + 2 events |
| `src/main/blocking/elevation.ts` | Détection admin + helper |
| `src/main/blocking/hosts/sentinels.ts` | Constantes BEGIN/END markers |
| `src/main/blocking/hosts/subdomains.ts` | Liste des préfixes auto (www, m, mobile) |
| `src/main/blocking/hosts/parser.ts` | Parse le hosts file → `{ outside: string, nexusBlock: NexusBlock \| null }` |
| `src/main/blocking/hosts/writer.ts` | Écrit atomiquement avec sentinels |
| `src/main/blocking/hosts/flush-dns.ts` | `ipconfig /flushdns` |
| `src/main/blocking/hosts/parser.test.ts` | TDD parser |
| `src/main/blocking/hosts/writer.test.ts` | TDD writer |
| `src/main/blocking/processes/enumerator.ts` | tasklist /FO CSV → Process[] |
| `src/main/blocking/processes/killer.ts` | taskkill /F /IM |
| `src/main/blocking/processes/safe-list.ts` | Liste hardcodée processus système intouchables |
| `src/main/blocking/processes/watcher.ts` | Polling 1s |
| `src/main/blocking/processes/enumerator.test.ts` | TDD parser CSV |
| `src/main/blocking/firewall/netsh.ts` | add/delete rule via netsh advfirewall |
| `src/main/blocking/firewall/rule-tracker.ts` | Track les règles créées dans la session |
| `src/main/blocking/firewall/netsh.test.ts` | TDD parser de show rule |
| `src/main/blocking/session/types.ts` | Re-exports + types internes (State enum, etc.) |
| `src/main/blocking/session/persistence.ts` | Read/write `blocking.json` + `blocking_active.json` |
| `src/main/blocking/session/locks/cooldown.ts` | Cooldown timer logic |
| `src/main/blocking/session/locks/justification.ts` | Word counter |
| `src/main/blocking/session/locks/locks.test.ts` | TDD locks |
| `src/main/blocking/session/manager.ts` | State machine orchestrateur |
| `src/main/blocking/session/manager.test.ts` | TDD state machine (avec mocks) |
| `src/main/blocking/session/drift-detector.ts` | Watchdog 5s |
| `src/main/blocking/ipc/blocking.handlers.ts` | Enregistre les handlers + bridge events |
| `src/main/ipc/index.ts` (modif) | Appelle `registerBlockingHandlers` |
| `src/main/index.ts` (modif) | Bootstrap blocage : restore state au démarrage, emit elevation status |
| `src/preload/index.ts` (modif) | + `nexus.blocking.*` API + event subscription |
| `src/renderer/src/lib/ipc.ts` (modif) | Wrapper typé blocage |
| `src/renderer/src/store/blocking.store.ts` | Zustand store blocage |
| `src/renderer/src/pages/BlockingPage.tsx` (rewrite) | UI 11/10 |
| `src/renderer/src/components/blocking/ProfileCard.tsx` | Carte profile dans la liste |
| `src/renderer/src/components/blocking/ActiveSessionCard.tsx` | Carte session active + statuts |
| `src/renderer/src/components/blocking/ProfileEditor.tsx` | Slide-in panel d'édition |
| `src/renderer/src/components/blocking/UnlockModal.tsx` | Cooldown + justification modal |
| `src/renderer/src/components/blocking/HistoryList.tsx` | Liste des 30 dernières |
| `electron-builder.yml` (modif) | + `requestedExecutionLevel: requireAdministrator` |
| `NEXUS_SPEC.md` (modif) | Sous-projet 2 = ✅ |

---

## Task 1 : Étendre schémas Zod + canaux IPC

**Files :**
- Modify : `src/shared/schemas.ts`, `src/shared/ipc-channels.ts`

- [ ] **Step 1.1 : Étendre `STORAGE_KEYS` et schémas**

Ajouter dans `src/shared/schemas.ts` (après les imports existants) :

```ts
const DOMAIN_REGEX = /^(?!-)[a-zA-Z0-9-]{1,63}(?<!-)(\.[a-zA-Z]{2,})+$/
const EXE_NAME_REGEX = /^[A-Za-z0-9_.\- ]+\.exe$/i

export const BlockingProfileSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(60),
  blockedSites: z.array(z.string().regex(DOMAIN_REGEX)),
  blockedProcesses: z.array(z.string().regex(EXE_NAME_REGEX)),
  blockedNetworkApps: z.array(z.string()), // chemins .exe absolus
  unlockPolicy: z.discriminatedUnion('type', [
    z.object({ type: z.literal('none') }),
    z.object({ type: z.literal('cooldown'), minutes: z.number().int().min(1).max(60) }),
    z.object({ type: z.literal('justification'), minWords: z.number().int().min(50).max(500) }),
    z.object({
      type: z.literal('cooldown_and_justification'),
      minutes: z.number().int().min(1).max(60),
      minWords: z.number().int().min(50).max(500),
    }),
  ]),
  createdAt: z.string().datetime(),
})
export type BlockingProfile = z.infer<typeof BlockingProfileSchema>

export const ActiveSessionSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  profileSnapshot: BlockingProfileSchema,
  startedAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  unlockState: z.discriminatedUnion('phase', [
    z.object({ phase: z.literal('locked') }),
    z.object({ phase: z.literal('cooldown'), startedAt: z.string().datetime() }),
    z.object({ phase: z.literal('awaiting_justification') }),
    z.object({ phase: z.literal('unlocked'), reason: z.string() }),
  ]),
  appliedFirewallRules: z.array(z.string()), // noms des règles netsh créées
})
export type ActiveSession = z.infer<typeof ActiveSessionSchema>

export const BlockingStateSchema = z.object({
  profiles: z.array(BlockingProfileSchema),
  history: z
    .array(
      z.object({
        sessionId: z.string().uuid(),
        profileId: z.string().uuid(),
        startedAt: z.string().datetime(),
        endedAt: z.string().datetime(),
        completedNormally: z.boolean(),
      }),
    )
    .max(500),
})
export type BlockingState = z.infer<typeof BlockingStateSchema>
```

Modifier `STORAGE_KEYS` :

```ts
export const STORAGE_KEYS = ['settings', 'blocking', 'blocking_active'] as const
```

Étendre `STORAGE_SCHEMAS` :

```ts
export const STORAGE_SCHEMAS = {
  settings: SettingsSchema,
  blocking: BlockingStateSchema,
  blocking_active: ActiveSessionSchema,
} as const satisfies Record<StorageKey, z.ZodTypeAny>
```

- [ ] **Step 1.2 : Étendre IPC channels**

```ts
export const IPC_CHANNELS = {
  STORAGE_READ: 'storage:read',
  STORAGE_WRITE: 'storage:write',
  STORAGE_EXISTS: 'storage:exists',
  APP_GET_VERSION: 'app:getVersion',
  // Blocking — invoke
  BLOCKING_GET_INITIAL_STATE: 'blocking:getInitialState',
  BLOCKING_SAVE_PROFILE: 'blocking:saveProfile',
  BLOCKING_DELETE_PROFILE: 'blocking:deleteProfile',
  BLOCKING_START_SESSION: 'blocking:startSession',
  BLOCKING_REQUEST_UNLOCK: 'blocking:requestUnlock',
  BLOCKING_SUBMIT_JUSTIFICATION: 'blocking:submitJustification',
  BLOCKING_GET_LAYER_STATUS: 'blocking:getLayerStatus',
  BLOCKING_IS_ELEVATED: 'blocking:isElevated',
  // Blocking — events main → renderer
  BLOCKING_EVENT_SESSION_CHANGED: 'blocking:event:sessionChanged',
  BLOCKING_EVENT_LAYER_DRIFT: 'blocking:event:layerDrift',
} as const
```

- [ ] **Step 1.3 : Vérifier**

```bash
npm run typecheck
```

Expected : ok.

---

## Task 2 : Élévation admin (détection)

**Files :**
- Create : `src/main/blocking/elevation.ts`

- [ ] **Step 2.1 :** Implémenter

```ts
import { execSync } from 'node:child_process'

/**
 * Détecte si le process Electron tourne avec privilèges administrateur.
 * Stratégie : `net session` qui retourne != 0 sans admin sur Windows.
 */
export function isElevated(): boolean {
  try {
    execSync('net session', { stdio: 'pipe', windowsHide: true })
    return true
  } catch {
    return false
  }
}
```

- [ ] **Step 2.2 :** Lint + typecheck. Pas de tests unitaires (dépend de l'OS).

---

## Task 3 : Hosts parser (TDD)

**Files :**
- Create : `src/main/blocking/hosts/sentinels.ts`, `src/main/blocking/hosts/parser.ts`, `src/main/blocking/hosts/parser.test.ts`

- [ ] **Step 3.1 : Sentinels**

```ts
// src/main/blocking/hosts/sentinels.ts
export const SENTINEL_BEGIN = '# === NEXUS BLOCKING START — DO NOT EDIT (managed by Nexus) ==='
export const SENTINEL_END = '# === NEXUS BLOCKING END ==='
```

- [ ] **Step 3.2 : Tests d'abord**

```ts
// src/main/blocking/hosts/parser.test.ts
import { describe, it, expect } from 'vitest'
import { parseHostsFile } from './parser'
import { SENTINEL_BEGIN, SENTINEL_END } from './sentinels'

const PLAIN = `# Copyright (c) 1993-2009 Microsoft Corp.\n127.0.0.1 localhost\n`

const WITH_BLOCK = `${PLAIN}${SENTINEL_BEGIN}\n# session: abc | started: 2026-05-04T10:00:00Z\n127.0.0.1 facebook.com\n::1 facebook.com\n${SENTINEL_END}\nfooter\n`

describe('parseHostsFile', () => {
  it('returns null block when no sentinels present', () => {
    const r = parseHostsFile(PLAIN)
    expect(r.nexusBlock).toBeNull()
    expect(r.outside).toBe(PLAIN)
  })

  it('extracts the block when sentinels present', () => {
    const r = parseHostsFile(WITH_BLOCK)
    expect(r.nexusBlock).not.toBeNull()
    expect(r.nexusBlock!.entries).toEqual([
      { ip: '127.0.0.1', host: 'facebook.com' },
      { ip: '::1', host: 'facebook.com' },
    ])
    expect(r.nexusBlock!.sessionId).toBe('abc')
    expect(r.outside).toContain('# Copyright')
    expect(r.outside).toContain('footer')
    expect(r.outside).not.toContain('facebook.com')
  })

  it('handles CRLF line endings', () => {
    const crlf = WITH_BLOCK.replace(/\n/g, '\r\n')
    const r = parseHostsFile(crlf)
    expect(r.nexusBlock?.entries.length).toBe(2)
  })

  it('strips UTF-8 BOM', () => {
    const r = parseHostsFile('\uFEFF' + WITH_BLOCK)
    expect(r.nexusBlock?.entries.length).toBe(2)
  })

  it('treats double Nexus block as corruption — keeps first, drops second from outside', () => {
    const dbl = WITH_BLOCK + WITH_BLOCK
    const r = parseHostsFile(dbl)
    expect(r.nexusBlock).not.toBeNull()
    // outside ne doit contenir aucun fragment de bloc Nexus
    expect(r.outside).not.toContain(SENTINEL_BEGIN)
    expect(r.outside).not.toContain(SENTINEL_END)
  })
})
```

- [ ] **Step 3.3 : Implémentation parser**

```ts
// src/main/blocking/hosts/parser.ts
import { SENTINEL_BEGIN, SENTINEL_END } from './sentinels'

export type HostsEntry = { ip: string; host: string }
export type NexusBlock = {
  sessionId: string | null
  startedAt: string | null
  entries: HostsEntry[]
}
export type ParsedHosts = {
  outside: string // tout sauf les blocs Nexus, avec line endings d'origine
  nexusBlock: NexusBlock | null
}

const META_RE = /^# session:\s*(\S+)\s*\|\s*started:\s*(\S+)\s*$/
const ENTRY_RE = /^(127\.0\.0\.1|::1)\s+([A-Za-z0-9.\-]+)\s*$/

/**
 * Parse un hosts file. Extrait le PREMIER bloc Nexus (entre sentinels) et
 * retourne tout le reste comme `outside` (les autres blocs Nexus éventuels
 * sont aussi retirés de `outside` pour éviter une corruption persistante).
 */
export function parseHostsFile(raw: string): ParsedHosts {
  // Strip BOM
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1)

  const beginIdx = raw.indexOf(SENTINEL_BEGIN)
  if (beginIdx === -1) {
    return { outside: raw, nexusBlock: null }
  }
  const endIdx = raw.indexOf(SENTINEL_END, beginIdx)
  if (endIdx === -1) {
    // Sentinel BEGIN sans END → corruption. Garder le contenu hors bloc, pas de bloc.
    return {
      outside: raw.slice(0, beginIdx).replace(/\r?\n$/, '') + (raw.slice(beginIdx).match(/\r?\n/)?.[0] ?? '\n'),
      nexusBlock: null,
    }
  }

  const blockEnd = endIdx + SENTINEL_END.length
  const blockRaw = raw.slice(beginIdx, blockEnd)
  const before = raw.slice(0, beginIdx)
  let after = raw.slice(blockEnd)
  // skip newline qui suit le sentinel END
  after = after.replace(/^\r?\n/, '')

  // Retirer tout autre bloc Nexus dans `after` (corruption / doublons)
  let outside = before + after
  while (true) {
    const b2 = outside.indexOf(SENTINEL_BEGIN)
    if (b2 === -1) break
    const e2 = outside.indexOf(SENTINEL_END, b2)
    if (e2 === -1) break
    outside = outside.slice(0, b2) + outside.slice(e2 + SENTINEL_END.length).replace(/^\r?\n/, '')
  }

  // Parse le bloc lui-même
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

  return { outside, nexusBlock: { sessionId, startedAt, entries } }
}
```

- [ ] **Step 3.4 :** `npm test -- parser` → tous verts.

---

## Task 4 : Hosts subdomains data

**Files :**
- Create : `src/main/blocking/hosts/subdomains.ts`

- [ ] **Step 4.1 :**

```ts
/** Préfixes de sous-domaines générés automatiquement pour chaque domaine bloqué. */
export const AUTO_SUBDOMAIN_PREFIXES = ['', 'www.', 'm.', 'mobile.'] as const

/** Génère toutes les variantes pour un domaine donné (ex. facebook.com → facebook.com, www.facebook.com, ...) */
export function expandDomain(domain: string): string[] {
  return AUTO_SUBDOMAIN_PREFIXES.map((p) => `${p}${domain}`)
}
```

- [ ] **Step 4.2 :** Lint + typecheck.

---

## Task 5 : Hosts writer + flushDns (TDD)

**Files :**
- Create : `src/main/blocking/hosts/writer.ts`, `src/main/blocking/hosts/flush-dns.ts`, `src/main/blocking/hosts/writer.test.ts`

- [ ] **Step 5.1 : Tests writer**

```ts
import { describe, it, expect } from 'vitest'
import { renderNexusBlock } from './writer'
import { SENTINEL_BEGIN, SENTINEL_END } from './sentinels'

describe('renderNexusBlock', () => {
  it('renders sentinels and entries', () => {
    const out = renderNexusBlock({
      sessionId: 'abc-123',
      startedAt: '2026-05-04T10:00:00Z',
      domains: ['facebook.com', 'twitter.com'],
    })
    expect(out).toContain(SENTINEL_BEGIN)
    expect(out).toContain(SENTINEL_END)
    expect(out).toContain('# session: abc-123')
    // IPv4 + IPv6 + sous-domaines auto
    expect(out).toContain('127.0.0.1 facebook.com')
    expect(out).toContain('127.0.0.1 www.facebook.com')
    expect(out).toContain('::1 facebook.com')
    expect(out).toContain('::1 m.twitter.com')
  })

  it('produces an empty block when no domains', () => {
    const out = renderNexusBlock({ sessionId: 'x', startedAt: '2026-05-04T10:00:00Z', domains: [] })
    expect(out).toContain(SENTINEL_BEGIN)
    expect(out).toContain(SENTINEL_END)
  })

  it('is idempotent (same input → same output)', () => {
    const args = { sessionId: 'a', startedAt: '2026-05-04T10:00:00Z', domains: ['x.com'] }
    expect(renderNexusBlock(args)).toBe(renderNexusBlock(args))
  })
})
```

- [ ] **Step 5.2 : Implémentation writer**

```ts
// src/main/blocking/hosts/writer.ts
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
 * façon atomique (tmp + rename). Crée le backup au premier passage.
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
    return // déjà existant — ne JAMAIS écraser
  } catch {
    // n'existe pas
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
  // Le hosts file est protégé : on ne peut pas écrire un .tmp à côté facilement
  // si le dossier est strict. On écrit dans userData puis on copie.
  const stagingPath = path.join(app.getPath('userData'), 'hosts.nexus.staging')
  await fsp.writeFile(stagingPath, content, 'utf8')
  await fsp.copyFile(stagingPath, HOSTS_PATH)
  await fsp.unlink(stagingPath).catch(() => {})
}
```

- [ ] **Step 5.3 : flush-dns**

```ts
// src/main/blocking/hosts/flush-dns.ts
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
const execAsync = promisify(exec)

export async function flushDns(): Promise<void> {
  await execAsync('ipconfig /flushdns', { windowsHide: true })
}
```

- [ ] **Step 5.4 :** `npm test -- writer` verts.

---

## Task 6 : Process enumerator (TDD parser)

**Files :**
- Create : `src/main/blocking/processes/enumerator.ts`, `src/main/blocking/processes/safe-list.ts`, `src/main/blocking/processes/enumerator.test.ts`

- [ ] **Step 6.1 : safe-list**

```ts
// src/main/blocking/processes/safe-list.ts
/**
 * Processus système Windows qu'on refuse de tuer même si l'utilisateur l'inscrit
 * dans un profile. Validation au save du profile.
 */
export const SYSTEM_SAFE_LIST = new Set([
  'svchost.exe',
  'explorer.exe',
  'dwm.exe',
  'csrss.exe',
  'winlogon.exe',
  'lsass.exe',
  'services.exe',
  'smss.exe',
  'wininit.exe',
  'system',
  'system idle process',
  'registry',
  'fontdrvhost.exe',
  'searchhost.exe',
  'searchindexer.exe',
  'taskmgr.exe', // pour permettre à l'utilisateur de débugger
])

export function isSafeListed(name: string): boolean {
  return SYSTEM_SAFE_LIST.has(name.trim().toLowerCase())
}
```

- [ ] **Step 6.2 : Tests parser CSV**

```ts
// src/main/blocking/processes/enumerator.test.ts
import { describe, it, expect } from 'vitest'
import { parseTasklistCsv } from './enumerator'

const FIXTURE = `"explorer.exe","1234","Console","1","45,123 K"
"chrome.exe","5678","Console","1","123,456 K"
"chrome.exe","5680","Console","1","98,000 K"
`

describe('parseTasklistCsv', () => {
  it('parses CSV rows into Process objects', () => {
    const rows = parseTasklistCsv(FIXTURE)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual({ name: 'explorer.exe', pid: 1234 })
    expect(rows[1]).toEqual({ name: 'chrome.exe', pid: 5678 })
  })

  it('ignores empty lines and bad rows', () => {
    const rows = parseTasklistCsv('\n\n"bad"\n"chrome.exe","1","Console","1","1 K"\n')
    expect(rows).toEqual([{ name: 'chrome.exe', pid: 1 }])
  })

  it('lowercases names for matching', () => {
    const rows = parseTasklistCsv('"NotePad.EXE","9","Console","1","1 K"\n')
    expect(rows[0]?.name).toBe('notepad.exe')
  })
})
```

- [ ] **Step 6.3 : enumerator.ts**

```ts
// src/main/blocking/processes/enumerator.ts
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
const execAsync = promisify(exec)

export type Process = { name: string; pid: number }

export function parseTasklistCsv(csv: string): Process[] {
  const out: Process[] = []
  for (const line of csv.split(/\r?\n/)) {
    if (!line.trim()) continue
    // CSV : "name","pid","sessionName","sessionNum","memUsage"
    const cells = parseCsvLine(line)
    if (cells.length < 2) continue
    const name = cells[0]
    const pidRaw = cells[1]
    if (!name || !pidRaw) continue
    const pid = Number(pidRaw)
    if (!Number.isFinite(pid)) continue
    out.push({ name: name.toLowerCase(), pid })
  }
  return out
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      inQuote = !inQuote
    } else if (c === ',' && !inQuote) {
      cells.push(cur)
      cur = ''
    } else {
      cur += c
    }
  }
  cells.push(cur)
  return cells
}

export async function listProcesses(): Promise<Process[]> {
  const { stdout } = await execAsync('tasklist /FO CSV /NH', { windowsHide: true })
  return parseTasklistCsv(stdout)
}
```

- [ ] **Step 6.4 :** `npm test -- enumerator` verts.

---

## Task 7 : Process killer + watcher

**Files :**
- Create : `src/main/blocking/processes/killer.ts`, `src/main/blocking/processes/watcher.ts`

- [ ] **Step 7.1 : killer**

```ts
// src/main/blocking/processes/killer.ts
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { isSafeListed } from './safe-list'

const execAsync = promisify(exec)

export async function killByImageName(imageName: string): Promise<void> {
  if (isSafeListed(imageName)) {
    throw new Error(`Refused to kill safe-listed process: ${imageName}`)
  }
  // /F = force, /IM = by image name, /T = arbre (process + enfants)
  // taskkill renvoie != 0 si aucun process — on traite ça comme succès silencieux
  try {
    await execAsync(`taskkill /F /IM "${imageName}" /T`, { windowsHide: true })
  } catch (err) {
    const msg = (err as { stderr?: string }).stderr ?? ''
    if (/not found|introuvable|aucune/i.test(msg)) return
    throw err
  }
}
```

- [ ] **Step 7.2 : watcher**

```ts
// src/main/blocking/processes/watcher.ts
import { listProcesses } from './enumerator'
import { killByImageName } from './killer'
import { isSafeListed } from './safe-list'

export type WatcherHandle = { stop: () => void }

/**
 * Démarre un watcher qui tue toutes les secondes les processus dont le nom
 * (insensible à la casse) appartient à `forbidden`. Refuse les noms safe-listed.
 */
export function startProcessWatcher(forbidden: string[]): WatcherHandle {
  const set = new Set(forbidden.map((n) => n.toLowerCase()).filter((n) => !isSafeListed(n)))
  let cancelled = false

  const tick = async () => {
    if (cancelled) return
    try {
      const procs = await listProcesses()
      const seen = new Set<string>()
      for (const p of procs) {
        if (set.has(p.name) && !seen.has(p.name)) {
          seen.add(p.name)
          await killByImageName(p.name).catch(() => {
            /* swallow — sera retenté à la prochaine itération */
          })
        }
      }
    } catch {
      /* swallow */
    }
  }

  const id = setInterval(tick, 1000)
  // tick immédiat
  void tick()

  return {
    stop: () => {
      cancelled = true
      clearInterval(id)
    },
  }
}
```

- [ ] **Step 7.3 :** Lint + typecheck.

---

## Task 8 : Firewall netsh + rule-tracker (TDD)

**Files :**
- Create : `src/main/blocking/firewall/netsh.ts`, `src/main/blocking/firewall/rule-tracker.ts`, `src/main/blocking/firewall/netsh.test.ts`

- [ ] **Step 8.1 : Tests parser show rule**

```ts
// src/main/blocking/firewall/netsh.test.ts
import { describe, it, expect } from 'vitest'
import { parseNetshShowRules, ruleNameFor } from './netsh'

const FIXTURE = `

Rule Name:                            Nexus_Block_abc123_chrome.exe
----------------------------------------------------------------------
Enabled:                              Yes
Direction:                            Out
Profiles:                             Domain,Private,Public
Action:                               Block

Rule Name:                            SomeOtherRule
----------------------------------------------------------------------
Enabled:                              Yes
`

describe('parseNetshShowRules', () => {
  it('extracts rule names', () => {
    expect(parseNetshShowRules(FIXTURE)).toEqual(['Nexus_Block_abc123_chrome.exe', 'SomeOtherRule'])
  })

  it('returns empty array on no match', () => {
    expect(parseNetshShowRules('No rules')).toEqual([])
  })
})

describe('ruleNameFor', () => {
  it('builds a stable rule name', () => {
    expect(ruleNameFor('abc-123', 'C:\\foo\\bar.exe')).toBe('Nexus_Block_abc-123_bar.exe')
  })
})
```

- [ ] **Step 8.2 : netsh.ts**

```ts
// src/main/blocking/firewall/netsh.ts
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import * as path from 'node:path'

const execAsync = promisify(exec)

export function ruleNameFor(sessionId: string, exePath: string): string {
  const base = path.basename(exePath)
  return `Nexus_Block_${sessionId}_${base}`
}

export function parseNetshShowRules(stdout: string): string[] {
  const out: string[] = []
  for (const line of stdout.split(/\r?\n/)) {
    const m = /^Rule Name:\s+(.+?)\s*$/.exec(line)
    if (m && m[1]) out.push(m[1])
  }
  return out
}

export async function addBlockRule(args: {
  sessionId: string
  exePath: string
}): Promise<string> {
  const name = ruleNameFor(args.sessionId, args.exePath)
  const cmd = `netsh advfirewall firewall add rule name="${name}" dir=out action=block program="${args.exePath}" enable=yes`
  await execAsync(cmd, { windowsHide: true })
  return name
}

export async function deleteRuleByName(name: string): Promise<void> {
  const cmd = `netsh advfirewall firewall delete rule name="${name}"`
  try {
    await execAsync(cmd, { windowsHide: true })
  } catch (err) {
    const msg = (err as { stderr?: string }).stderr ?? ''
    if (/No rules match|aucune règle/i.test(msg)) return
    throw err
  }
}

/** Liste tous les noms de règles existantes (pour drift / cleanup). */
export async function listRuleNames(): Promise<string[]> {
  const { stdout } = await execAsync('netsh advfirewall firewall show rule name=all', {
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  })
  return parseNetshShowRules(stdout)
}
```

- [ ] **Step 8.3 : rule-tracker.ts**

```ts
// src/main/blocking/firewall/rule-tracker.ts
import { addBlockRule, deleteRuleByName, listRuleNames } from './netsh'

export type FirewallTracker = {
  applied: () => string[]
  applyAll: (sessionId: string, exes: string[]) => Promise<string[]>
  removeAll: () => Promise<void>
  hydrate: (existing: string[]) => void
}

export function createFirewallTracker(): FirewallTracker {
  let applied: string[] = []
  return {
    applied: () => applied.slice(),
    hydrate: (existing) => {
      applied = existing.slice()
    },
    async applyAll(sessionId, exes) {
      const names: string[] = []
      for (const exe of exes) {
        const name = await addBlockRule({ sessionId, exePath: exe })
        names.push(name)
      }
      applied = names
      return names.slice()
    },
    async removeAll() {
      // Supprime selon ce qu'on a tracké, plus tout ce qui matche le préfixe
      // (au cas où un crash a créé des résidus)
      const all = await listRuleNames()
      const orphans = all.filter((n) => n.startsWith('Nexus_Block_'))
      const toDelete = new Set([...applied, ...orphans])
      for (const name of toDelete) {
        await deleteRuleByName(name).catch(() => {})
      }
      applied = []
    },
  }
}
```

- [ ] **Step 8.4 :** `npm test -- netsh` verts.

---

## Task 9 : Locks (cooldown + justification, TDD)

**Files :**
- Create : `src/main/blocking/session/locks/cooldown.ts`, `src/main/blocking/session/locks/justification.ts`, `src/main/blocking/session/locks/locks.test.ts`

- [ ] **Step 9.1 : Tests**

```ts
// src/main/blocking/session/locks/locks.test.ts
import { describe, it, expect } from 'vitest'
import { isCooldownReady, remainingMs } from './cooldown'
import { countWords, isJustificationValid } from './justification'

describe('cooldown', () => {
  it('not ready before duration', () => {
    const start = '2026-05-04T10:00:00.000Z'
    const now = new Date('2026-05-04T10:02:30.000Z').getTime()
    expect(isCooldownReady(start, 5, now)).toBe(false)
    expect(remainingMs(start, 5, now)).toBe(2 * 60 * 1000 + 30 * 1000)
  })

  it('ready at threshold', () => {
    const start = '2026-05-04T10:00:00.000Z'
    const now = new Date('2026-05-04T10:05:00.000Z').getTime()
    expect(isCooldownReady(start, 5, now)).toBe(true)
    expect(remainingMs(start, 5, now)).toBe(0)
  })
})

describe('justification', () => {
  it('counts words separated by whitespace', () => {
    expect(countWords('  hello  world\nfoo\tbar ')).toBe(4)
  })

  it('handles unicode + punctuation', () => {
    expect(countWords('café — naïveté !')).toBe(3)
  })

  it('returns 0 for empty', () => {
    expect(countWords('   \n  ')).toBe(0)
  })

  it('valid only above threshold', () => {
    expect(isJustificationValid('one two three', 5)).toBe(false)
    expect(isJustificationValid('one two three four five', 5)).toBe(true)
  })
})
```

- [ ] **Step 9.2 : cooldown.ts**

```ts
// src/main/blocking/session/locks/cooldown.ts
export function remainingMs(startedAtIso: string, minutes: number, nowMs: number): number {
  const startMs = Date.parse(startedAtIso)
  const target = startMs + minutes * 60 * 1000
  return Math.max(0, target - nowMs)
}

export function isCooldownReady(startedAtIso: string, minutes: number, nowMs: number): boolean {
  return remainingMs(startedAtIso, minutes, nowMs) === 0
}
```

- [ ] **Step 9.3 : justification.ts**

```ts
// src/main/blocking/session/locks/justification.ts
export function countWords(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/u).filter((w) => w.length > 0).length
}

export function isJustificationValid(text: string, minWords: number): boolean {
  return countWords(text) >= minWords
}
```

- [ ] **Step 9.4 :** `npm test -- locks` verts.

---

## Task 10 : Persistence + types session

**Files :**
- Create : `src/main/blocking/session/types.ts`, `src/main/blocking/session/persistence.ts`

- [ ] **Step 10.1 : types.ts**

```ts
// src/main/blocking/session/types.ts
export type SessionPhase = 'idle' | 'starting' | 'active' | 'ending'

export type LayerStatus = {
  hosts: 'ok' | 'drifted' | 'error' | 'inactive'
  processes: 'ok' | 'drifted' | 'error' | 'inactive'
  firewall: 'ok' | 'drifted' | 'error' | 'inactive'
}

export const INACTIVE_LAYERS: LayerStatus = {
  hosts: 'inactive',
  processes: 'inactive',
  firewall: 'inactive',
}
```

- [ ] **Step 10.2 : persistence.ts**

API du storage du sous-projet 1 : `createStorage(baseDir)` retourne un objet avec `.read(key)`, `.write(key, data)`, `.exists(key)`. Pas de delete → on utilise `fs.unlink` directement pour `clearActive`.

```ts
// src/main/blocking/session/persistence.ts
import { promises as fsp } from 'node:fs'
import * as path from 'node:path'
import { app } from 'electron'
import type { Storage } from '@main/storage'
import type { ActiveSession, BlockingState } from '@shared/schemas'

const EMPTY_STATE: BlockingState = { profiles: [], history: [] }

export type BlockingPersistence = {
  readState: () => Promise<BlockingState>
  writeState: (s: BlockingState) => Promise<void>
  readActive: () => Promise<ActiveSession | null>
  writeActive: (s: ActiveSession) => Promise<void>
  clearActive: () => Promise<void>
}

export function createBlockingPersistence(storage: Storage): BlockingPersistence {
  return {
    async readState() {
      return (await storage.read('blocking')) ?? EMPTY_STATE
    },
    async writeState(state) {
      await storage.write('blocking', state)
    },
    async readActive() {
      return (await storage.read('blocking_active')) ?? null
    },
    async writeActive(s) {
      await storage.write('blocking_active', s)
    },
    async clearActive() {
      const file = path.join(app.getPath('userData'), 'nexus_blocking_active.json')
      await fsp.unlink(file).catch(() => {})
    },
  }
}
```

- [ ] **Step 10.3 :** Lint + typecheck.

---

## Task 11 : Session manager state machine (TDD)

**Files :**
- Create : `src/main/blocking/session/manager.ts`, `src/main/blocking/session/manager.test.ts`

- [ ] **Step 11.1 : Tests** — couvrir : idle→starting→active heureux, rollback si hosts throw, rollback si firewall throw (hosts déjà appliqué doit être nettoyé), endsAt déclenche ending, requestUnlock refusé sans cooldown écoulé, requestUnlock accepté quand cooldown écoulé + justification valide.

Les couches sont injectées via interfaces pour pouvoir mocker :

```ts
export type HostsAdapter = {
  apply: (args: { sessionId: string; startedAt: string; domains: string[] }) => Promise<void>
  clear: () => Promise<void>
  flushDns: () => Promise<void>
}
export type ProcessAdapter = {
  start: (forbidden: string[]) => { stop: () => void }
}
export type FirewallAdapter = {
  applyAll: (sessionId: string, exes: string[]) => Promise<string[]>
  removeAll: () => Promise<void>
  applied: () => string[]
}
export type PersistenceAdapter = {
  readState: () => Promise<BlockingState>
  writeState: (s: BlockingState) => Promise<void>
  readActive: () => Promise<ActiveSession | null>
  writeActive: (s: ActiveSession) => Promise<void>
  clearActive: () => Promise<void>
}
```

Tests squelette (à étoffer) :

```ts
// src/main/blocking/session/manager.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSessionManager } from './manager'
import type { BlockingProfile } from '@shared/schemas'

const PROFILE: BlockingProfile = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'P',
  blockedSites: ['example.com'],
  blockedProcesses: ['notepad.exe'],
  blockedNetworkApps: ['C:\\Windows\\System32\\notepad.exe'],
  unlockPolicy: { type: 'cooldown_and_justification', minutes: 5, minWords: 50 },
  createdAt: '2026-05-04T09:00:00.000Z',
}

function makeAdapters() {
  return {
    hosts: { apply: vi.fn().mockResolvedValue(undefined), clear: vi.fn().mockResolvedValue(undefined), flushDns: vi.fn().mockResolvedValue(undefined) },
    processes: { start: vi.fn().mockReturnValue({ stop: vi.fn() }) },
    firewall: { applyAll: vi.fn().mockResolvedValue(['rule1']), removeAll: vi.fn().mockResolvedValue(undefined), applied: vi.fn().mockReturnValue(['rule1']) },
    persistence: {
      readState: vi.fn().mockResolvedValue({ profiles: [PROFILE], history: [] }),
      writeState: vi.fn().mockResolvedValue(undefined),
      readActive: vi.fn().mockResolvedValue(null),
      writeActive: vi.fn().mockResolvedValue(undefined),
      clearActive: vi.fn().mockResolvedValue(undefined),
    },
  }
}

describe('SessionManager', () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date('2026-05-04T10:00:00.000Z') }))

  it('start happy path applies all 3 layers atomically', async () => {
    const a = makeAdapters()
    const m = createSessionManager(a)
    await m.startSession({ profileId: PROFILE.id, durationMinutes: 60 })
    expect(a.hosts.apply).toHaveBeenCalled()
    expect(a.processes.start).toHaveBeenCalledWith(['notepad.exe'])
    expect(a.firewall.applyAll).toHaveBeenCalled()
    expect(a.hosts.flushDns).toHaveBeenCalled()
    expect(a.persistence.writeActive).toHaveBeenCalled()
  })

  it('rolls back hosts if firewall throws', async () => {
    const a = makeAdapters()
    a.firewall.applyAll.mockRejectedValueOnce(new Error('netsh failed'))
    const m = createSessionManager(a)
    await expect(m.startSession({ profileId: PROFILE.id, durationMinutes: 60 })).rejects.toThrow()
    expect(a.hosts.clear).toHaveBeenCalled()
    expect(a.persistence.writeActive).not.toHaveBeenCalled()
  })

  it('requestUnlock with cooldown_and_justification: refuses before cooldown', async () => {
    const a = makeAdapters()
    const m = createSessionManager(a)
    await m.startSession({ profileId: PROFILE.id, durationMinutes: 60 })
    const r1 = await m.requestUnlock()
    expect(r1.phase).toBe('cooldown')
    // pas écoulé
    vi.setSystemTime(new Date('2026-05-04T10:02:00.000Z'))
    const r2 = await m.submitJustification('a '.repeat(100))
    expect(r2.ok).toBe(false)
    expect(r2.reason).toContain('cooldown')
  })

  it('requestUnlock accepted after cooldown + valid justification', async () => {
    const a = makeAdapters()
    const m = createSessionManager(a)
    await m.startSession({ profileId: PROFILE.id, durationMinutes: 60 })
    await m.requestUnlock() // start cooldown
    vi.setSystemTime(new Date('2026-05-04T10:06:00.000Z'))
    const txt = Array(60).fill('mot').join(' ')
    const r = await m.submitJustification(txt)
    expect(r.ok).toBe(true)
    expect(a.hosts.clear).toHaveBeenCalled()
    expect(a.firewall.removeAll).toHaveBeenCalled()
  })
})
```

- [ ] **Step 11.2 : manager.ts** — implémentation complète (state machine, atomicité, timer endsAt, hooks pour drift detector).

```ts
// src/main/blocking/session/manager.ts
import { randomUUID } from 'node:crypto'
import type { ActiveSession, BlockingProfile, BlockingState } from '@shared/schemas'
import type { SessionPhase, LayerStatus } from './types'
import { INACTIVE_LAYERS } from './types'
import { isCooldownReady } from './locks/cooldown'
import { isJustificationValid } from './locks/justification'

type Adapters = {
  hosts: {
    apply: (args: { sessionId: string; startedAt: string; domains: string[] }) => Promise<void>
    clear: () => Promise<void>
    flushDns: () => Promise<void>
  }
  processes: { start: (forbidden: string[]) => { stop: () => void } }
  firewall: {
    applyAll: (sessionId: string, exes: string[]) => Promise<string[]>
    removeAll: () => Promise<void>
    applied: () => string[]
  }
  persistence: {
    readState: () => Promise<BlockingState>
    writeState: (s: BlockingState) => Promise<void>
    readActive: () => Promise<ActiveSession | null>
    writeActive: (s: ActiveSession) => Promise<void>
    clearActive: () => Promise<void>
  }
}

export type SessionManager = {
  getPhase: () => SessionPhase
  getActive: () => ActiveSession | null
  startSession: (args: { profileId: string; durationMinutes: number }) => Promise<ActiveSession>
  requestUnlock: () => Promise<ActiveSession['unlockState']>
  submitJustification: (text: string) => Promise<{ ok: true } | { ok: false; reason: string }>
  endSessionForce: (reason: 'timer' | 'unlock') => Promise<void>
  hydrateFromDisk: () => Promise<void>
  on: (event: 'sessionChanged', cb: (s: ActiveSession | null) => void) => void
}

export function createSessionManager(adapters: Adapters): SessionManager {
  let phase: SessionPhase = 'idle'
  let active: ActiveSession | null = null
  let watcherHandle: { stop: () => void } | null = null
  let endTimer: ReturnType<typeof setTimeout> | null = null
  const listeners: Array<(s: ActiveSession | null) => void> = []

  function emit() {
    for (const l of listeners) l(active)
  }

  async function startSession({ profileId, durationMinutes }: { profileId: string; durationMinutes: number }): Promise<ActiveSession> {
    if (phase !== 'idle') throw new Error('A session is already active')
    const state = await adapters.persistence.readState()
    const profile = state.profiles.find((p) => p.id === profileId)
    if (!profile) throw new Error(`Profile not found: ${profileId}`)

    phase = 'starting'
    const id = randomUUID()
    const startedAt = new Date().toISOString()
    const endsAt = new Date(Date.now() + durationMinutes * 60_000).toISOString()
    const session: ActiveSession = {
      id,
      profileId,
      profileSnapshot: profile,
      startedAt,
      endsAt,
      unlockState: { phase: 'locked' },
      appliedFirewallRules: [],
    }

    let hostsApplied = false
    let watcherStarted = false
    try {
      await adapters.persistence.writeActive(session)
      await adapters.hosts.apply({ sessionId: id, startedAt, domains: profile.blockedSites })
      hostsApplied = true
      await adapters.hosts.flushDns()
      watcherHandle = adapters.processes.start(profile.blockedProcesses)
      watcherStarted = true
      const ruleNames = await adapters.firewall.applyAll(id, profile.blockedNetworkApps)
      session.appliedFirewallRules = ruleNames
      await adapters.persistence.writeActive(session)
      active = session
      phase = 'active'
      scheduleEndTimer()
      emit()
      return session
    } catch (err) {
      // rollback
      if (watcherStarted && watcherHandle) {
        watcherHandle.stop()
        watcherHandle = null
      }
      if (hostsApplied) {
        await adapters.hosts.clear().catch(() => {})
        await adapters.hosts.flushDns().catch(() => {})
      }
      await adapters.firewall.removeAll().catch(() => {})
      await adapters.persistence.clearActive().catch(() => {})
      phase = 'idle'
      active = null
      throw err
    }
  }

  function scheduleEndTimer() {
    if (endTimer) clearTimeout(endTimer)
    if (!active) return
    const ms = Date.parse(active.endsAt) - Date.now()
    if (ms <= 0) {
      void endSessionForce('timer')
      return
    }
    endTimer = setTimeout(() => {
      void endSessionForce('timer')
    }, ms)
  }

  async function endSessionForce(reason: 'timer' | 'unlock'): Promise<void> {
    if (phase === 'idle' || !active) return
    phase = 'ending'
    if (endTimer) {
      clearTimeout(endTimer)
      endTimer = null
    }
    if (watcherHandle) {
      watcherHandle.stop()
      watcherHandle = null
    }
    await adapters.firewall.removeAll().catch(() => {})
    await adapters.hosts.clear().catch(() => {})
    await adapters.hosts.flushDns().catch(() => {})

    const state = await adapters.persistence.readState()
    state.history.unshift({
      sessionId: active.id,
      profileId: active.profileId,
      startedAt: active.startedAt,
      endedAt: new Date().toISOString(),
      completedNormally: reason === 'timer',
    })
    if (state.history.length > 500) state.history.length = 500
    await adapters.persistence.writeState(state)
    await adapters.persistence.clearActive()

    active = null
    phase = 'idle'
    emit()
  }

  async function requestUnlock(): Promise<ActiveSession['unlockState']> {
    if (!active) throw new Error('No active session')
    const policy = active.profileSnapshot.unlockPolicy
    if (policy.type === 'none') {
      await endSessionForce('unlock')
      return { phase: 'unlocked', reason: 'no policy' }
    }
    if (policy.type === 'justification') {
      active.unlockState = { phase: 'awaiting_justification' }
      await adapters.persistence.writeActive(active)
      emit()
      return active.unlockState
    }
    // cooldown ou cooldown_and_justification
    active.unlockState = { phase: 'cooldown', startedAt: new Date().toISOString() }
    await adapters.persistence.writeActive(active)
    emit()
    return active.unlockState
  }

  async function submitJustification(text: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (!active) return { ok: false, reason: 'no active session' }
    const policy = active.profileSnapshot.unlockPolicy
    const now = Date.now()

    if (policy.type === 'none') {
      await endSessionForce('unlock')
      return { ok: true }
    }
    if (policy.type === 'cooldown') {
      if (active.unlockState.phase !== 'cooldown') {
        return { ok: false, reason: 'request unlock first' }
      }
      if (!isCooldownReady(active.unlockState.startedAt, policy.minutes, now)) {
        return { ok: false, reason: 'cooldown not elapsed' }
      }
      await endSessionForce('unlock')
      return { ok: true }
    }
    if (policy.type === 'justification') {
      if (!isJustificationValid(text, policy.minWords)) {
        return { ok: false, reason: `justification needs at least ${policy.minWords} words` }
      }
      await endSessionForce('unlock')
      return { ok: true }
    }
    // cooldown_and_justification
    if (active.unlockState.phase !== 'cooldown') {
      return { ok: false, reason: 'request unlock first' }
    }
    if (!isCooldownReady(active.unlockState.startedAt, policy.minutes, now)) {
      return { ok: false, reason: 'cooldown not elapsed' }
    }
    if (!isJustificationValid(text, policy.minWords)) {
      return { ok: false, reason: `justification needs at least ${policy.minWords} words` }
    }
    await endSessionForce('unlock')
    return { ok: true }
  }

  async function hydrateFromDisk(): Promise<void> {
    const existing = await adapters.persistence.readActive()
    if (!existing) return
    if (Date.parse(existing.endsAt) <= Date.now()) {
      // expirée pendant qu'on était fermé → cleanup
      await adapters.firewall.removeAll().catch(() => {})
      await adapters.hosts.clear().catch(() => {})
      await adapters.hosts.flushDns().catch(() => {})
      await adapters.persistence.clearActive()
      return
    }
    // re-applique : ré-écrit hosts (pourrait avoir été modifié), ré-applique firewall
    await adapters.hosts.apply({
      sessionId: existing.id,
      startedAt: existing.startedAt,
      domains: existing.profileSnapshot.blockedSites,
    })
    await adapters.hosts.flushDns()
    watcherHandle = adapters.processes.start(existing.profileSnapshot.blockedProcesses)
    await adapters.firewall.removeAll() // nettoie résidus
    const ruleNames = await adapters.firewall.applyAll(existing.id, existing.profileSnapshot.blockedNetworkApps)
    existing.appliedFirewallRules = ruleNames
    await adapters.persistence.writeActive(existing)
    active = existing
    phase = 'active'
    scheduleEndTimer()
    emit()
  }

  return {
    getPhase: () => phase,
    getActive: () => active,
    startSession,
    requestUnlock,
    submitJustification,
    endSessionForce,
    hydrateFromDisk,
    on: (_, cb) => listeners.push(cb),
  }
}
```

- [ ] **Step 11.3 :** `npm test -- manager` verts.

---

## Task 12 : Drift detector

**Files :**
- Create : `src/main/blocking/session/drift-detector.ts`

- [ ] **Step 12.1 :**

```ts
// src/main/blocking/session/drift-detector.ts
import { promises as fsp } from 'node:fs'
import { HOSTS_PATH, applyNexusBlock } from '../hosts/writer'
import { parseHostsFile } from '../hosts/parser'
import { flushDns } from '../hosts/flush-dns'
import { listRuleNames } from '../firewall/netsh'
import { renderNexusBlock } from '../hosts/writer'
import type { ActiveSession } from '@shared/schemas'

export type DriftEvent = { layer: 'hosts' | 'firewall'; restored: boolean }

export type DriftDetector = {
  start: (getActive: () => ActiveSession | null, applyFirewall: (s: ActiveSession) => Promise<void>) => void
  stop: () => void
  on: (cb: (e: DriftEvent) => void) => void
}

export function createDriftDetector(): DriftDetector {
  let timer: ReturnType<typeof setInterval> | null = null
  const listeners: Array<(e: DriftEvent) => void> = []

  return {
    start(getActive, applyFirewall) {
      if (timer) return
      timer = setInterval(async () => {
        const active = getActive()
        if (!active) return
        try {
          // hosts
          const raw = await fsp.readFile(HOSTS_PATH, 'utf8')
          const parsed = parseHostsFile(raw)
          const expected = renderNexusBlock({
            sessionId: active.id,
            startedAt: active.startedAt,
            domains: active.profileSnapshot.blockedSites,
          })
          // comparaison textuelle simple : sentinels + entries
          const hasBlock = parsed.nexusBlock != null
          const blockMatches =
            parsed.nexusBlock?.entries.length ===
            active.profileSnapshot.blockedSites.length * 8 // 4 préfixes × 2 IPs
          if (!hasBlock || !blockMatches) {
            await applyNexusBlock({
              sessionId: active.id,
              startedAt: active.startedAt,
              domains: active.profileSnapshot.blockedSites,
            })
            await flushDns()
            for (const l of listeners) l({ layer: 'hosts', restored: true })
          }
          // firewall
          const allRules = await listRuleNames()
          const expectedNames = new Set(active.appliedFirewallRules)
          const stillThere = allRules.filter((n) => expectedNames.has(n))
          if (stillThere.length !== expectedNames.size) {
            await applyFirewall(active)
            for (const l of listeners) l({ layer: 'firewall', restored: true })
          }
          // process layer : géré par son propre watcher 1s
        } catch {
          /* swallow et retry */
        }
      }, 5000)
    },
    stop() {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    },
    on(cb) {
      listeners.push(cb)
    },
  }
}
```

- [ ] **Step 12.2 :** Lint + typecheck.

---

## Task 13 : IPC handlers blocage

**Files :**
- Create : `src/main/blocking/ipc/blocking.handlers.ts`
- Modify : `src/main/ipc/index.ts`, `src/main/index.ts`

- [ ] **Step 13.1 :** `blocking.handlers.ts` instancie tous les adaptateurs et enregistre les handlers. Reçoit `storage` + `getMainWindow`.

```ts
// src/main/blocking/ipc/blocking.handlers.ts
import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import { BlockingProfileSchema } from '@shared/schemas'
import type { Storage } from '@main/storage'
import { createSessionManager } from '../session/manager'
import { createDriftDetector } from '../session/drift-detector'
import { createFirewallTracker } from '../firewall/rule-tracker'
import { startProcessWatcher } from '../processes/watcher'
import { applyNexusBlock, clearNexusBlock } from '../hosts/writer'
import { flushDns } from '../hosts/flush-dns'
import { createBlockingPersistence } from '../session/persistence'
import { isElevated } from '../elevation'
import { isSafeListed } from '../processes/safe-list'
import { randomUUID } from 'node:crypto'

export async function registerBlockingHandlers(
  storage: Storage,
  getMainWindow: () => BrowserWindow | null,
) {
  const persistence = createBlockingPersistence(storage)
  const firewall = createFirewallTracker()
  const manager = createSessionManager({
    hosts: { apply: applyNexusBlock, clear: clearNexusBlock, flushDns },
    processes: { start: startProcessWatcher },
    firewall: {
      applyAll: firewall.applyAll,
      removeAll: firewall.removeAll,
      applied: firewall.applied,
    },
    persistence,
  })

  manager.on('sessionChanged', (s) => {
    getMainWindow()?.webContents.send(IPC_CHANNELS.BLOCKING_EVENT_SESSION_CHANGED, s)
  })

  const drift = createDriftDetector()
  drift.on((e) => {
    getMainWindow()?.webContents.send(IPC_CHANNELS.BLOCKING_EVENT_LAYER_DRIFT, e)
  })
  drift.start(
    () => manager.getActive(),
    async (s) => {
      await firewall.removeAll().catch(() => {})
      const names = await firewall.applyAll(s.id, s.profileSnapshot.blockedNetworkApps)
      s.appliedFirewallRules = names
      await persistence.writeActive(s)
    },
  )

  await manager.hydrateFromDisk().catch((err) => {
    console.error('[blocking] hydrate failed', err)
  })

  ipcMain.handle(IPC_CHANNELS.BLOCKING_GET_INITIAL_STATE, async () => {
    const state = await persistence.readState()
    return { state, active: manager.getActive() }
  })

  ipcMain.handle(IPC_CHANNELS.BLOCKING_SAVE_PROFILE, async (_e, draft: unknown) => {
    const profile = BlockingProfileSchema.parse({
      ...(draft as object),
      id: (draft as { id?: string }).id ?? randomUUID(),
      createdAt: (draft as { createdAt?: string }).createdAt ?? new Date().toISOString(),
    })
    // refus safe-list
    for (const exeName of profile.blockedProcesses) {
      if (isSafeListed(exeName)) throw new Error(`System process refused: ${exeName}`)
    }
    const state = await persistence.readState()
    const idx = state.profiles.findIndex((p) => p.id === profile.id)
    if (idx >= 0) state.profiles[idx] = profile
    else state.profiles.push(profile)
    await persistence.writeState(state)
    return profile
  })

  ipcMain.handle(IPC_CHANNELS.BLOCKING_DELETE_PROFILE, async (_e, id: string) => {
    const state = await persistence.readState()
    state.profiles = state.profiles.filter((p) => p.id !== id)
    await persistence.writeState(state)
  })

  ipcMain.handle(IPC_CHANNELS.BLOCKING_START_SESSION, async (_e, args: { profileId: string; durationMinutes: number }) => {
    return manager.startSession(args)
  })

  ipcMain.handle(IPC_CHANNELS.BLOCKING_REQUEST_UNLOCK, async () => manager.requestUnlock())

  ipcMain.handle(IPC_CHANNELS.BLOCKING_SUBMIT_JUSTIFICATION, async (_e, text: string) =>
    manager.submitJustification(text),
  )

  ipcMain.handle(IPC_CHANNELS.BLOCKING_GET_LAYER_STATUS, async () => {
    const active = manager.getActive()
    if (!active) return { hosts: 'inactive', processes: 'inactive', firewall: 'inactive' }
    return { hosts: 'ok', processes: 'ok', firewall: 'ok' }
  })

  ipcMain.handle(IPC_CHANNELS.BLOCKING_IS_ELEVATED, async () => isElevated())
}
```

- [ ] **Step 13.2 :** Modifier `src/main/ipc/index.ts` pour appeler `await registerBlockingHandlers(getMainWindow)`.

- [ ] **Step 13.3 :** Modifier `src/main/index.ts` pour passer un getter sur la `mainWindow` aux handlers.

- [ ] **Step 13.4 :** Lint + typecheck.

---

## Task 14 : Préload + wrapper IPC renderer

**Files :**
- Modify : `src/preload/index.ts`, `src/renderer/src/lib/ipc.ts`

- [ ] **Step 14.1 :** Étendre `nexus` exposé via `contextBridge`.

```ts
// src/preload/index.ts (ajouter au handle nexus)
blocking: {
  getInitialState: () => ipcRenderer.invoke(IPC_CHANNELS.BLOCKING_GET_INITIAL_STATE),
  saveProfile: (draft: unknown) => ipcRenderer.invoke(IPC_CHANNELS.BLOCKING_SAVE_PROFILE, draft),
  deleteProfile: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.BLOCKING_DELETE_PROFILE, id),
  startSession: (args: { profileId: string; durationMinutes: number }) =>
    ipcRenderer.invoke(IPC_CHANNELS.BLOCKING_START_SESSION, args),
  requestUnlock: () => ipcRenderer.invoke(IPC_CHANNELS.BLOCKING_REQUEST_UNLOCK),
  submitJustification: (text: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.BLOCKING_SUBMIT_JUSTIFICATION, text),
  getLayerStatus: () => ipcRenderer.invoke(IPC_CHANNELS.BLOCKING_GET_LAYER_STATUS),
  isElevated: () => ipcRenderer.invoke(IPC_CHANNELS.BLOCKING_IS_ELEVATED),
  onSessionChanged: (cb: (s: unknown) => void) => {
    const listener = (_: unknown, payload: unknown) => cb(payload)
    ipcRenderer.on(IPC_CHANNELS.BLOCKING_EVENT_SESSION_CHANGED, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.BLOCKING_EVENT_SESSION_CHANGED, listener)
  },
  onLayerDrift: (cb: (e: { layer: string; restored: boolean }) => void) => {
    const listener = (_: unknown, payload: unknown) =>
      cb(payload as { layer: string; restored: boolean })
    ipcRenderer.on(IPC_CHANNELS.BLOCKING_EVENT_LAYER_DRIFT, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.BLOCKING_EVENT_LAYER_DRIFT, listener)
  },
},
```

- [ ] **Step 14.2 :** Mettre à jour le wrapper `src/renderer/src/lib/ipc.ts` (typer la sortie via `ActiveSession`, `BlockingState`).

- [ ] **Step 14.3 :** Lint + typecheck.

---

## Task 15 : Zustand store blocage

**Files :**
- Create : `src/renderer/src/store/blocking.store.ts`

- [ ] **Step 15.1 :**

```ts
import { create } from 'zustand'
import { nexus } from '@/lib/ipc'
import type { ActiveSession, BlockingProfile, BlockingState } from '@shared/schemas'

type LayerStatus = { hosts: string; processes: string; firewall: string }

type BlockingStore = {
  loaded: boolean
  elevated: boolean
  state: BlockingState
  active: ActiveSession | null
  layerStatus: LayerStatus
  driftToast: { layer: string; at: number } | null

  load: () => Promise<void>
  saveProfile: (draft: unknown) => Promise<void>
  deleteProfile: (id: string) => Promise<void>
  startSession: (profileId: string, minutes: number) => Promise<void>
  requestUnlock: () => Promise<void>
  submitJustification: (text: string) => Promise<{ ok: boolean; reason?: string }>
  refreshLayerStatus: () => Promise<void>
}

export const useBlockingStore = create<BlockingStore>((set, get) => ({
  loaded: false,
  elevated: false,
  state: { profiles: [], history: [] },
  active: null,
  layerStatus: { hosts: 'inactive', processes: 'inactive', firewall: 'inactive' },
  driftToast: null,

  async load() {
    const elevated = await nexus.blocking.isElevated()
    const initial = await nexus.blocking.getInitialState()
    set({ loaded: true, elevated, state: initial.state, active: initial.active })
    nexus.blocking.onSessionChanged((s) => set({ active: s as ActiveSession | null }))
    nexus.blocking.onLayerDrift((e) => set({ driftToast: { layer: e.layer, at: Date.now() } }))
    void get().refreshLayerStatus()
  },
  async saveProfile(draft) {
    const saved = (await nexus.blocking.saveProfile(draft)) as BlockingProfile
    const profiles = get().state.profiles.slice()
    const i = profiles.findIndex((p) => p.id === saved.id)
    if (i >= 0) profiles[i] = saved
    else profiles.push(saved)
    set({ state: { ...get().state, profiles } })
  },
  async deleteProfile(id) {
    await nexus.blocking.deleteProfile(id)
    set({ state: { ...get().state, profiles: get().state.profiles.filter((p) => p.id !== id) } })
  },
  async startSession(profileId, minutes) {
    const s = (await nexus.blocking.startSession({ profileId, durationMinutes: minutes })) as ActiveSession
    set({ active: s })
    void get().refreshLayerStatus()
  },
  async requestUnlock() {
    await nexus.blocking.requestUnlock()
    // active sera mis à jour via event sessionChanged
  },
  async submitJustification(text) {
    const r = (await nexus.blocking.submitJustification(text)) as { ok: boolean; reason?: string }
    return r
  },
  async refreshLayerStatus() {
    const s = (await nexus.blocking.getLayerStatus()) as LayerStatus
    set({ layerStatus: s })
  },
}))
```

- [ ] **Step 15.2 :** Lint + typecheck.

---

## Task 16 : BlockingPage UI — composants

**Files :**
- Create : `src/renderer/src/components/blocking/ProfileCard.tsx`, `ActiveSessionCard.tsx`, `ProfileEditor.tsx`, `UnlockModal.tsx`, `HistoryList.tsx`
- Rewrite : `src/renderer/src/pages/BlockingPage.tsx`

- [ ] **Step 16.1 : ProfileCard** — carte cliquable avec gradient subtil basé sur le dernier usage (vert si récent, gris sinon), nom, compte de sites/apps/network, bouton Démarrer, hover smooth. Framer Motion `whileHover={{ y: -2 }}`.

- [ ] **Step 16.2 : ActiveSessionCard** — bandeau pleine largeur :
  - Titre profile en gras, durée restante (compte à rebours live, mise à jour 1s)
  - 3 pastilles statut couches (vert/jaune/rouge) avec micro-pulse vert après un drift restauré
  - Bouton « Demander à arrêter » → ouvre `UnlockModal`
  - Effet : carte légèrement glow accent quand session active

- [ ] **Step 16.3 : ProfileEditor** — slide-in panel droit (Framer Motion `x: '100%'` → `0`), avec :
  - Champ nom
  - 3 textareas (un par liste : sites, processes, networkApps), avec validation visuelle live
  - Radio group `unlockPolicy`
  - Boutons Sauvegarder / Annuler / Supprimer (si édition)

- [ ] **Step 16.4 : UnlockModal** — modal pleine width centrée :
  - Phase cooldown : compte à rebours géant (6xl) + texte « Tiens bon. Cette envie est temporaire. »
  - Champ texte verrouillé (disabled) jusqu'à fin du cooldown
  - À l'expiration : champ activable, compteur mots live, bouton « Confirmer l'arrêt » disabled tant que pas assez
  - Phase justification only : pas de cooldown affiché, juste le champ + compteur
  - Animations : transition douce entre phases

- [ ] **Step 16.5 : HistoryList** — liste compacte, 30 dernières sessions, chaque ligne = badge ✓/✗ + nom profile + durée + date relative.

- [ ] **Step 16.6 : BlockingPage**

```tsx
import { useEffect } from 'react'
import { useBlockingStore } from '@/store/blocking.store'
import { PageTransition } from '@/components/PageTransition'
import { ActiveSessionCard } from '@/components/blocking/ActiveSessionCard'
import { ProfileCard } from '@/components/blocking/ProfileCard'
import { HistoryList } from '@/components/blocking/HistoryList'
// + ProfileEditor + UnlockModal en local state

export default function BlockingPage() {
  const { loaded, elevated, state, active, load } = useBlockingStore()
  useEffect(() => { void load() }, [load])

  if (!loaded) return <PageTransition><div className="px-12 pt-16">Chargement…</div></PageTransition>

  return (
    <PageTransition>
      <div className="flex h-full flex-col gap-8 px-12 pt-16 pb-12 overflow-y-auto">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">Blocage</h1>
          <p className="mt-2 text-sm text-text-secondary">
            Crée des sanctuaires d'attention. Décide à froid pour t'épargner les arbitrages à chaud.
          </p>
        </header>

        {!elevated && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-amber-300">
            Nexus n'est pas en mode administrateur. Les blocages ne peuvent pas être appliqués.
            Relance Nexus avec « Exécuter en tant qu'administrateur ».
          </div>
        )}

        {active ? <ActiveSessionCard session={active} /> : null}

        <section>
          <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-text-muted">Profiles</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {state.profiles.map((p) => <ProfileCard key={p.id} profile={p} disabled={!!active || !elevated} />)}
            {/* Bouton + Nouveau profile */}
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-text-muted">Historique</h2>
          <HistoryList items={state.history.slice(0, 30)} profiles={state.profiles} />
        </section>
      </div>
    </PageTransition>
  )
}
```

- [ ] **Step 16.7 :** Lint + typecheck. **Qualité visuelle 11/10** : ne pas livrer si la page paraît plate ; soigner spacings, transitions, micro-interactions, couleurs des statuts. Cohérence avec le ton du sous-projet 1 (Sidebar animée).

---

## Task 17 : Manifest UAC requireAdministrator

**Files :**
- Modify : `electron-builder.yml`

- [ ] **Step 17.1 :** Ajouter dans la section `win:` :

```yaml
win:
  requestedExecutionLevel: requireAdministrator
  target:
    - target: nsis
      arch:
        - x64
    - target: portable
      arch:
        - x64
```

- [ ] **Step 17.2 :** Build de test : `npm run build:win`. L'installer doit demander UAC au lancement de Nexus.

---

## Task 18 : Vérification finale + démo bout-en-bout

- [ ] **Step 18.1 :** `npm run typecheck` → vert
- [ ] **Step 18.2 :** `npm run lint` → vert
- [ ] **Step 18.3 :** `npm test` → vert (unitaires)
- [ ] **Step 18.4 :** `npm run dev` en admin → Page Blocage charge, bannière absente
- [ ] **Step 18.5 :** Créer profile « Test » : `[example.com]`, `[notepad.exe]`, `[]`, politique `cooldown_and_justification` (5 min, 100 mots)
- [ ] **Step 18.6 :** Démarrer session 10 min → vérifier dans terminal :
  ```
  type C:\Windows\System32\drivers\etc\hosts    # bloc Nexus présent
  ping example.com                              # → 127.0.0.1
  notepad                                        # tué dans la seconde
  ```
- [ ] **Step 18.7 :** Éditer manuellement le hosts (retirer une ligne) → 5s plus tard, Nexus la remet (toast)
- [ ] **Step 18.8 :** « Demander à arrêter » → cooldown 5 min ; champ verrouillé pendant 5 min ; à l'expiration champ s'active
- [ ] **Step 18.9 :** Soumettre 50 mots → refus ; soumettre 100+ mots → session arrêtée, hosts restauré, notepad re-lançable
- [ ] **Step 18.10 :** Tuer Nexus pendant une session → relancer → couches restaurées, timer reprend
- [ ] **Step 18.11 :** Mettre à jour `NEXUS_SPEC.md` : sous-projet 2 = ✅ Livré, lien vers spec
- [ ] **Step 18.12 :** Tag git `v0.2.0-blocking`

---

## Critères de succès

- [ ] Tous les fichiers créés et testés
- [ ] Lint + typecheck + tests Vitest verts
- [ ] Démo bout-en-bout (§7 du spec) fonctionnelle de A à Z
- [ ] Hosts file backup créé une fois, jamais écrasé
- [ ] Drift detector ré-applique en moins de 10s sur les 3 couches
- [ ] Survit au crash : redémarrage Nexus en milieu de session = couches restaurées
- [ ] UI 11/10 (cohérent avec sous-projet 1)
- [ ] `requestedExecutionLevel: requireAdministrator` dans le build prod
- [ ] `NEXUS_SPEC.md` mis à jour
- [ ] Tag `v0.2.0-blocking` posé
