# Mode liste blanche (focus) — Phase 1 (apps) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un mode « liste blanche » par profil de blocage qui, une fois actif, ferme en continu toutes les apps à fenêtre visible sauf celles que l'utilisateur a autorisées.

**Architecture:** Le blocage tourne dans le service Windows ; le `main` n'est qu'un relais et le schéma est partagé. On ajoute un champ `mode` au profil (défaut `blocklist`, rétrocompatible). En `allowlist`, le `SessionManager` n'applique ni hosts ni pare-feu et démarre un « tueur inversé » qui n'énumère que les processus possédant une fenêtre principale, et ferme ceux hors de l'ensemble autorisé et hors safe-list système. Les sites en liste blanche sont la Phase 2 (résolveur DNS, spec séparée).

**Tech Stack:** TypeScript, Zod, Vitest, Electron (main/renderer/service), PowerShell (énumération des fenêtres), React + Tailwind + framer-motion.

**Spec :** `docs/superpowers/specs/2026-05-21-nexus-allowlist-focus-mode-design.md`

---

## File Structure

**Partagé**
- `src/shared/schemas.ts` (modif) — champ `mode` sur `BlockingProfileSchema`.
- `src/shared/schemas.test.ts` (créer) — tests du défaut/parse de `mode`.

**Service — énumération & kill**
- `src/service/blocking/processes/exe-name.ts` (créer) — helper pur `normalizeExeName`.
- `src/service/blocking/processes/exe-name.test.ts` (créer).
- `src/service/blocking/processes/enumerator.ts` (modif) — `listWindowedProcesses` + `parseWindowedProcessesCsv`.
- `src/service/blocking/processes/enumerator.test.ts` (créer).
- `src/service/blocking/processes/safe-list.ts` (modif) — durcir (UI Nexus).
- `src/service/blocking/processes/safe-list.test.ts` (créer).
- `src/service/blocking/processes/killer.ts` (modif) — `startAllowlistKiller`.
- `src/service/blocking/processes/killer.test.ts` (créer).

**Service — orchestration**
- `src/service/blocking/session/manager.ts` (modif) — signature `ProcessAdapter`, branchement `mode`, garde liste vide.
- `src/service/blocking/session/manager.test.ts` (modif) — fixture `mode`, assertion signature, tests allowlist.
- `src/service/blocking/session/drift-detector.ts` (modif) — sortie anticipée en `allowlist`.
- `src/service/blocking-adapters.ts` (modif) — `createProcessControl.start({mode,names})`, bypass AppLocker en allowlist.
- `src/service/blocking-host.ts` (modif) — `saveProfile` safe-list seulement en blocklist ; `getLayerStatus` allowlist.
- `src/service/blocking-host.test.ts` (modif) — fixture `mode`, tests allowlist.

**Renderer — UI**
- `src/renderer/src/components/blocking/ProfileEditor.tsx` (modif) — interrupteur de mode, libellés dynamiques, garde liste vide, `mode` dans le draft.
- `src/renderer/src/components/blocking/ActiveSessionCard.tsx` (modif) — badge focus + libellés « autorisés ».

---

## Task 1: Champ `mode` sur le profil de blocage

**Files:**
- Modify: `src/shared/schemas.ts:62-79` (`BlockingProfileSchema`)
- Test: `src/shared/schemas.test.ts` (create)
- Modify (fixtures typecheck): `src/service/blocking/session/manager.test.ts:5-13`, `src/service/blocking-host.test.ts:13-21`

- [ ] **Step 1: Write the failing test**

Create `src/shared/schemas.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { BlockingProfileSchema } from './schemas'

const base = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'P',
  blockedSites: [],
  blockedProcesses: [],
  blockedNetworkApps: [],
  unlockPolicy: { type: 'none' as const },
  createdAt: '2026-05-21T09:00:00.000Z',
}

describe('BlockingProfileSchema.mode', () => {
  it('défaut à blocklist quand absent', () => {
    expect(BlockingProfileSchema.parse(base).mode).toBe('blocklist')
  })
  it('accepte allowlist', () => {
    expect(BlockingProfileSchema.parse({ ...base, mode: 'allowlist' }).mode).toBe('allowlist')
  })
  it('rejette une valeur inconnue', () => {
    expect(() => BlockingProfileSchema.parse({ ...base, mode: 'nope' })).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/shared/schemas.test.ts`
Expected: FAIL — `mode` est `undefined` (le champ n'existe pas encore).

- [ ] **Step 3: Add the field**

In `src/shared/schemas.ts`, inside `BlockingProfileSchema`, add the `mode` field right after `blockedNetworkApps`:

```ts
  blockedNetworkApps: z.array(z.string()),
  /** blocklist = bloquer ces entrées ; allowlist = n'autoriser que ces entrées, bloquer le reste. */
  mode: z.enum(['blocklist', 'allowlist']).default('blocklist'),
  unlockPolicy: z.discriminatedUnion('type', [
```

- [ ] **Step 4: Fix the two typed `BlockingProfile` fixtures**

`mode` est requis dans le type de sortie (`z.infer`). Ajoute `mode: 'blocklist',` aux deux littéraux typés `BlockingProfile`.

In `src/service/blocking/session/manager.test.ts`, in the `PROFILE` const (after `blockedNetworkApps: [...],`):

```ts
  blockedNetworkApps: ['C:\\Windows\\System32\\notepad.exe'],
  mode: 'blocklist',
  unlockPolicy: { type: 'cooldown_and_justification', minutes: 5, minWords: 50 },
```

In `src/service/blocking-host.test.ts`, in the `PROFILE` const (after `blockedNetworkApps: [],`):

```ts
  blockedNetworkApps: [],
  mode: 'blocklist',
  unlockPolicy: { type: 'none' },
```

- [ ] **Step 5: Run tests + typecheck to verify they pass**

Run: `npm run test -- src/shared/schemas.test.ts && npm run typecheck`
Expected: PASS. Si le typecheck signale d'autres littéraux `BlockingProfile` sans `mode`, ajoute-leur `mode: 'blocklist',` et relance.

- [ ] **Step 6: Commit**

```bash
git add src/shared/schemas.ts src/shared/schemas.test.ts src/service/blocking/session/manager.test.ts src/service/blocking-host.test.ts
git commit -m "feat(blocking): champ mode (blocklist/allowlist) sur le profil"
```

---

## Task 2: Helper pur `normalizeExeName`

**Files:**
- Create: `src/service/blocking/processes/exe-name.ts`
- Test: `src/service/blocking/processes/exe-name.test.ts` (create)
- Modify: `src/service/blocking/processes/killer.ts:10-12` (utiliser le helper extrait)

- [ ] **Step 1: Write the failing test**

Create `src/service/blocking/processes/exe-name.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { normalizeExeName } from './exe-name'

describe('normalizeExeName', () => {
  it('retire le chemin et met en minuscules', () => {
    expect(normalizeExeName('C:\\Program Files\\App\\Chrome.EXE')).toBe('chrome.exe')
  })
  it('gère les slashs avant', () => {
    expect(normalizeExeName('/usr/bin/Foo.exe')).toBe('foo.exe')
  })
  it('laisse passer un nom nu en minuscules', () => {
    expect(normalizeExeName('Notepad.exe')).toBe('notepad.exe')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/service/blocking/processes/exe-name.test.ts`
Expected: FAIL — `Cannot find module './exe-name'`.

- [ ] **Step 3: Create the helper**

Create `src/service/blocking/processes/exe-name.ts`:

```ts
/** Normalise une valeur (chemin ou nom) en nom d'exe minuscule, sans chemin. */
export function normalizeExeName(value: string): string {
  return value.trim().replace(/^.*[\\/]/u, '').toLowerCase()
}
```

- [ ] **Step 4: Reuse it in killer.ts**

In `src/service/blocking/processes/killer.ts`, remove the local `normalizeExeName` function (lines 10-12) and import the helper instead. At the top, after the existing imports:

```ts
import { execFile } from 'node:child_process'
import log from '../engine-log'
import { listProcesses } from './enumerator'
import { isSafeListed } from './safe-list'
import { normalizeExeName } from './exe-name'
```

Delete this block from `killer.ts`:

```ts
function normalizeExeName(value: string): string {
  return value.trim().replace(/^.*[\\/]/u, '').toLowerCase()
}
```

- [ ] **Step 5: Run tests + typecheck to verify they pass**

Run: `npm run test -- src/service/blocking/processes/exe-name.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/service/blocking/processes/exe-name.ts src/service/blocking/processes/exe-name.test.ts src/service/blocking/processes/killer.ts
git commit -m "refactor(blocking): extraire normalizeExeName dans exe-name.ts"
```

---

## Task 3: Énumérer les processus à fenêtre visible

**Files:**
- Modify: `src/service/blocking/processes/enumerator.ts` (ajout)
- Test: `src/service/blocking/processes/enumerator.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/service/blocking/processes/enumerator.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseWindowedProcessesCsv } from './enumerator'

describe('parseWindowedProcessesCsv', () => {
  it("ignore l'en-tête et ajoute .exe", () => {
    const csv = '"Name","Id"\r\n"chrome","1234"\r\n"Code","5678"\r\n'
    expect(parseWindowedProcessesCsv(csv)).toEqual([
      { name: 'chrome.exe', pid: 1234 },
      { name: 'code.exe', pid: 5678 },
    ])
  })
  it('ne double pas un suffixe .exe déjà présent', () => {
    expect(parseWindowedProcessesCsv('"Name","Id"\r\n"foo.exe","9"\r\n')).toEqual([
      { name: 'foo.exe', pid: 9 },
    ])
  })
  it('ignore les lignes malformées', () => {
    expect(parseWindowedProcessesCsv('"Name","Id"\r\ngarbage\r\n"bar","abc"\r\n')).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/service/blocking/processes/enumerator.test.ts`
Expected: FAIL — `parseWindowedProcessesCsv` n'est pas exporté.

- [ ] **Step 3: Implement the parser + lister**

In `src/service/blocking/processes/enumerator.ts`, append after `listProcesses` (the file already defines `parseCsvLine`, `Process`, and `execAsync`):

```ts
/**
 * Parse la sortie `ConvertTo-Csv` de Get-Process (colonnes Name,Id). Get-Process
 * renvoie le nom sans extension → on ajoute `.exe` pour rester homogène avec le
 * reste du blocage (qui raisonne en noms d'exe).
 */
export function parseWindowedProcessesCsv(csv: string): Process[] {
  const out: Process[] = []
  for (const line of csv.split(/\r?\n/)) {
    if (!line.trim()) continue
    const cells = parseCsvLine(line)
    if (cells.length < 2) continue
    const name = cells[0]
    const pidRaw = cells[1]
    if (!name || !pidRaw) continue
    if (name === 'Name' && pidRaw === 'Id') continue // en-tête ConvertTo-Csv
    const pid = Number(pidRaw)
    if (!Number.isFinite(pid)) continue
    const base = name.toLowerCase()
    out.push({ name: base.endsWith('.exe') ? base : `${base}.exe`, pid })
  }
  return out
}

const WINDOWED_PS_SCRIPT =
  '[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-Process | ' +
  'Where-Object { $_.MainWindowHandle -ne 0 } | ' +
  'Select-Object Name,Id | ConvertTo-Csv -NoTypeInformation'

/** Liste les processus possédant une fenêtre principale (apps visibles). */
export async function listWindowedProcesses(): Promise<Process[]> {
  const { stdout } = await execAsync(
    `powershell.exe -NoProfile -NonInteractive -Command "${WINDOWED_PS_SCRIPT}"`,
    { windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
  )
  return parseWindowedProcessesCsv(stdout)
}
```

- [ ] **Step 4: Run tests + typecheck to verify they pass**

Run: `npm run test -- src/service/blocking/processes/enumerator.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/service/blocking/processes/enumerator.ts src/service/blocking/processes/enumerator.test.ts
git commit -m "feat(blocking): énumérer les processus à fenêtre visible"
```

---

## Task 4: Durcir la safe-list (ne jamais tuer l'UI Nexus)

**Files:**
- Modify: `src/service/blocking/processes/safe-list.ts:5-21`
- Test: `src/service/blocking/processes/safe-list.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/service/blocking/processes/safe-list.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isSafeListed } from './safe-list'

describe('isSafeListed', () => {
  it('protège les processus système (insensible à la casse)', () => {
    expect(isSafeListed('explorer.exe')).toBe(true)
    expect(isSafeListed('SVCHOST.EXE')).toBe(true)
  })
  it("protège l'UI Nexus pour qu'un focus ne la ferme jamais", () => {
    expect(isSafeListed('Nexus.exe')).toBe(true)
    expect(isSafeListed('electron.exe')).toBe(true)
  })
  it('ne protège pas une app ordinaire', () => {
    expect(isSafeListed('chrome.exe')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/service/blocking/processes/safe-list.test.ts`
Expected: FAIL — `Nexus.exe`/`electron.exe` ne sont pas encore safe-listés.

- [ ] **Step 3: Add Nexus UI exes to the safe-list**

In `src/service/blocking/processes/safe-list.ts`, add to the `SYSTEM_SAFE_LIST` set (before the closing `])`):

```ts
  'searchindexer.exe',
  // UI Nexus : un mode focus (liste blanche) ne doit JAMAIS fermer l'app elle-même.
  'nexus.exe',
  'electron.exe',
])
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/service/blocking/processes/safe-list.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/service/blocking/processes/safe-list.ts src/service/blocking/processes/safe-list.test.ts
git commit -m "feat(blocking): safe-list l'UI Nexus pour le mode focus"
```

---

## Task 5: Tueur inversé (liste blanche)

**Files:**
- Modify: `src/service/blocking/processes/killer.ts` (ajout `startAllowlistKiller`)
- Test: `src/service/blocking/processes/killer.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/service/blocking/processes/killer.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { startAllowlistKiller } from './killer'
import type { Process } from './enumerator'

describe('startAllowlistKiller', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('tue les fenêtres non autorisées, épargne autorisées et safe-list', async () => {
    const windows: Process[] = [
      { name: 'chrome.exe', pid: 1 }, // non autorisé → tué
      { name: 'word.exe', pid: 2 }, // autorisé → épargné
      { name: 'explorer.exe', pid: 3 }, // safe-list → épargné
    ]
    const killed: number[] = []
    const h = startAllowlistKiller(['word.exe'], {
      list: async () => windows,
      kill: (pid) => killed.push(pid),
    })
    await vi.advanceTimersByTimeAsync(0) // tick initial
    expect(killed).toEqual([1])
    h.stop()
  })

  it('ne tue rien si la liste autorisée est vide (garde-fou)', async () => {
    const killed: number[] = []
    const h = startAllowlistKiller([], {
      list: async () => [{ name: 'chrome.exe', pid: 1 }],
      kill: (pid) => killed.push(pid),
    })
    await vi.advanceTimersByTimeAsync(2000)
    expect(killed).toEqual([])
    h.stop()
  })

  it("normalise les chemins d'apps réseau en noms d'exe", async () => {
    const killed: number[] = []
    const h = startAllowlistKiller(['C:\\Apps\\Word.exe'], {
      list: async () => [
        { name: 'word.exe', pid: 2 },
        { name: 'chrome.exe', pid: 1 },
      ],
      kill: (pid) => killed.push(pid),
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(killed).toEqual([1])
    h.stop()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/service/blocking/processes/killer.test.ts`
Expected: FAIL — `startAllowlistKiller` n'est pas exporté.

- [ ] **Step 3: Implement the allowlist killer**

In `src/service/blocking/processes/killer.ts`, update the enumerator import to add `listWindowedProcesses` and `Process`, then append the new killer. Import line becomes:

```ts
import { listProcesses, listWindowedProcesses, type Process } from './enumerator'
```

Append at the end of the file:

```ts
/**
 * Tueur « liste blanche » : à chaque tick, n'énumère que les processus à fenêtre
 * visible et ferme ceux qui ne sont PAS autorisés et PAS safe-listés. La portée
 * « fenêtre visible » évite de toucher aux processus système d'arrière-plan.
 * `list`/`kill` sont injectables pour les tests.
 */
export function startAllowlistKiller(
  allowedExeNames: string[],
  opts: {
    intervalMs?: number
    list?: () => Promise<Process[]>
    kill?: (pid: number, exeName: string) => void
  } = {},
): ProcessKillerHandle {
  const allowed = new Set(allowedExeNames.map(normalizeExeName).filter((n) => n.length > 0))
  // Garde-fou : une liste blanche vide ne doit JAMAIS fermer tout l'écran.
  if (allowed.size === 0) return { stop: () => undefined }

  const intervalMs = opts.intervalMs ?? 1000
  const list = opts.list ?? listWindowedProcesses
  const kill = opts.kill ?? killPid

  const tick = async (): Promise<void> => {
    const processes = await list()
    for (const process of processes) {
      const name = process.name.toLowerCase()
      if (allowed.has(name)) continue
      if (isSafeListed(name)) continue
      kill(process.pid, process.name)
    }
  }

  const id = setInterval(() => {
    tick().catch((err) => log.error('[blocking] allowlist killer tick failed', err))
  }, intervalMs)
  void tick().catch((err) => log.error('[blocking] allowlist killer initial tick failed', err))

  return { stop: () => clearInterval(id) }
}
```

- [ ] **Step 4: Run tests + typecheck to verify they pass**

Run: `npm run test -- src/service/blocking/processes/killer.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/service/blocking/processes/killer.ts src/service/blocking/processes/killer.test.ts
git commit -m "feat(blocking): tueur de processus inversé pour la liste blanche"
```

---

## Task 6: Brancher le `mode` dans le SessionManager

**Files:**
- Modify: `src/service/blocking/session/manager.ts:9-13` (type `ProcessAdapter`), `:80-147` (`startSession`), `:250-283` (`hydrateFromDisk`)
- Modify: `src/service/blocking/session/manager.test.ts` (assertion signature + tests allowlist)

- [ ] **Step 1: Write the failing tests**

In `src/service/blocking/session/manager.test.ts`:

(a) Update the existing assertion in `'start happy path applies all 3 layers atomically'`:

```ts
    expect(a.processes.start).toHaveBeenCalledWith({ mode: 'blocklist', names: ['notepad.exe'] })
```

(b) Add an allowlist fixture after the `PROFILE` const:

```ts
const ALLOW_PROFILE: BlockingProfile = {
  ...PROFILE,
  id: '33333333-3333-4333-8333-333333333333',
  mode: 'allowlist',
  blockedProcesses: ['word.exe'],
  blockedNetworkApps: ['C:\\Apps\\slack.exe'],
}
```

(c) Add two tests inside the `describe('SessionManager', ...)` block:

```ts
  it('allowlist : tueur inversé, sans hosts ni pare-feu', async () => {
    const a = makeAdapters()
    a.persistence.readState = vi.fn().mockResolvedValue({
      profiles: [ALLOW_PROFILE],
      history: [],
      nextSessionPenaltyMinutes: 0,
    })
    const m = createSessionManager(a)
    await m.startSession({ profileId: ALLOW_PROFILE.id, durationMinutes: 60 })
    expect(a.processes.start).toHaveBeenCalledWith({
      mode: 'allowlist',
      names: ['word.exe', 'slack.exe'],
    })
    expect(a.hosts.apply).not.toHaveBeenCalled()
    expect(a.firewall.applyAll).not.toHaveBeenCalled()
    expect(m.getPhase()).toBe('active')
  })

  it('allowlist : refuse de démarrer sans app autorisée', async () => {
    const a = makeAdapters()
    a.persistence.readState = vi.fn().mockResolvedValue({
      profiles: [{ ...ALLOW_PROFILE, blockedProcesses: [], blockedNetworkApps: [] }],
      history: [],
      nextSessionPenaltyMinutes: 0,
    })
    const m = createSessionManager(a)
    await expect(
      m.startSession({ profileId: ALLOW_PROFILE.id, durationMinutes: 60 }),
    ).rejects.toThrow(/liste blanche/i)
    expect(m.getPhase()).toBe('idle')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/service/blocking/session/manager.test.ts`
Expected: FAIL — l'ancienne signature `start(['notepad.exe'])` ne correspond plus / le branchement allowlist n'existe pas.

- [ ] **Step 3: Change the `ProcessAdapter` type**

In `src/service/blocking/session/manager.ts`, replace:

```ts
export type ProcessAdapter = {
  start: (forbidden: string[]) => { stop: () => void }
}
```

with:

```ts
export type ProcessAdapter = {
  start: (args: { mode: 'blocklist' | 'allowlist'; names: string[] }) => { stop: () => void }
}
```

- [ ] **Step 4: Add the allowlist helper + import**

At the top of `manager.ts`, extend the schema import and add the exe-name import:

```ts
import type { ActiveSession, BlockingProfile, BlockingState } from '@shared/schemas'
import type { BlockingHistoryEntry } from '@shared/schemas'
import { normalizeExeName } from '../processes/exe-name'
```

Add this pure helper near the top of the file (after the imports, before `createSessionManager`):

```ts
/** Ensemble des noms d'exe autorisés d'un profil liste blanche. */
function allowlistNames(profile: BlockingProfile): string[] {
  const fromNetwork = profile.blockedNetworkApps.map((p) => normalizeExeName(p))
  return [...profile.blockedProcesses, ...fromNetwork].filter((n) => n.length > 0)
}
```

- [ ] **Step 5: Branch `startSession` on `mode`**

In `startSession`, just after the profile lookup, add the empty-allowlist guard:

```ts
    const profile = state.profiles.find((p) => p.id === profileId)
    if (!profile) throw new Error(`Profile not found: ${profileId}`)
    if (profile.mode === 'allowlist' && allowlistNames(profile).length === 0) {
      throw new Error('Liste blanche vide : ajoute au moins une app autorisée avant de démarrer.')
    }
```

Then replace the body of the `try { ... }` that applies the layers (the block that starts with `await adapters.persistence.writeActive(session)` and ends just before `return session`) with:

```ts
      await adapters.persistence.writeActive(session)
      if (profile.mode === 'allowlist') {
        watcherHandle = adapters.processes.start({
          mode: 'allowlist',
          names: allowlistNames(profile),
        })
        watcherStarted = true
        // Phase 1 : pas de hosts ni de pare-feu en liste blanche (sites = Phase 2).
        session.appliedFirewallRules = []
      } else {
        await adapters.hosts.apply({ sessionId: id, startedAt, domains: profile.blockedSites })
        hostsApplied = true
        await adapters.hosts.flushDns()
        watcherHandle = adapters.processes.start({
          mode: 'blocklist',
          names: profile.blockedProcesses,
        })
        watcherStarted = true
        const ruleNames = await adapters.firewall.applyAll(id, profile.blockedNetworkApps)
        session.appliedFirewallRules = ruleNames
      }
      await adapters.persistence.writeActive(session)
      active = session
      phase = 'active'
      scheduleEndTimer()
      emit()
      return session
```

(The `catch` rollback block below stays unchanged: `hostsApplied`/`watcherStarted` remain false in the allowlist path that errors, and `firewall.removeAll()` is a no-op when nothing was applied.)

- [ ] **Step 6: Branch `hydrateFromDisk` on `mode`**

In `hydrateFromDisk`, replace the block that re-applies layers for a live session (from `await adapters.hosts.apply({ sessionId: existing.id, ...})` through `existing.appliedFirewallRules = ruleNames`) with:

```ts
    if (existing.profileSnapshot.mode === 'allowlist') {
      watcherHandle = adapters.processes.start({
        mode: 'allowlist',
        names: allowlistNames(existing.profileSnapshot),
      })
      existing.appliedFirewallRules = []
    } else {
      await adapters.hosts.apply({
        sessionId: existing.id,
        startedAt: existing.startedAt,
        domains: existing.profileSnapshot.blockedSites,
      })
      await adapters.hosts.flushDns()
      watcherHandle = adapters.processes.start({
        mode: 'blocklist',
        names: existing.profileSnapshot.blockedProcesses,
      })
      const ruleNames = await adapters.firewall.applyAll(
        existing.id,
        existing.profileSnapshot.blockedNetworkApps,
      )
      await adapters.firewall.removeOrphansExcept(ruleNames)
      existing.appliedFirewallRules = ruleNames
    }
```

- [ ] **Step 7: Run tests + typecheck to verify they pass**

Run: `npm run test -- src/service/blocking/session/manager.test.ts && npm run typecheck`
Expected: PASS. (Typecheck will now flag `blocking-adapters.ts` because `createProcessControl.start` still uses the old signature — that is fixed in Task 7. If you run the full `npm run typecheck` now it may fail there; that's expected and resolved next.)

- [ ] **Step 8: Commit**

```bash
git add src/service/blocking/session/manager.ts src/service/blocking/session/manager.test.ts
git commit -m "feat(blocking): brancher le mode liste blanche dans le SessionManager"
```

---

## Task 7: Router `createProcessControl` selon le mode

**Files:**
- Modify: `src/service/blocking-adapters.ts:25-81` (`createProcessControl`)

- [ ] **Step 1: Update `start` to the new signature + allowlist routing**

In `src/service/blocking-adapters.ts`, add the import:

```ts
import { startProcessKiller, startAllowlistKiller } from './blocking/processes/killer'
```

Replace the whole `start(forbidden) { ... }` method of `createProcessControl` with:

```ts
    start(args) {
      const { mode, names } = args
      if (names.length === 0) {
        status = 'inactive'
        return { stop: () => undefined }
      }
      if (mode === 'allowlist') {
        // Liste blanche : on court-circuite AppLocker (default-deny AppLocker est
        // trop risqué) et on s'appuie sur le tueur de fenêtres inversé.
        status = 'ok'
        const killer = startAllowlistKiller(names)
        return {
          stop: () => {
            killer.stop()
            status = 'inactive'
          },
        }
      }
      const strategy = pickBlockingStrategy({
        elevated: cfg.elevated,
        strictBlocking,
        edition: cfg.edition,
      })
      if (strategy.processLayer !== 'applocker') {
        status = 'ok'
        log.warn('[blocking] AppLocker indisponible, repli sur process kill', strategy.reason)
        const killer = startProcessKiller(names)
        return {
          stop: () => {
            killer.stop()
            status = 'inactive'
          },
        }
      }
      const appLocker = startAppLockerBlocker(names, strategy.appLockerMode)
      if (appLocker.applied) {
        status = 'ok'
        return {
          stop: () => {
            appLocker.stop()
            status = 'inactive'
          },
        }
      }
      status = 'error'
      log.warn('[blocking] AppLocker indisponible', appLocker.error)
      const killer = startProcessKiller(names)
      return {
        stop: () => {
          killer.stop()
          status = 'inactive'
        },
      }
    },
```

(Note: the existing `import { startProcessKiller } from './blocking/processes/killer'` line at the top is replaced by the combined import above — make sure there's only one import from that module.)

- [ ] **Step 2: Verify typecheck + full test suite**

Run: `npm run typecheck && npm run test`
Expected: PASS — the `ProcessAdapter` signature now matches across `manager.ts` and `blocking-adapters.ts`.

> No dedicated unit test: `createProcessControl` is an OS-coupled router (AppLocker / netsh / taskkill) and has no existing test in the repo. Its allowlist branch delegates to `startAllowlistKiller`, which IS unit-tested (Task 5). The router itself is covered by typecheck here and the manual smoke test in Task 11.

- [ ] **Step 3: Commit**

```bash
git add src/service/blocking-adapters.ts
git commit -m "feat(blocking): router process control vers le tueur inversé en allowlist"
```

---

## Task 8: `blocking-host` — save + statut des couches en allowlist

**Files:**
- Modify: `src/service/blocking-host.ts:179-197` (`saveProfile`), `:241-269` (`getLayerStatus`)
- Modify: `src/service/blocking-host.test.ts` (tests allowlist)

- [ ] **Step 1: Write the failing tests**

In `src/service/blocking-host.test.ts`, add a shared id near the top (after the `PROFILE` const):

```ts
const ALLOW_ID = '33333333-3333-4333-8333-333333333333'
```

Add two tests inside `describe('createBlockingHost', ...)`:

```ts
  it('saveProfile autorise un process safe-listé en mode liste blanche', async () => {
    const host = createBlockingHost(makeDeps())
    const saved = await host.saveProfile({
      name: 'Focus',
      mode: 'allowlist',
      blockedSites: [],
      blockedProcesses: ['explorer.exe'],
      blockedNetworkApps: [],
      unlockPolicy: { type: 'none' },
    })
    expect(saved.mode).toBe('allowlist')
  })

  it('getLayerStatus : liste blanche → hosts et firewall inactifs', async () => {
    const deps = makeDeps()
    deps.processes.status = vi.fn().mockReturnValue('ok')
    deps.persistence.readState = vi.fn().mockResolvedValue({
      profiles: [{ ...PROFILE, id: ALLOW_ID, mode: 'allowlist', blockedProcesses: ['word.exe'] }],
      history: [],
      nextSessionPenaltyMinutes: 0,
    })
    const host = createBlockingHost(deps)
    await host.startSession({
      profileId: ALLOW_ID,
      durationMinutes: 60,
      sessionRulesEnabled: false,
      strictBlocking: true,
    })
    expect(await host.getLayerStatus()).toEqual({
      hosts: 'inactive',
      processes: 'ok',
      firewall: 'inactive',
    })
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/service/blocking-host.test.ts`
Expected: FAIL — `saveProfile` refuse encore `explorer.exe` même en allowlist ; `getLayerStatus` renvoie `drifted`/`ok` pour hosts.

- [ ] **Step 3: Guard the safe-list check by mode in `saveProfile`**

In `src/service/blocking-host.ts`, replace:

```ts
      const profile = BlockingProfileSchema.parse(merged)
      for (const exeName of profile.blockedProcesses) {
        if (isSafeListed(exeName)) {
          throw new Error(`System process refused: ${exeName}`)
        }
      }
```

with:

```ts
      const profile = BlockingProfileSchema.parse(merged)
      // En liste blanche, blockedProcesses = apps AUTORISÉES : autoriser un
      // process safe-listé est inoffensif (il n'est jamais tué). Le refus ne
      // vaut que pour la liste noire (où l'utilisateur tenterait de tuer le système).
      if (profile.mode === 'blocklist') {
        for (const exeName of profile.blockedProcesses) {
          if (isSafeListed(exeName)) {
            throw new Error(`System process refused: ${exeName}`)
          }
        }
      }
```

- [ ] **Step 4: Short-circuit `getLayerStatus` in allowlist**

In `getLayerStatus`, just after the `if (!active) return { ...INACTIVE_LAYERS }` line, add:

```ts
      const active = manager.getActive()
      if (!active) return { ...INACTIVE_LAYERS }
      if (active.profileSnapshot.mode === 'allowlist') {
        // Phase 1 : seule la couche process agit en liste blanche.
        return { hosts: 'inactive', processes: processes.status(), firewall: 'inactive' }
      }
```

- [ ] **Step 5: Run tests + typecheck to verify they pass**

Run: `npm run test -- src/service/blocking-host.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/service/blocking-host.ts src/service/blocking-host.test.ts
git commit -m "feat(blocking): save + statut des couches adaptés à la liste blanche"
```

---

## Task 9: Détecteur de dérive — sortie anticipée en allowlist

**Files:**
- Modify: `src/service/blocking/session/drift-detector.ts:26-29`

- [ ] **Step 1: Add the guard**

En liste blanche, aucune couche hosts/pare-feu n'est posée. Sans garde, le détecteur écrirait les sites **autorisés** dans le fichier hosts comme des **blocages** (bug actif). In `src/service/blocking/session/drift-detector.ts`, replace:

```ts
      timer = setInterval(async () => {
        const active = getActive()
        if (!active) return
        try {
```

with:

```ts
      timer = setInterval(async () => {
        const active = getActive()
        if (!active) return
        // Liste blanche (Phase 1) : ni hosts ni pare-feu posés → rien à surveiller,
        // et surtout ne PAS réécrire les sites autorisés comme des blocages.
        if (active.profileSnapshot.mode === 'allowlist') return
        try {
```

- [ ] **Step 2: Verify typecheck + full suite**

Run: `npm run typecheck && npm run test`
Expected: PASS.

> No dedicated unit test: `createDriftDetector` runs on a real `setInterval` and reads the real hosts file / netsh (no injection, no existing test). The guard is a one-line early return; correctness is verified by code review + the fact that allowlist sessions never write hosts/firewall (Tasks 6, 8). It is exercised end-to-end by the manual smoke test (Task 11).

- [ ] **Step 3: Commit**

```bash
git add src/service/blocking/session/drift-detector.ts
git commit -m "fix(blocking): le détecteur de dérive ignore les sessions liste blanche"
```

---

## Task 10: UI — interrupteur de mode dans l'éditeur de profil

**Files:**
- Modify: `src/renderer/src/components/blocking/ProfileEditor.tsx`

- [ ] **Step 1: Add mode state + initialisation**

In `ProfileEditor.tsx`, add a state hook alongside the others (after `const [policyType, ...]`):

```ts
  const [mode, setMode] = useState<BlockingProfile['mode']>('blocklist')
```

In the `useEffect` that resets the form, set `mode` in both branches:

```ts
    if (initial) {
      setName(initial.name)
      setMode(initial.mode)
      // ...rest unchanged
    } else {
      setName('')
      setMode('blocklist')
      // ...rest unchanged
    }
```

- [ ] **Step 2: Include `mode` in the saved draft**

In `handleSave`, add `mode` to the `onSave({ ... })` object:

```ts
      await onSave({
        ...(initial?.id ? { id: initial.id } : {}),
        ...(initial?.createdAt ? { createdAt: initial.createdAt } : {}),
        name: name.trim(),
        mode,
        blockedSites: splitDomains(sites),
        blockedProcesses: splitExeNames(procs),
        blockedNetworkApps: splitExePaths(apps),
        unlockPolicy: policy,
      })
```

- [ ] **Step 3: Add the mode toggle + dynamic labels**

Add a derived count and labels above the `return`:

```ts
  const allowedAppCount = splitLines(procs).length + splitLines(apps).length
  const isAllow = mode === 'allowlist'
```

Insert the toggle right after the `Nom` field's closing `</Field>` (before the `Sites` field):

```tsx
              <Field
                label="Mode"
                hint={
                  isAllow
                    ? "Liste blanche : seules les apps choisies restent ouvertes, tout le reste est fermé."
                    : 'Liste noire : les sites/apps listés sont bloqués, le reste reste autorisé.'
                }
              >
                <div className="flex gap-2">
                  <ModeButton selected={!isAllow} onClick={() => setMode('blocklist')} label="Liste noire" />
                  <ModeButton selected={isAllow} onClick={() => setMode('allowlist')} label="Liste blanche" />
                </div>
              </Field>
```

Update the three field labels/hints to depend on `isAllow`:

```tsx
              <Field
                label={isAllow ? 'Sites autorisés' : 'Sites bloqués'}
                hint={
                  isAllow
                    ? 'Un domaine par ligne. Filtrage des sites bientôt (Phase 2) — sans effet pour l’instant.'
                    : 'Un domaine par ligne. Ex : facebook.com, twitter.com'
                }
              >
```

```tsx
              <Field
                label={isAllow ? 'Apps autorisées (processus)' : 'Apps bloquées (processus)'}
                hint="Un nom .exe par ligne. Utilise le scanner pour éviter les noms invalides."
              >
```

```tsx
              <Field label={isAllow ? 'Apps réseau autorisées' : 'Apps réseau (par chemin)'} hint="Chemin .exe complet, un par ligne">
```

- [ ] **Step 4: Guard empty allowlist on the save button**

Update the save button's `disabled` and add a warning. Replace the save `<button>`'s `disabled`/className expressions to include the empty-allowlist case:

```tsx
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={busy || !name.trim() || (isAllow && allowedAppCount === 0)}
                  className={cn(
                    'rounded-md px-4 py-2 text-sm font-medium transition-colors',
                    busy || !name.trim() || (isAllow && allowedAppCount === 0)
                      ? 'cursor-not-allowed bg-bg-card text-text-muted'
                      : 'bg-accent text-white hover:bg-accent-hover',
                  )}
                >
                  {busy ? 'Sauvegarde...' : 'Sauvegarder'}
                </button>
```

Add a hint just above the `{error && ...}` block:

```tsx
              {isAllow && allowedAppCount === 0 && (
                <div className="mt-4 rounded-md border border-orange/40 bg-orange/10 px-3 py-2 text-xs text-orange">
                  Ajoute au moins une app autorisée : une liste blanche vide fermerait tout.
                </div>
              )}
```

- [ ] **Step 5: Add the `ModeButton` component**

At the bottom of the file (next to `RadioRow`), add:

```tsx
function ModeButton({
  selected,
  onClick,
  label,
}: {
  selected: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors duration-200',
        selected
          ? 'border-accent bg-accent/10 text-text-primary'
          : 'border-border-subtle bg-bg-base text-text-secondary hover:border-border-strong',
      )}
    >
      {label}
    </button>
  )
}
```

- [ ] **Step 6: Verify typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 7: Manual smoke test (UI has no component tests)**

Run: `npm run dev`
- Ouvre Blocage → Nouveau profile.
- Bascule sur « Liste blanche » : les libellés passent en « autorisés », la note Phase 2 apparaît sous Sites.
- Sans app autorisée : le bouton Sauvegarder est désactivé + l'avertissement orange s'affiche.
- Ajoute une app (ex. via le scanner) → Sauvegarder s'active. Sauvegarde, rouvre le profil : le mode « Liste blanche » est conservé.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/components/blocking/ProfileEditor.tsx
git commit -m "feat(blocking): interrupteur liste noire/blanche dans l'éditeur de profil"
```

---

## Task 11: UI — badge focus sur la session active + smoke test end-to-end

**Files:**
- Modify: `src/renderer/src/components/blocking/ActiveSessionCard.tsx:42-52`

- [ ] **Step 1: Show allowlist info on the active card**

In `ActiveSessionCard.tsx`, compute a flag before the `return`:

```ts
  const isAllow = session.profileSnapshot.mode === 'allowlist'
  const allowedCount =
    session.profileSnapshot.blockedProcesses.length +
    session.profileSnapshot.blockedNetworkApps.length
```

Replace the counts row (the `<div className="mt-2 flex items-center gap-4 ...">` block) with a conditional:

```tsx
            {isAllow ? (
              <div className="mt-2 flex items-center gap-2 text-sm text-text-secondary">
                <span className="rounded-md border border-accent/40 bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                  Focus · liste blanche
                </span>
                <span className="flex items-center gap-1.5">
                  <Cpu size={13} /> {allowedCount} apps autorisées
                </span>
              </div>
            ) : (
              <div className="mt-2 flex items-center gap-4 text-sm text-text-secondary">
                <span className="flex items-center gap-1.5">
                  <Globe size={13} /> {session.profileSnapshot.blockedSites.length} sites
                </span>
                <span className="flex items-center gap-1.5">
                  <Cpu size={13} /> {session.profileSnapshot.blockedProcesses.length} apps
                </span>
                <span className="flex items-center gap-1.5">
                  <Wifi size={13} /> {session.profileSnapshot.blockedNetworkApps.length} net
                </span>
              </div>
            )}
```

- [ ] **Step 2: Verify typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 3: Manual end-to-end smoke test (requires the installed service + admin)**

> Ce test valide le cœur du comportement. À faire sur une vraie machine Windows avec le service Nexus installé et joignable.

Run: `npm run dev` (ou l'installeur si tu testes le service packagé)
1. Crée un profil « Liste blanche » autorisant uniquement, par ex., `notepad.exe`.
2. Ouvre une autre app à fenêtre (ex. l'app Calculatrice) AVANT de démarrer.
3. Démarre une session courte (10 min) sur ce profil.
4. Vérifie : Notepad reste ouvert ; la Calculatrice (et toute autre app à fenêtre non autorisée) est fermée et le reste ; l'UI Nexus et l'explorateur ne sont jamais fermés.
5. Vérifie la carte de session : badge « Focus · liste blanche », pastilles hosts/firewall en `inactive`, processes en `ok`.
6. Arrête la session (politique d'arrêt) → plus aucune fermeture forcée ; les apps peuvent rouvrir.
7. Bonus : pendant la session, vérifie que le fichier hosts ne contient PAS de bloc Nexus (le détecteur de dérive ne doit rien écrire en liste blanche).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/blocking/ActiveSessionCard.tsx
git commit -m "feat(blocking): carte de session affiche le mode focus liste blanche"
```

---

## Couverture du spec (self-review)

- §4 modèle `mode` → Task 1.
- §5.1 énumération fenêtres → Task 3.
- §5.2 tueur inversé → Task 5.
- §5.3 safe-list durcie → Task 4.
- §5.4 adapter conscient du mode + manager (pas de hosts/pare-feu, bypass AppLocker) → Tasks 6, 7.
- §6 garde liste vide + safe-list → Task 6 (garde), Task 8 (save), Task 4.
- §7 UI éditeur + carte session → Tasks 10, 11.
- §8 tests → Tasks 1–8 (unitaires) ; UI + glue OS → typecheck + smoke tests (Tasks 7, 9, 10, 11), faute d'infra de test côté renderer / OS, conformément à l'existant.
- Correctness hors-spec mais nécessaire : détecteur de dérive (Task 9), `getLayerStatus` (Task 8).

## Hors périmètre (Phase 2, spec séparée)

- Filtrage « tout refuser sauf X » des **sites** via résolveur DNS local default-deny.
- Antivirus additionnels dans la safe-list (à figer selon retours terrain).
