# Couche 3 — Blocage piloté par le service : plan d'implémentation

> Reference spec : `docs/superpowers/specs/2026-05-18-nexus-service-driven-blocking-design.md`
> Préreq : Couche 2 mergée + bug 1 P16 corrigé (sinon le smoke test bout-en-bout
> est impossible — mais le code peut être écrit en attendant).

**Goal :** Le service Windows démarre automatiquement les sessions de blocage
quand un bloc planifié arrive. Le plan est poussé par le renderer et persisté
sur disque pour survivre aux reboots.

**Branche suggérée :** `nexus-service-driven-blocking` depuis `master`.

---

## Fichiers

**Créer :**
- `src/service/blocking-scheduler.ts` (+ `.test.ts`)
- `src/renderer/src/lib/use-plan-push.ts`

**Modifier :**
- `src/shared/service-protocol.ts`
- `src/shared/ipc-channels.ts`
- `src/service/blocking-host.ts`
- `src/main/blocking/ipc/blocking.handlers.ts`
- `src/preload/index.ts`
- `src/renderer/src/lib/ipc.ts`
- Composant racine (Layout.tsx ou App.tsx)
- `src/main/notifications.ts` (étendre `notifySessionStart` si besoin)

---

## Task 1 : `PushedBlock` + commande `PUSH_PLAN`

**Step 1 — `src/shared/service-protocol.ts`.** Ajouter le type et la commande :

```ts
import type { UnlockPolicy } from './schemas'

export type PushedBlock = {
  id: string                   // id du bloc (re-utilise l'id du placement engine)
  date: string                  // YYYY-MM-DD
  startMinute: number           // 0..1439
  endMinute: number             // 1..1440
  refKind: 'task' | 'objective'
  refId: string                 // id de l'item source (pour les logs)
  label: string                 // affiché en notif (« Maths »)
  blockedSites: string[]
  blockedProcesses: string[]
  blockedNetworkApps: string[]
  unlockPolicy: UnlockPolicy
}

// Dans la union des commandes :
// | { type: 'PUSH_PLAN'; payload: { blocks: PushedBlock[]; pushedAt: string } }
```

**Step 2 — `src/shared/ipc-channels.ts`.** Ajouter dans `IPC_CHANNELS` :
```ts
  BLOCKING_PUSH_PLAN: 'blocking:pushPlan',
```

**Step 3 — Verify + commit.**
```bash
git add src/shared/service-protocol.ts src/shared/ipc-channels.ts
git commit -m "feat(auto-block): commande PUSH_PLAN du protocole service"
```

---

## Task 2 : Scheduler pur (TDD)

**Step 1 — Test.** Créer `src/service/blocking-scheduler.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { findActiveBlock } from './blocking-scheduler'
import type { PushedBlock } from '@shared/service-protocol'

const sampleUnlock = { type: 'none' as const }
function pb(over: Partial<PushedBlock> & { id: string }): PushedBlock {
  return {
    id: over.id,
    date: over.date ?? '2026-05-18',
    startMinute: over.startMinute ?? 0,
    endMinute: over.endMinute ?? 60,
    refKind: over.refKind ?? 'task',
    refId: over.refId ?? 'r',
    label: over.label ?? 'Bloc',
    blockedSites: [],
    blockedProcesses: [],
    blockedNetworkApps: [],
    unlockPolicy: sampleUnlock,
  }
}

describe('findActiveBlock', () => {
  const blocks = [
    pb({ id: '1', date: '2026-05-18', startMinute: 480, endMinute: 540 }), // 8h-9h
    pb({ id: '2', date: '2026-05-18', startMinute: 600, endMinute: 660 }), // 10h-11h
  ]

  it('trouve le bloc actif au milieu', () => {
    expect(findActiveBlock(blocks, '2026-05-18', 510)?.id).toBe('1')
  })

  it('null entre deux blocs', () => {
    expect(findActiveBlock(blocks, '2026-05-18', 570)).toBeNull()
  })

  it('null pour un autre jour', () => {
    expect(findActiveBlock(blocks, '2026-05-19', 510)).toBeNull()
  })

  it('bornes : début inclusif, fin exclusive', () => {
    expect(findActiveBlock(blocks, '2026-05-18', 480)?.id).toBe('1')
    expect(findActiveBlock(blocks, '2026-05-18', 540)).toBeNull()
  })
})
```

**Step 2 — Run, expect FAIL.**

**Step 3 — Implémenter `src/service/blocking-scheduler.ts`.**

```ts
import type { PushedBlock } from '@shared/service-protocol'

/** Bloc actif à `(date, minuteOfDay)` (début inclusif, fin exclusive), ou null. */
export function findActiveBlock(
  blocks: PushedBlock[],
  date: string,
  minuteOfDay: number,
): PushedBlock | null {
  for (const b of blocks) {
    if (b.date !== date) continue
    if (minuteOfDay >= b.startMinute && minuteOfDay < b.endMinute) return b
  }
  return null
}
```

**Step 4 — Run, expect PASS** (4 tests).

**Step 5 — Commit.**
```bash
git add src/service/blocking-scheduler.ts src/service/blocking-scheduler.test.ts
git commit -m "feat(auto-block): scheduler service — findActiveBlock"
```

---

## Task 3 : Handler `PUSH_PLAN` + persistance disque + tick scheduler

**Step 1 — Étendre `src/service/blocking-host.ts`.**

En haut :
```ts
import { findActiveBlock } from './blocking-scheduler'
import type { PushedBlock } from '@shared/service-protocol'
import { join } from 'node:path'
import { promises as fs } from 'node:fs'
import { serviceDataDir } from './data-dir'

const PLAN_FILE = join(serviceDataDir(), 'nexus_plan.json')

type PersistedPlan = { pushedAt: string; blocks: PushedBlock[] }
```

Dans le state du host (à côté des autres `let`) :
```ts
let pushedPlan: PushedBlock[] = []
const triggeredBlockIds = new Set<string>()
let schedulerTickHandle: NodeJS.Timeout | null = null
```

Charger le plan persisté au démarrage du host. Dans la fonction d'init (à
localiser : c'est celle qui s'exécute au boot du service), avant le premier
tick :
```ts
try {
  const raw = await fs.readFile(PLAN_FILE, 'utf8')
  const parsed = JSON.parse(raw) as PersistedPlan
  if (Array.isArray(parsed?.blocks)) {
    pushedPlan = parsed.blocks
  }
} catch {
  // Pas de plan persisté ou fichier invalide : démarre vide.
  pushedPlan = []
}
```

Handler du push :
```ts
async function handlePushPlan(payload: { blocks: PushedBlock[]; pushedAt: string }): Promise<void> {
  pushedPlan = payload.blocks
  try {
    await fs.writeFile(PLAN_FILE, JSON.stringify({ pushedAt: payload.pushedAt, blocks: payload.blocks }, null, 2), 'utf8')
  } catch (err) {
    log.warn('[scheduler] persistance du plan échouée', err)
  }
}
```

Helper du tick :
```ts
function nowAsDateAndMinute(): { date: string; minuteOfDay: number } {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return { date: `${y}-${m}-${day}`, minuteOfDay: d.getHours() * 60 + d.getMinutes() }
}

function schedulerTick(): void {
  if (isSessionActive()) return  // pas d'écrasement d'une session
  const { date, minuteOfDay } = nowAsDateAndMinute()
  const block = findActiveBlock(pushedPlan, date, minuteOfDay)
  if (!block || triggeredBlockIds.has(block.id)) return

  // Construire un BlockingProfile éphémère depuis le payload résolu.
  const ephemeralProfile = {
    id: `auto-${block.id}`,
    name: `Auto: ${block.label}`,
    blockedSites: block.blockedSites,
    blockedProcesses: block.blockedProcesses,
    blockedNetworkApps: block.blockedNetworkApps,
    unlockPolicy: block.unlockPolicy,
    createdAt: new Date().toISOString(),
  }
  const durationMinutes = block.endMinute - minuteOfDay

  // Réutiliser la fonction de démarrage de session existante.
  // Codex : localiser la fonction interne appelée par 'START_SESSION' du host
  // et l'invoquer ici. Cette fonction doit déclencher l'événement
  // SESSION_CHANGED qui est relayé au main → notification natif.
  startSessionInternal(ephemeralProfile, durationMinutes, {
    sessionRulesEnabled: true,
    strictBlocking: true,
    autoTrigger: true,  // flag pour distinguer dans les logs / notifs
  })
  triggeredBlockIds.add(block.id)
}
```

Démarrer le tick au boot du host, et l'arrêter au teardown :
```ts
schedulerTickHandle = setInterval(schedulerTick, 15_000)
// teardown : if (schedulerTickHandle) clearInterval(schedulerTickHandle)
```

Brancher le handler dans le routeur de commandes du host (`switch (command.type)`) :
```ts
case 'PUSH_PLAN':
  await handlePushPlan(command.payload as { blocks: PushedBlock[]; pushedAt: string })
  return { ok: true }
```

**Step 2 — Verify** : `npm run typecheck && npm run lint && npm run test`. Les
tests du service existants restent verts (le tick est lancé au boot ; en mode
test il faut le mock ou skip).

**Step 3 — Commit.**
```bash
git add src/service/blocking-host.ts
git commit -m "feat(auto-block): PUSH_PLAN + persistance disque + tick scheduler"
```

---

## Task 4 : Relais IPC main + notification

**Step 1 — `src/main/blocking/ipc/blocking.handlers.ts`.** Ajouter :
```ts
ipcMain.handle(IPC_CHANNELS.BLOCKING_PUSH_PLAN, (_e, payload: unknown) =>
  client.request('PUSH_PLAN', payload),
)
```

**Step 2 — Notification au démarrage auto.** Dans le `handleServiceEvent` du
même fichier, étendre le cas `'SESSION_CHANGED'` pour déclencher
`notifySessionStart` si la session vient juste de commencer (state passe de
null à non-null). Le payload du service doit indiquer si c'est une session
auto (champ `autoTrigger` propagé via le profile name ou un événement
dédié). Pour distinguer manuel vs auto, le plus simple : si le profile name
commence par `Auto:`, c'est auto.

```ts
case 'SESSION_CHANGED': {
  const previousActive = sessionActive
  sessionActive = event.payload !== null
  win?.webContents.send(IPC_CHANNELS.BLOCKING_EVENT_SESSION_CHANGED, event.payload)
  // Notification à la transition null → active (auto-trigger).
  if (!previousActive && sessionActive && event.payload) {
    const session = event.payload as ActiveSession
    if (session.profileSnapshot.name.startsWith('Auto: ')) {
      const label = session.profileSnapshot.name.replace('Auto: ', '')
      const durationMin = session.durationMinutes ?? 60
      notifySessionStart(label, durationMin, getMainWindow)
    }
  }
  return
}
```

(Note : `SESSION_ENDED` envoie déjà `notifySessionEnd` via `handleSessionEnded`
— rien à changer pour la notif de fin.)

**Step 3 — Verify + commit.**
```bash
git add src/main/blocking/ipc/blocking.handlers.ts
git commit -m "feat(auto-block): relais IPC + notification au démarrage auto"
```

---

## Task 5 : Préload + IPC renderer

**Step 1 — `src/preload/index.ts`.** Ajouter dans l'objet `blocking` exposé :
```ts
import type { PushedBlock } from '@shared/service-protocol'
// ...
pushPlan: (blocks: PushedBlock[]) =>
  ipcRenderer.invoke(IPC_CHANNELS.BLOCKING_PUSH_PLAN, { blocks, pushedAt: new Date().toISOString() }),
```

**Step 2 — `src/renderer/src/lib/ipc.ts`.** Typer la méthode dans l'interface
de `nexus.blocking` (suivre le pattern des autres méthodes).

**Step 3 — Verify + commit.**
```bash
git add src/preload/index.ts src/renderer/src/lib/ipc.ts
git commit -m "feat(auto-block): expose pushPlan au renderer"
```

---

## Task 6 : Hook `usePlanPush`

**Step 1 — Créer `src/renderer/src/lib/use-plan-push.ts`.**

```ts
import { useEffect, useRef } from 'react'
import { useTasksStore } from '@/store/tasks.store'
import { useLevelsStore } from '@/store/levels.store'
import { useRegistryStore } from '@/store/registry.store'
import { usePlacement } from './use-placement'
import { resolveBlockingForBlock } from './blocking-resolver'
import { nexus } from './ipc'
import type { PushedBlock } from '@shared/service-protocol'

/**
 * Pousse le plan résolu au service à chaque changement. Le plan = les 24
 * prochaines heures, avec distractions et unlockPolicy résolues. Debouncé à
 * 1×/min et dédupliqué par hash : un même plan re-envoyé est ignoré (le
 * service détecte aussi mais on évite le pipe).
 */
export function usePlanPush(now: Date, rangeEndStr: string): void {
  const { blocks } = usePlacement(now, rangeEndStr)
  const tasks = useTasksStore((s) => s.tasks)
  const objectives = useLevelsStore((s) => s.objectives)
  const registry = useRegistryStore((s) => s.items)
  const lastPushAtRef = useRef(0)
  const lastHashRef = useRef('')

  useEffect(() => {
    const resolved: PushedBlock[] = []
    for (const b of blocks) {
      if (b.kind === 'free' || !b.refId) continue
      const payload = resolveBlockingForBlock(b, registry, objectives, tasks)
      if (!payload) continue
      resolved.push({
        id: b.id,
        date: b.date,
        startMinute: b.startMinute,
        endMinute: b.endMinute,
        refKind: b.kind,
        refId: b.refId,
        label: payload.label,
        blockedSites: payload.blockedSites,
        blockedProcesses: payload.blockedProcesses,
        blockedNetworkApps: payload.blockedNetworkApps,
        unlockPolicy: payload.unlockPolicy,
      })
    }
    const hash = JSON.stringify(resolved)
    if (hash === lastHashRef.current) return  // pas de changement
    const sinceLast = Date.now() - lastPushAtRef.current
    if (sinceLast < 60_000 && lastPushAtRef.current > 0) return  // debounce 1×/min
    lastPushAtRef.current = Date.now()
    lastHashRef.current = hash
    void nexus.blocking.pushPlan(resolved)
  }, [blocks, tasks, objectives, registry])
}
```

**Step 2 — Verify + commit.**
```bash
git add src/renderer/src/lib/use-plan-push.ts
git commit -m "feat(auto-block): hook usePlanPush"
```

---

## Task 7 : Monter le hook dans le composant racine

**Step 1 — Localiser** `src/renderer/src/components/Layout.tsx` (ou `App.tsx`,
selon où vit le tronc commun).

**Step 2 — Ajouter `now` (interval 60 s), `rangeEnd` (24 h), et l'appel** :
```tsx
import { useEffect, useMemo, useState } from 'react'
import { usePlanPush } from '@/lib/use-plan-push'
import { localDateKey } from '@/lib/use-placement'

// dans le composant racine, une seule fois :
const [now, setNow] = useState(() => new Date())
useEffect(() => {
  const id = setInterval(() => setNow(new Date()), 60_000)
  return () => clearInterval(id)
}, [])

const rangeEnd = useMemo(() => {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return localDateKey(d)  // 24 h suffisent au scheduler
}, [now])

usePlanPush(now, rangeEnd)
```

**Step 3 — Charger le registre au démarrage de l'app.** Le hook
`usePlanPush` consomme `useRegistryStore.items`. Il faut s'assurer que le
store est chargé. Dans le composant racine, ajouter :
```ts
const loadRegistry = useRegistryStore((s) => s.load)
const registryLoaded = useRegistryStore((s) => s.loaded)
useEffect(() => {
  if (!registryLoaded) void loadRegistry()
}, [registryLoaded, loadRegistry])
```

**Step 4 — Verify + smoke test manuel.**
- `npm run dev`.
- Crée 1-2 tâches/objectifs avec des distractions classifiées.
- Vérifie dans les logs du service qu'un `PUSH_PLAN` arrive.
- Si possible, crée un bloc qui démarre dans la minute suivante. Attends.
  Une session auto doit démarrer, avec notification native.

**Step 5 — Commit.**
```bash
git add <chemin du composant racine>
git commit -m "feat(auto-block): monte usePlanPush dans le composant racine"
```

---

## À surveiller

- **Préreq bug 1 P16** : sans service qui s'installe, le smoke test final
  (Task 7 Step 4) n'est pas possible. Le code peut être écrit et review,
  mais validation manuelle reste bloquée.
- **Préreq Couche 2** : `resolveBlockingForBlock`, `useRegistryStore`, et
  `UnlockPolicy` viennent de la Couche 2. Sans elle, cette couche ne compile
  pas.
- **Fonction interne de démarrage de session** (Task 3) : Codex doit
  localiser dans `blocking-host.ts` la fonction appelée par le case
  `'START_SESSION'` et l'utiliser pour démarrer les sessions auto. Si la
  fonction n'est pas extraite, l'extraire (refactor mineur, OK).
- **Persistance disque** (`nexus_plan.json`) : doit être dans
  `C:\ProgramData\Nexus\` (`serviceDataDir()`). Les ACL sur ce dossier ont
  été posées par P16 Phase 4.1 (Codex) ; le service y a les droits d'écrire.
- **Tests du service** : peuvent échouer si le `setInterval(schedulerTick,
  15_000)` est démarré au boot du host. Mock ou skip ce timer dans les
  tests du host.
