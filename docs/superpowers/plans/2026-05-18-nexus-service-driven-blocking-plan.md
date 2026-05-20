# Couche 3 — Blocage piloté par le bloc actif : plan d'implémentation

> Reference spec : `docs/superpowers/specs/2026-05-18-nexus-service-driven-blocking-design.md`
> Préreq : Couches 1 et 2 mergées ; bug 1 P16 corrigé (service Windows qui
> s'installe vraiment), sinon le smoke test n'est pas possible.

**Goal :** Le service démarre automatiquement une session de blocage quand un
bloc planifié arrive, à partir du plan poussé par le renderer.

**Tech Stack :** TypeScript, Vitest, named pipe IPC.

**Branche suggérée :** `nexus-service-driven-blocking` depuis `master`.

---

## Files

**Create :**
- `src/service/blocking-scheduler.ts`
- `src/service/blocking-scheduler.test.ts`
- `src/renderer/src/lib/use-plan-push.ts`

**Modify :**
- `src/shared/service-protocol.ts`
- `src/shared/ipc-channels.ts`
- `src/service/blocking-host.ts`
- `src/main/blocking/ipc/blocking.handlers.ts`
- `src/preload/index.ts`
- `src/renderer/src/lib/ipc.ts`
- Un composant racine renderer (Layout.tsx ou équivalent).

Aucun `git add -A`.

---

## Task 1 : Commande `PUSH_PLAN` dans le protocole

**Step 1 — Modifier `src/shared/service-protocol.ts`.**

Repérer la union des commandes service (probablement `ServiceCommand` ou
similaire) et ajouter le cas `PUSH_PLAN`. Ajouter aussi le type `PushedBlock` :

```ts
import type { DistractionSet } from './schemas'

export type PushedBlock = {
  id: string
  date: string         // YYYY-MM-DD
  startMinute: number  // 0..1439
  endMinute: number    // 1..1440
  refKind: 'task' | 'objective'
  refId: string
  distractions: DistractionSet
}

// Dans la union :
// | { type: 'PUSH_PLAN'; payload: { blocks: PushedBlock[] } }
```

**Step 2 — Verify.** `npm run typecheck` → PASS.

**Step 3 — Commit.**
```bash
git add src/shared/service-protocol.ts
git commit -m "feat(blocking): commande PUSH_PLAN du protocole service"
```

---

## Task 2 : Scheduler pur (TDD)

**Step 1 — Tests qui échouent.** Créer `src/service/blocking-scheduler.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { findActiveBlock } from './blocking-scheduler'
import type { PushedBlock } from '@shared/service-protocol'

const sampleDistractions = {
  blockedSites: [],
  blockedProcesses: [],
  blockedNetworkApps: [],
  unlockPolicy: { type: 'none' as const },
}

function pb(over: Partial<PushedBlock> & { id: string }): PushedBlock {
  return {
    id: over.id,
    date: over.date ?? '2026-05-18',
    startMinute: over.startMinute ?? 0,
    endMinute: over.endMinute ?? 60,
    refKind: over.refKind ?? 'task',
    refId: over.refId ?? 'r',
    distractions: over.distractions ?? sampleDistractions,
  }
}

describe('findActiveBlock', () => {
  const blocks = [
    pb({ id: '1', date: '2026-05-18', startMinute: 480, endMinute: 540 }), // 8h-9h
    pb({ id: '2', date: '2026-05-18', startMinute: 600, endMinute: 660 }), // 10h-11h
  ]

  it('trouve le bloc actif quand maintenant est dedans', () => {
    expect(findActiveBlock(blocks, '2026-05-18', 510)?.id).toBe('1') // 8h30
  })

  it('renvoie null entre deux blocs', () => {
    expect(findActiveBlock(blocks, '2026-05-18', 570)).toBeNull() // 9h30
  })

  it('renvoie null pour un autre jour', () => {
    expect(findActiveBlock(blocks, '2026-05-19', 510)).toBeNull()
  })

  it('borne inclusive sur le début, exclusive sur la fin', () => {
    expect(findActiveBlock(blocks, '2026-05-18', 480)?.id).toBe('1') // 8h00 → in
    expect(findActiveBlock(blocks, '2026-05-18', 540)).toBeNull() // 9h00 → out
  })
})
```

**Step 2 — Run, expect FAIL** (module introuvable).

**Step 3 — Implémenter.** Créer `src/service/blocking-scheduler.ts` :

```ts
import type { PushedBlock } from '@shared/service-protocol'

/**
 * Bloc actif à `(date, minuteOfDay)` (début inclusif, fin exclusive), ou null.
 */
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
git commit -m "feat(blocking): scheduler service — findActiveBlock"
```

---

## Task 3 : Câblage côté service — handler `PUSH_PLAN` + tick

**Step 1 — Modifier `src/service/blocking-host.ts`.**

Ajouter en haut :
```ts
import { findActiveBlock } from './blocking-scheduler'
import type { PushedBlock } from '@shared/service-protocol'
```

Dans l'état interne du host (à côté des autres `let` / `const` de l'état) :
```ts
let pushedPlan: PushedBlock[] = []
const triggeredBlockIds = new Set<string>()
```

Ajouter un handler du push, et un utilitaire de date :
```ts
function handlePushPlan(payload: { blocks: PushedBlock[] }): void {
  pushedPlan = payload.blocks
}

function nowAsDateAndMinute(): { date: string; minuteOfDay: number } {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return { date: `${y}-${m}-${day}`, minuteOfDay: d.getHours() * 60 + d.getMinutes() }
}
```

Le tick du scheduler. Codex : repérer la fonction du host qui gère
`isSessionActive` et `startSession` (déjà présentes ; Partie A P16). Le tick
les réutilise :

```ts
function schedulerTick(): void {
  // Pas de double-déclenchement si une session manuelle (ou auto précédente) tourne.
  if (isSessionActive()) return
  const { date, minuteOfDay } = nowAsDateAndMinute()
  const block = findActiveBlock(pushedPlan, date, minuteOfDay)
  if (!block) return
  if (triggeredBlockIds.has(block.id)) return

  // Construire un BlockingProfile éphémère depuis le DistractionSet du bloc.
  const ephemeralProfile = {
    id: `auto-${block.id}`,
    name: `Auto: ${block.refKind} ${block.refId.slice(0, 8)}`,
    blockedSites: block.distractions.blockedSites,
    blockedProcesses: block.distractions.blockedProcesses,
    blockedNetworkApps: block.distractions.blockedNetworkApps,
    unlockPolicy: block.distractions.unlockPolicy,
    createdAt: new Date().toISOString(),
  }
  const durationMinutes = block.endMinute - minuteOfDay

  // Réutiliser le mécanisme de démarrage existant (regarder comment le host
  // gère déjà 'START_SESSION' depuis le renderer — appeler la même fonction
  // interne, ou inliner sa logique).
  startSessionInternal(ephemeralProfile, durationMinutes, {
    sessionRulesEnabled: true,  // par défaut
    strictBlocking: true,
  })
  triggeredBlockIds.add(block.id)
}

const schedulerTickHandle = setInterval(schedulerTick, 15_000)
// Au teardown du host : clearInterval(schedulerTickHandle).
```

**Step 2 — Brancher le handler dans le routeur de commandes du host.**

Trouver le `switch (command.type)` (ou équivalent) qui dispatch les commandes
IPC (`START_SESSION`, `SAVE_PROFILE`, etc.) et ajouter :
```ts
case 'PUSH_PLAN':
  handlePushPlan(command.payload as { blocks: PushedBlock[] })
  return { ok: true }
```

**Step 3 — Verify.** `npm run typecheck && npm run lint && npm run test`. Les
tests existants du service doivent rester verts ; les 4 nouveaux du scheduler
aussi.

**Step 4 — Commit.**
```bash
git add src/service/blocking-host.ts
git commit -m "feat(blocking): handler PUSH_PLAN + tick scheduler côté service"
```

---

## Task 4 : Relais IPC dans le main

**Step 1 — Modifier `src/shared/ipc-channels.ts`.** Ajouter dans `IPC_CHANNELS` :
```ts
  BLOCKING_PUSH_PLAN: 'blocking:pushPlan',
```

**Step 2 — Modifier `src/main/blocking/ipc/blocking.handlers.ts`.** Ajouter
(à côté des autres `ipcMain.handle` du fichier) :
```ts
ipcMain.handle(IPC_CHANNELS.BLOCKING_PUSH_PLAN, (_e, payload: unknown) =>
  client.request('PUSH_PLAN', payload),
)
```

**Step 3 — Verify** : typecheck PASS.

**Step 4 — Commit.**
```bash
git add src/shared/ipc-channels.ts src/main/blocking/ipc/blocking.handlers.ts
git commit -m "feat(blocking): relais IPC main PUSH_PLAN"
```

---

## Task 5 : Préload + typage IPC renderer

**Step 1 — Modifier `src/preload/index.ts`.** Dans l'objet `blocking` exposé,
ajouter :
```ts
pushPlan: (blocks: PushedBlock[]) =>
  ipcRenderer.invoke(IPC_CHANNELS.BLOCKING_PUSH_PLAN, { blocks }),
```

Et l'import en haut :
```ts
import type { PushedBlock } from '@shared/service-protocol'
```

**Step 2 — Modifier `src/renderer/src/lib/ipc.ts`** pour typer la méthode
(probablement dans une déclaration d'interface — suivre le pattern des autres
méthodes blocking).

**Step 3 — Verify.** typecheck PASS.

**Step 4 — Commit.**
```bash
git add src/preload/index.ts src/renderer/src/lib/ipc.ts
git commit -m "feat(blocking): expose pushPlan au renderer"
```

---

## Task 6 : Hook `usePlanPush`

**Step 1 — Créer `src/renderer/src/lib/use-plan-push.ts`** :

```ts
import { useEffect, useRef } from 'react'
import { useTasksStore } from '@/store/tasks.store'
import { useLevelsStore } from '@/store/levels.store'
import { usePlacement } from './use-placement'
import { resolveDistractions } from './distraction-resolver'
import { nexus } from './ipc'
import type { PushedBlock } from '@shared/service-protocol'

/**
 * Pousse le plan résolu au service à chaque changement. Debouncé à 1×/min
 * pour ne pas spammer le pipe. À monter à un endroit unique (Layout) pour
 * tourner tant que l'UI est ouverte.
 */
export function usePlanPush(now: Date, rangeEndStr: string): void {
  const { blocks } = usePlacement(now, rangeEndStr)
  const tasks = useTasksStore((s) => s.tasks)
  const objectives = useLevelsStore((s) => s.objectives)
  const lastPushAtRef = useRef(0)
  const lastHashRef = useRef('')

  useEffect(() => {
    const resolved: PushedBlock[] = []
    for (const b of blocks) {
      if (b.kind === 'free' || !b.refId) continue
      const distractions = resolveDistractions(b, tasks, objectives)
      if (!distractions) continue
      resolved.push({
        id: b.id,
        date: b.date,
        startMinute: b.startMinute,
        endMinute: b.endMinute,
        refKind: b.kind,
        refId: b.refId,
        distractions,
      })
    }
    const hash = JSON.stringify(resolved)
    if (hash === lastHashRef.current) return  // pas de changement
    const sinceLast = Date.now() - lastPushAtRef.current
    if (sinceLast < 60_000 && lastPushAtRef.current > 0) return  // debounce 1×/min
    lastPushAtRef.current = Date.now()
    lastHashRef.current = hash
    void nexus.blocking.pushPlan(resolved)
  }, [blocks, tasks, objectives])
}
```

**Step 2 — Verify.** typecheck PASS.

**Step 3 — Commit.**
```bash
git add src/renderer/src/lib/use-plan-push.ts
git commit -m "feat(blocking): hook usePlanPush"
```

---

## Task 7 : Monter le hook dans un composant racine

**Step 1 — Localiser le composant racine.** Probablement
`src/renderer/src/components/Layout.tsx` ou `src/renderer/src/App.tsx`.

**Step 2 — Ajouter `now` + `rangeEnd` + appel au hook.**

Si le composant n'a pas déjà `now` (interval 60s), l'ajouter :
```ts
const [now, setNow] = useState(() => new Date())
useEffect(() => {
  const id = setInterval(() => setNow(new Date()), 60_000)
  return () => clearInterval(id)
}, [])
```

Et :
```ts
import { usePlanPush } from '@/lib/use-plan-push'
import { localDateKey } from '@/lib/use-placement'

const rangeEnd = useMemo(() => {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return localDateKey(d)  // les prochaines 24h suffisent au scheduler
}, [now])

usePlanPush(now, rangeEnd)
```

**Step 3 — Smoke test manuel** (impératif) :
- Lance `npm run dev`.
- Crée 1-2 tâches/objectifs avec des distractions.
- Vérifie dans les logs du service (chemin : voir `engine-log.ts`) qu'un
  `PUSH_PLAN` arrive au démarrage, puis ~1×/min si le plan change.
- Si tu peux créer un bloc qui démarre dans la minute suivante, attends et
  vérifie qu'une session de blocage démarre automatiquement.

**Step 4 — Verify portes.** typecheck + lint + tests verts.

**Step 5 — Commit.**
```bash
git add <chemin du composant racine>
git commit -m "feat(blocking): pousse le plan au service tant que l'UI tourne"
```

---

## Couverture spec → tâches

- D1 (service pilote) → Task 3.
- D2 (push IPC) → Tasks 1, 4, 5, 6, 7.
- D3 (mémoire seulement) → Task 3.
- D4 (`PushedBlock`) → Task 1.
- D5 (scheduler) → Tasks 2, 3.
- D6 (collision session manuelle) → Task 3 (`if (isSessionActive()) return`).
- D7 (plan change pendant session) → naturellement géré.
- D8 (`triggeredBlockIds`) → Task 3.

---

## À surveiller

- **Smoke test impératif** : sans test manuel sur Windows, le câblage IPC
  ne peut pas être validé. Codex doit signaler clairement à la fin du Task 7.
- Si la couche 2 (`DistractionSet` / `resolveDistractions`) n'est pas en
  place, ce plan **n'est pas exécutable** — implémenter la couche 2 d'abord.
- Si le bug 1 P16 (service ne s'installe pas) n'est pas résolu, le smoke
  test échoue parce que le service n'est pas joignable. Code peut être écrit
  et review, mais validation manuelle bloquée.
- Si Layout.tsx n'existe pas tel quel, choisir un autre composant racine
  unique (App.tsx) — le hook doit tourner exactement une fois, pas N fois.
