# Phase 2 — Lot 3 : Host de blocage du service

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner au service Windows sa propre capacité de blocage autonome — un `blocking-host` (manager + adapters + drift detector + clock monitor) câblé au pont nommé — pour qu'il réponde aux commandes de blocage sur le named pipe, sans encore débrancher le `main`.

**Architecture:** Le module `storage` est relocalisé dans `src/service/storage/` (résout le dernier import `@main` du moteur). Un module neuf `blocking-host.ts` porte l'orchestration de `blocking.handlers.ts` découplée de l'UI : il émet des événements au lieu de `webContents.send`, ne déclenche pas de notifications, et reçoit les réglages de session via le protocole du pont. `blocking-adapters.ts` assemble les adapters réels couplés à l'OS. `index.ts` instancie le host, enregistre les handlers de blocage sur le pont et diffuse les événements. Le `main` continue de bloquer en parallèle — la bascule est le Lot 4.

**Tech Stack:** TypeScript, Vitest, named pipe (`node:net`), electron-vite.

---

## Contexte & périmètre

Ce plan est le **Lot 3** du palier 2 du sous-projet P16 (service Windows).
Réf. spec : `docs/superpowers/specs/2026-05-15-nexus-windows-service-design.md` §4, §6.
Les Lots 1 (relocalisation du moteur) et 2 (découplage du moteur) sont faits.
Numérotation des lots restants : **Lot 3** (host de blocage, ce plan) ; **Lot 4**
(bascule de l'UI — `blocking.handlers.ts` devient un relais, blocage retiré du `main`).

**Ce que Lot 3 fait :**
1. Relocalise `src/main/storage/` → `src/service/storage/`. Résout le dernier import
   `import type { Storage } from '@main/storage'` du moteur (`persistence.ts`).
2. Crée `src/service/blocking-host.ts` : `createBlockingHost()` — l'équivalent service
   de `registerBlockingHandlers`, sans couplage UI. Plus `createBlockingHandlers()`
   qui mappe le protocole du pont vers le host.
3. Crée `src/service/blocking-adapters.ts` : assemble les adapters réels (hosts,
   firewall, process avec stratégie AppLocker, sondes de statut).
4. Câble le tout dans `src/service/index.ts` : le service répond désormais à
   `GET_STATE`, `SAVE_PROFILE`, `DELETE_PROFILE`, `START_SESSION`, `REQUEST_UNLOCK`,
   `SUBMIT_JUSTIFICATION`, `GET_LAYER_STATUS`, et diffuse les événements de blocage.

**Ce que Lot 3 ne fait PAS** (Lot 4) :
- Transformer `blocking.handlers.ts` en relais du pipe.
- Retirer le blocage du `main`.
- Lancer le service en process détaché au démarrage de l'UI.
- Migrer les fichiers de blocage vers `C:\ProgramData\Nexus`.

**Le `main` n'est pas modifié dans sa logique de blocage.** En Lot 3, le moteur de
blocage tourne *toujours* dans le `main` via `blocking.handlers.ts` (inchangé, hormis
le repointage d'import storage en Task 1). Le service n'est lancé qu'à la main via
`npm run dev:service` (cf. `src/main/index.ts` : il se contente d'un `GET_SERVICE_INFO`
de diagnostic, il **ne spawn pas** le service). Instancier le host dans `index.ts` —
y compris l'appel `hydrate()` qui peut nettoyer le fichier hosts — est donc **sans
risque** : aucune collision avec le blocage du `main` en exploitation normale.

### Décisions de conception (verrouillées)

- **Cible de relocalisation : `src/service/storage/`** — *pas* `src/shared/`. Le
  dossier `src/shared/` est type-checké par `tsconfig.web.json` (qui n'a pas les
  types `node`) ; or `storage` importe `node:fs` / `node:path`. `src/service/` n'est
  type-checké que par `tsconfig.node.json`. Le build `main` connaît l'alias `@service`
  (posé au Lot 1) ; le build `service` résout les imports internes en relatif.
- **Duplication transitoire assumée.** `blocking-host.ts` reprend l'orchestration de
  `blocking.handlers.ts` (wiring du manager, du drift, du clock monitor). Les deux
  coexistent jusqu'au Lot 4, qui supprime le blocage du `main`. **Un reviewer ne doit
  PAS signaler cette duplication comme un bug** — elle est temporaire et documentée.
- **Omissions volontaires du portage UI → service** (le host diffère de
  `blocking.handlers.ts`, c'est voulu) :
  - Pas de `webContents.send` → le host **émet des événements** ; `index.ts` les
    `broadcast()` sur le pont.
  - Pas de `notify*` → les notifications restent côté UI (spec §6). Le service émet
    des événements ; l'UI déclenchera les notifs au Lot 4.
  - Pas de `storage.read('settings')` → `strictBlocking` et `sessionRulesEnabled`
    arrivent dans le **payload de `START_SESSION`** (spec §4.3).
  - Pas de `storage.write('stats')` à la fin de session → `stats` est un fichier
    possédé par l'UI (spec §4.4). Le host émet `SESSION_ENDED { entry, session }` ;
    l'UI fera l'écriture des stats au Lot 4.
  - Pas de `getPreviousFreeMinutesByDate` → le service ne voit pas les données
    d'app-usage (UI). `evaluateSessionRules` est appelé **sans** `freeMinutesByDate` :
    le service re-valide les règles avec son propre historique (spec §4.3). C'est
    déjà ce que fait la vérification live de `blocking.handlers.ts`.
  - Pas de `notifyServiceNotStarted` à l'échec d'AppLocker → l'échec est exposé via
    `GET_LAYER_STATUS` (`processes: 'error'`).
- **`elevated: true` en dur.** Le service tourne en compte SYSTEM (spec §4) — élevé
  par construction. Le paquet `is-elevated` n'est pas utilisé : il est ESM pur et le
  bundle service est CJS (il faudrait un `import()` dynamique — évité). Le host garde
  malgré tout le garde-fou `if (!elevated) throw` (piloté par la dépendance injectée),
  pour rester un portage fidèle et pour pouvoir tester le refus.

## Structure de fichiers

```
RELOCALISÉ (git mv) :
  src/main/storage/  →  src/service/storage/
    (index.ts, atomic.ts, atomic.test.ts, storage.test.ts — contenu inchangé)

CRÉÉ :
  src/service/blocking-host.ts        # createBlockingHost + createBlockingHandlers
  src/service/blocking-host.test.ts   # tests unitaires + intégration pont
  src/service/blocking-adapters.ts    # createProcessControl + createBlockingAdapters

MODIFIÉ (repointage d'import storage uniquement) :
  src/main/index.ts                          # import { createStorage }
  src/main/ipc/index.ts                      # import type { Storage }
  src/main/ipc/storage.handlers.ts           # import type { Storage }
  src/main/free-time/recalculate.ts          # import type { Storage }
  src/main/tracking/handlers.ts              # import type { Storage }
  src/main/blocking/ipc/blocking.handlers.ts # import type { Storage }
  src/service/blocking/session/persistence.ts # import type { Storage } → relatif

MODIFIÉ (câblage) :
  src/service/index.ts                # instancie le host, enregistre les handlers
```

`tsconfig.node.json` (`include: src/service/**`, `paths: @service/*`), les deux
`vitest.config` (`include: src/service/**/*.test.ts`, alias `@service`) et le build
`main` (alias `@service`) connaissent déjà tout ce qu'il faut — **aucune config à
modifier**. Le build `service` (`electron.vite.service.config.ts`) résout les imports
internes à `src/service/` en relatif — `blocking-host.ts` et `blocking-adapters.ts`
utilisent donc des chemins relatifs (`./blocking/...`, `./storage`).

---

## Task 1: Relocaliser le module `storage` vers `src/service/storage/`

**Files:**
- Move: `src/main/storage/` → `src/service/storage/`
- Modify: `src/service/blocking/session/persistence.ts`
- Modify: `src/main/index.ts`, `src/main/ipc/index.ts`,
  `src/main/ipc/storage.handlers.ts`, `src/main/free-time/recalculate.ts`,
  `src/main/tracking/handlers.ts`, `src/main/blocking/ipc/blocking.handlers.ts`

Le module `storage` est générique et pur (lecture/écriture JSON atomique validée par
Zod ; `node:fs`, `node:path`, `@shared/schemas`, `zod` — aucun couplage Electron). Il
est consommé côté `main` (5 imports de type + 1 import de `createStorage`) et côté
service (`persistence.ts`, import de type). Ce déplacement le rend accessible au
service sans casser le `main`.

- [ ] **Step 1: Déplacer le dossier**

Depuis la racine du worktree :

```bash
git mv src/main/storage src/service/storage
```

Après ça, `src/main/storage/` n'existe plus ; les imports `@main/storage` et l'import
relatif `./storage` de `src/main/index.ts` ne résolvent plus. Le build est cassé
jusqu'à la fin de la Task — c'est normal, on le répare aux steps suivants. Les imports
*internes* au dossier (`./atomic` dans `index.ts`, `./index`/`./atomic` dans les
fichiers de test) restent valides : le dossier bouge d'un bloc.

- [ ] **Step 2: Repointer l'import de type dans `persistence.ts`**

Dans `src/service/blocking/session/persistence.ts`, remplacer :

```ts
import type { Storage } from '@main/storage'
```

par :

```ts
import type { Storage } from '../../storage'
```

(`persistence.ts` est dans `src/service/blocking/session/` ; `../../storage` pointe
sur `src/service/storage`. On utilise le chemin relatif — cohérent avec les autres
imports internes au service de ce fichier, ex. `../blocking-paths`.)

- [ ] **Step 3: Repointer les 6 imports côté `main`**

Dans **`src/main/index.ts`**, remplacer :

```ts
import { createStorage } from './storage'
```

par :

```ts
import { createStorage } from '@service/storage'
```

Dans **chacun** des 5 fichiers suivants, remplacer la ligne
`import type { Storage } from '@main/storage'` par
`import type { Storage } from '@service/storage'` :

- `src/main/ipc/index.ts`
- `src/main/ipc/storage.handlers.ts`
- `src/main/free-time/recalculate.ts`
- `src/main/tracking/handlers.ts`
- `src/main/blocking/ipc/blocking.handlers.ts`

Aucune autre ligne de ces fichiers n'est touchée.

- [ ] **Step 4: Vérifier qu'aucune référence à l'ancien chemin ne subsiste**

Run (Grep) : chercher `@main/storage` dans `src/`.
Expected : **aucun résultat**.

Run (Grep) : chercher `from '@main` dans `src/service/`.
Expected : **aucun résultat** (le moteur n'a plus aucun couplage `@main`, même
type-only — c'était le dernier, désormais résolu).

- [ ] **Step 5: Vérifier typecheck + lint + tests**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: `typecheck` (node + web) PASS ; `lint` PASS ; `test` **134 passed**. Les
deux fichiers de test du storage (`storage.test.ts`, `atomic.test.ts`, 10 tests au
total) tournent désormais depuis `src/service/storage/` — vitest les inclut via
`src/service/**/*.test.ts`, le total ne change pas.

- [ ] **Step 6: Vérifier les builds**

Run: `npm run build:service`
Expected: PASS — produit `out/service/index.js`.

Run: `npm run build`
Expected: la partie `electron-vite build` (bundles main/preload/renderer) PASS.
L'étape `electron-builder` échoue dans le worktree faute d'Electron packagé localement
— limite d'environnement connue, sans rapport avec ce lot. Les avertissements
`MODULE_TYPELESS_PACKAGE_JSON` / « CJS build of Vite deprecated » sont du bruit attendu.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(service): relocaliser le module storage vers src/service/storage"
```

---

## Task 2: `blocking-host.ts` — `createBlockingHost`

**Files:**
- Create: `src/service/blocking-host.ts`
- Test: `src/service/blocking-host.test.ts`

Le host est l'orchestrateur de blocage du service : il instancie le session manager,
le drift detector et le clock monitor, expose des méthodes (une par commande de
blocage) et émet des événements. Il est **pur glue** : toutes les dépendances couplées
à l'OS sont injectées (`BlockingHostDeps`), ce qui le rend testable avec des fakes,
exactement comme `manager.test.ts` teste `createSessionManager`.

- [ ] **Step 1: Écrire le test (échouera — module absent)**

Créer `src/service/blocking-host.test.ts` :

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createBlockingHost,
  type BlockingHostDeps,
  type BlockingHostEvent,
} from './blocking-host'
import type { BlockingProfile, BlockingState } from '@shared/schemas'

const PROFILE: BlockingProfile = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Focus',
  blockedSites: ['example.com'],
  blockedProcesses: ['notepad.exe'],
  blockedNetworkApps: [],
  unlockPolicy: { type: 'none' },
  createdAt: '2026-05-04T09:00:00.000Z',
}

function makeState(overrides?: Partial<BlockingState>): BlockingState {
  return { profiles: [PROFILE], history: [], nextSessionPenaltyMinutes: 0, ...overrides }
}

function makeDeps(overrides?: Partial<BlockingHostDeps>): BlockingHostDeps {
  return {
    persistence: {
      readState: vi.fn().mockResolvedValue(makeState()),
      writeState: vi.fn().mockResolvedValue(undefined),
      readActive: vi.fn().mockResolvedValue(null),
      writeActive: vi.fn().mockResolvedValue(undefined),
      clearActive: vi.fn().mockResolvedValue(undefined),
    },
    hosts: {
      apply: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
      flushDns: vi.fn().mockResolvedValue(undefined),
    },
    firewall: {
      applyAll: vi.fn().mockResolvedValue([]),
      removeAll: vi.fn().mockResolvedValue(undefined),
      removeOrphansExcept: vi.fn().mockResolvedValue(undefined),
      applied: vi.fn().mockReturnValue([]),
    },
    processes: {
      start: vi.fn().mockReturnValue({ stop: vi.fn() }),
      status: vi.fn().mockReturnValue('inactive'),
      setStrictBlocking: vi.fn(),
    },
    layerProbe: {
      readHostsFile: vi.fn().mockResolvedValue(''),
      listFirewallRules: vi.fn().mockResolvedValue([]),
    },
    elevated: true,
    drift: { start: vi.fn(), stop: vi.fn(), on: vi.fn() },
    startClock: vi.fn().mockReturnValue({ stop: vi.fn() }),
    ...overrides,
  }
}

describe('createBlockingHost', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-05-13T12:00:00.000Z') })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('getState renvoie l’état persisté et la session active', async () => {
    const host = createBlockingHost(makeDeps())
    const result = await host.getState()
    expect(result.state.profiles).toEqual([PROFILE])
    expect(result.active).toBeNull()
  })

  it('saveProfile valide, complète et persiste un profil', async () => {
    const deps = makeDeps()
    const host = createBlockingHost(deps)
    const saved = await host.saveProfile({
      name: 'Travail',
      blockedSites: ['reddit.com'],
      blockedProcesses: ['notepad.exe'],
      blockedNetworkApps: [],
      unlockPolicy: { type: 'none' },
    })
    expect(saved.id).toMatch(/[0-9a-f-]{36}/)
    expect(saved.name).toBe('Travail')
    expect(deps.persistence.writeState).toHaveBeenCalled()
  })

  it('saveProfile refuse un processus système safe-listé', async () => {
    const host = createBlockingHost(makeDeps())
    await expect(
      host.saveProfile({
        name: 'X',
        blockedSites: [],
        blockedProcesses: ['svchost.exe'],
        blockedNetworkApps: [],
        unlockPolicy: { type: 'none' },
      }),
    ).rejects.toThrow(/svchost\.exe/)
  })

  it('deleteProfile retire le profil de l’état', async () => {
    const deps = makeDeps()
    const host = createBlockingHost(deps)
    await host.deleteProfile(PROFILE.id)
    expect(deps.persistence.writeState).toHaveBeenCalledWith(
      expect.objectContaining({ profiles: [] }),
    )
  })

  it('startSession applique les couches et mémorise le réglage strict', async () => {
    const deps = makeDeps()
    const host = createBlockingHost(deps)
    const session = await host.startSession({
      profileId: PROFILE.id,
      durationMinutes: 60,
      sessionRulesEnabled: false,
      strictBlocking: false,
    })
    expect(session.profileId).toBe(PROFILE.id)
    expect(deps.processes.setStrictBlocking).toHaveBeenCalledWith(false)
    expect(deps.hosts.apply).toHaveBeenCalled()
    expect(deps.firewall.applyAll).toHaveBeenCalled()
  })

  it('startSession échoue si le service n’est pas élevé', async () => {
    const host = createBlockingHost(makeDeps({ elevated: false }))
    await expect(
      host.startSession({
        profileId: PROFILE.id,
        durationMinutes: 60,
        sessionRulesEnabled: false,
        strictBlocking: true,
      }),
    ).rejects.toThrow(/administrateur/)
  })

  it('startSession échoue quand les règles de session sont violées', async () => {
    const deps = makeDeps()
    deps.persistence.readState = vi.fn().mockResolvedValue(
      makeState({
        history: [
          {
            sessionId: '22222222-2222-4222-8222-222222222222',
            profileId: PROFILE.id,
            startedAt: '2026-05-13T06:00:00.000Z',
            endedAt: '2026-05-13T11:45:00.000Z', // 5h45 sur le même projet
            completedNormally: true,
          },
        ],
      }),
    )
    const host = createBlockingHost(deps)
    await expect(
      host.startSession({
        profileId: PROFILE.id,
        durationMinutes: 60,
        sessionRulesEnabled: true,
        strictBlocking: true,
      }),
    ).rejects.toThrow(/projet/)
  })

  it('startSession applique la pénalité en attente puis la remet à zéro', async () => {
    const deps = makeDeps()
    deps.persistence.readState = vi.fn().mockResolvedValue(
      makeState({ nextSessionPenaltyMinutes: 30 }),
    )
    const host = createBlockingHost(deps)
    const session = await host.startSession({
      profileId: PROFILE.id,
      durationMinutes: 60,
      sessionRulesEnabled: false,
      strictBlocking: true,
    })
    expect(session.durationMinutes).toBe(90)
    expect(deps.persistence.writeState).toHaveBeenCalledWith(
      expect.objectContaining({ nextSessionPenaltyMinutes: 0 }),
    )
  })

  it('getLayerStatus renvoie inactive sans session active', async () => {
    const host = createBlockingHost(makeDeps())
    expect(await host.getLayerStatus()).toEqual({
      hosts: 'inactive',
      processes: 'inactive',
      firewall: 'inactive',
    })
  })

  it('getLayerStatus signale la dérive hosts et le statut process', async () => {
    const deps = makeDeps()
    deps.processes.status = vi.fn().mockReturnValue('ok')
    deps.layerProbe.readHostsFile = vi.fn().mockResolvedValue('') // bloc Nexus absent
    const host = createBlockingHost(deps)
    await host.startSession({
      profileId: PROFILE.id,
      durationMinutes: 60,
      sessionRulesEnabled: false,
      strictBlocking: true,
    })
    const status = await host.getLayerStatus()
    expect(status.hosts).toBe('drifted')
    expect(status.processes).toBe('ok')
    expect(status.firewall).toBe('ok')
  })

  it('relaie l’événement SESSION_CHANGED du manager', async () => {
    const host = createBlockingHost(makeDeps())
    const events: BlockingHostEvent[] = []
    host.on((e) => events.push(e))
    await host.startSession({
      profileId: PROFILE.id,
      durationMinutes: 60,
      sessionRulesEnabled: false,
      strictBlocking: true,
    })
    const changed = events.find((e) => e.type === 'SESSION_CHANGED')
    expect(changed?.payload).toMatchObject({ profileId: PROFILE.id })
  })

  it('relaie l’événement LAYER_DRIFT du détecteur de dérive', () => {
    let driftCb: ((e: { layer: 'hosts' | 'firewall'; restored: boolean }) => void) | undefined
    const deps = makeDeps({
      drift: {
        start: vi.fn(),
        stop: vi.fn(),
        on: (cb) => {
          driftCb = cb
        },
      },
    })
    const host = createBlockingHost(deps)
    const events: BlockingHostEvent[] = []
    host.on((e) => events.push(e))
    driftCb?.({ layer: 'hosts', restored: true })
    expect(events).toContainEqual({
      type: 'LAYER_DRIFT',
      payload: { layer: 'hosts', restored: true },
    })
  })

  it('relaie l’événement CLOCK_TAMPER du moniteur d’horloge', () => {
    let tamperCb:
      | ((e: { driftMs: number; wallDeltaMs: number; monoDeltaMs: number }) => void)
      | undefined
    const deps = makeDeps({
      startClock: (cb) => {
        tamperCb = cb
        return { stop: vi.fn() }
      },
    })
    const host = createBlockingHost(deps)
    const events: BlockingHostEvent[] = []
    host.on((e) => events.push(e))
    tamperCb?.({ driftMs: 9000, wallDeltaMs: 19000, monoDeltaMs: 10000 })
    expect(events).toContainEqual({ type: 'CLOCK_TAMPER', payload: { driftMs: 9000 } })
  })

  it('émet BREAK_REQUIRED quand l’intervalle détecte une violation', async () => {
    const state = makeState()
    const deps = makeDeps()
    deps.persistence.readState = vi.fn().mockImplementation(async () => state)
    const host = createBlockingHost(deps)
    const events: BlockingHostEvent[] = []
    host.on((e) => events.push(e))

    await host.startSession({
      profileId: PROFILE.id,
      durationMinutes: 60,
      sessionRulesEnabled: true,
      strictBlocking: true,
    })

    // Session lancée avec un historique vide (règles OK au démarrage). On injecte
    // ensuite une violation des 4h ; le prochain tick (60s) doit l’émettre.
    state.history = [
      {
        sessionId: '22222222-2222-4222-8222-222222222222',
        profileId: PROFILE.id,
        startedAt: '2026-05-13T06:00:00.000Z',
        endedAt: '2026-05-13T11:45:00.000Z',
        completedNormally: true,
      },
    ]
    await vi.advanceTimersByTimeAsync(60_000)

    expect(events.some((e) => e.type === 'BREAK_REQUIRED')).toBe(true)
    host.stop()
  })

  it('stop() arrête l’intervalle de règles, la dérive et l’horloge', async () => {
    const driftFake = { start: vi.fn(), stop: vi.fn(), on: vi.fn() }
    const clockHandle = { stop: vi.fn() }
    const deps = makeDeps({ drift: driftFake, startClock: vi.fn().mockReturnValue(clockHandle) })
    const host = createBlockingHost(deps)
    host.stop()
    expect(driftFake.stop).toHaveBeenCalled()
    expect(clockHandle.stop).toHaveBeenCalled()
    const callsBefore = vi.mocked(deps.persistence.readState).mock.calls.length
    await vi.advanceTimersByTimeAsync(120_000)
    expect(vi.mocked(deps.persistence.readState).mock.calls.length).toBe(callsBefore)
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm run test -- src/service/blocking-host.test.ts`
Expected: FAIL — `Failed to resolve import "./blocking-host"` (le module n'existe pas
encore).

- [ ] **Step 3: Écrire `blocking-host.ts`**

Créer `src/service/blocking-host.ts` :

```ts
import { randomUUID } from 'node:crypto'
import { BlockingProfileSchema } from '@shared/schemas'
import type {
  ActiveSession,
  BlockingHistoryEntry,
  BlockingProfile,
  BlockingState,
} from '@shared/schemas'
import {
  createSessionManager,
  type FirewallAdapter,
  type HostsAdapter,
  type ProcessAdapter,
} from './blocking/session/manager'
import {
  createDriftDetector,
  type DriftDetector,
  type DriftEvent,
} from './blocking/session/drift-detector'
import {
  startClockMonitor,
  type ClockMonitorHandle,
  type ClockTamperEvent,
} from './blocking/session/clock-monitor'
import { evaluateSessionRules } from './blocking/session/rules'
import { isSafeListed } from './blocking/processes/safe-list'
import { parseHostsFile } from './blocking/hosts/parser'
import { INACTIVE_LAYERS, type LayerStatus, type LayerStatusValue } from './blocking/session/types'
import type { BlockingPersistence } from './blocking/session/persistence'
import log from './blocking/engine-log'

// ── Types injectables ───────────────────────────────────────────────────────

/**
 * Couche process : l'adapter `start` que consomme le manager, plus le statut
 * courant (pour GET_LAYER_STATUS) et le réglage strict (poussé à chaque session).
 */
export type ProcessControl = ProcessAdapter & {
  status: () => LayerStatusValue
  setStrictBlocking: (strict: boolean) => void
}

/** Sondes OS lues par GET_LAYER_STATUS — injectées pour rendre le host testable. */
export type LayerProbe = {
  readHostsFile: () => Promise<string>
  listFirewallRules: () => Promise<string[]>
}

export type BlockingHostDeps = {
  persistence: BlockingPersistence
  hosts: HostsAdapter
  firewall: FirewallAdapter
  processes: ProcessControl
  layerProbe: LayerProbe
  /** Le service tourne en SYSTEM → élevé. Injectable pour tester le refus. */
  elevated: boolean
  /** Injectables pour les tests ; valeurs réelles par défaut si omis. */
  drift?: DriftDetector
  startClock?: (onTamper: (e: ClockTamperEvent) => void) => ClockMonitorHandle
}

// ── Protocole exposé ────────────────────────────────────────────────────────

export type StartSessionArgs = {
  profileId: string
  durationMinutes: number
  sessionRulesEnabled: boolean
  strictBlocking: boolean
}

export type BlockingHostEvent =
  | { type: 'SESSION_CHANGED'; payload: ActiveSession | null }
  | { type: 'SESSION_ENDED'; payload: { entry: BlockingHistoryEntry; session: ActiveSession } }
  | { type: 'LAYER_DRIFT'; payload: DriftEvent }
  | { type: 'CLOCK_TAMPER'; payload: { driftMs: number } }
  | { type: 'BREAK_REQUIRED'; payload: { reason: string; restMinutes: number } }

export type BlockingHost = {
  getState: () => Promise<{ state: BlockingState; active: ActiveSession | null }>
  saveProfile: (draft: unknown) => Promise<BlockingProfile>
  deleteProfile: (id: string) => Promise<void>
  startSession: (args: StartSessionArgs) => Promise<ActiveSession>
  requestUnlock: () => Promise<ActiveSession['unlockState']>
  submitJustification: (text: string) => Promise<{ ok: true } | { ok: false; reason: string }>
  getLayerStatus: () => Promise<LayerStatus>
  /** Ré-applique une session active trouvée sur disque, ou nettoie les orphelins. */
  hydrate: () => Promise<void>
  on: (cb: (e: BlockingHostEvent) => void) => void
  /** Arrête les timers de fond (intervalle de règles, drift, clock monitor). */
  stop: () => void
}

const SESSION_RULES_CHECK_INTERVAL_MS = 60_000

/**
 * Orchestrateur de blocage du service — équivalent service de
 * `registerBlockingHandlers`, sans aucun couplage UI : il émet des événements
 * (au lieu de `webContents.send`), ne déclenche pas de notifications, et reçoit
 * `strictBlocking` / `sessionRulesEnabled` par session (au lieu de les lire dans
 * `settings`, fichier possédé par l'UI). Cf. plan Lot 3 pour les omissions.
 */
export function createBlockingHost(deps: BlockingHostDeps): BlockingHost {
  const { persistence, hosts, firewall, processes, layerProbe, elevated } = deps
  const listeners: Array<(e: BlockingHostEvent) => void> = []
  function emit(event: BlockingHostEvent): void {
    for (const l of listeners) l(event)
  }

  // Réglages de la session courante, reçus dans le payload de START_SESSION.
  let sessionRulesEnabled = true
  // Empêche d'émettre BREAK_REQUIRED en boucle pour la même session.
  let liveRuleNotifiedFor: string | null = null

  const manager = createSessionManager({ hosts, processes, firewall, persistence })

  manager.on('sessionChanged', (s) => {
    if (!s) liveRuleNotifiedFor = null
    emit({ type: 'SESSION_CHANGED', payload: s })
  })
  manager.on('sessionEnded', (entry, session) => {
    emit({ type: 'SESSION_ENDED', payload: { entry, session } })
  })

  const drift = deps.drift ?? createDriftDetector()
  drift.on((e) => emit({ type: 'LAYER_DRIFT', payload: e }))
  drift.start(
    () => manager.getActive(),
    async (s) => {
      const names = await firewall.applyAll(s.id, s.profileSnapshot.blockedNetworkApps)
      await firewall.removeOrphansExcept(names).catch(() => undefined)
      s.appliedFirewallRules = names
      await persistence.writeActive(s)
    },
  )

  const startClock = deps.startClock ?? startClockMonitor
  const clock = startClock((event) => {
    emit({ type: 'CLOCK_TAMPER', payload: { driftMs: event.driftMs } })
  })

  async function checkSessionRules(): Promise<void> {
    const active = manager.getActive()
    if (!active || liveRuleNotifiedFor === active.id) return
    if (!sessionRulesEnabled) return
    const state = await persistence.readState()
    const elapsedMinutes = Math.max(
      0,
      Math.ceil((Date.now() - new Date(active.startedAt).getTime()) / 60_000),
    )
    const decision = evaluateSessionRules({
      history: state.history,
      profileId: active.profileId,
      requestedMinutes: elapsedMinutes,
    })
    if (decision.ok) return
    liveRuleNotifiedFor = active.id
    emit({
      type: 'BREAK_REQUIRED',
      payload: { reason: decision.reason, restMinutes: decision.restMinutes },
    })
  }

  const ruleCheckTimer = setInterval(() => {
    void checkSessionRules()
  }, SESSION_RULES_CHECK_INTERVAL_MS)

  return {
    async getState() {
      const state = await persistence.readState()
      return { state, active: manager.getActive() }
    },

    async saveProfile(draft) {
      const merged = {
        ...(draft as object),
        id: (draft as { id?: string }).id ?? randomUUID(),
        createdAt: (draft as { createdAt?: string }).createdAt ?? new Date().toISOString(),
      }
      const profile = BlockingProfileSchema.parse(merged)
      for (const exeName of profile.blockedProcesses) {
        if (isSafeListed(exeName)) {
          throw new Error(`System process refused: ${exeName}`)
        }
      }
      const state = await persistence.readState()
      const idx = state.profiles.findIndex((p) => p.id === profile.id)
      if (idx >= 0) state.profiles[idx] = profile
      else state.profiles.push(profile)
      await persistence.writeState(state)
      return profile
    },

    async deleteProfile(id) {
      const state = await persistence.readState()
      state.profiles = state.profiles.filter((p) => p.id !== id)
      await persistence.writeState(state)
    },

    async startSession(args) {
      processes.setStrictBlocking(args.strictBlocking)
      sessionRulesEnabled = args.sessionRulesEnabled
      const state = await persistence.readState()
      const penaltyMinutes = state.nextSessionPenaltyMinutes ?? 0
      const durationMinutes = Math.min(24 * 60, args.durationMinutes + penaltyMinutes)
      if (!elevated) {
        throw new Error('Blocage non opérationnel — droits administrateur requis')
      }
      if (args.sessionRulesEnabled) {
        // Pas de freeMinutesByDate : le service re-valide avec son propre
        // historique (spec §4.3) — il ne voit pas les données d'app-usage de l'UI.
        const decision = evaluateSessionRules({
          history: state.history,
          profileId: args.profileId,
          requestedMinutes: durationMinutes,
        })
        if (!decision.ok) throw new Error(decision.reason)
      }
      const session = await manager.startSession({
        profileId: args.profileId,
        durationMinutes,
      })
      if (penaltyMinutes > 0) {
        const latestState = await persistence.readState()
        await persistence.writeState({ ...latestState, nextSessionPenaltyMinutes: 0 })
      }
      return session
    },

    requestUnlock: () => manager.requestUnlock(),

    submitJustification: (text) => manager.submitJustification(text),

    async getLayerStatus() {
      const active = manager.getActive()
      if (!active) return { ...INACTIVE_LAYERS }
      let hostsStatus: LayerStatusValue = 'ok'
      let firewallStatus: LayerStatusValue = 'ok'
      try {
        const raw = await layerProbe.readHostsFile()
        const parsed = parseHostsFile(raw)
        const expectedEntryCount = active.profileSnapshot.blockedSites.length * 8
        if (
          expectedEntryCount > 0 &&
          (!parsed.nexusBlock || parsed.nexusBlock.entries.length !== expectedEntryCount)
        ) {
          hostsStatus = 'drifted'
        }
      } catch {
        hostsStatus = 'error'
      }
      try {
        const existing = new Set(await layerProbe.listFirewallRules())
        if (active.appliedFirewallRules.some((name) => !existing.has(name))) {
          firewallStatus = 'drifted'
        }
      } catch {
        firewallStatus = 'error'
      }
      return { hosts: hostsStatus, processes: processes.status(), firewall: firewallStatus }
    },

    async hydrate() {
      await manager.hydrateFromDisk().catch((err) => {
        log.error('[blocking-host] hydrate failed', err)
      })
    },

    on(cb) {
      listeners.push(cb)
    },

    stop() {
      clearInterval(ruleCheckTimer)
      drift.stop()
      clock.stop()
    },
  }
}
```

- [ ] **Step 4: Lancer le test + le typecheck**

Run: `npm run typecheck:node && npm run test -- src/service/blocking-host.test.ts`
Expected: typecheck PASS ; **15 tests passed** dans `blocking-host.test.ts`.

Si un test de règle (`startSession échoue...`, `émet BREAK_REQUIRED...`) échoue de
façon inattendue : `evaluateSessionRules` utilise le jour *local* — les dates ISO du
test sont conçues pour que `2026-05-13` reste le même jour local sur tout fuseau
raisonnable (même approche que `rules.test.ts`, déjà vert). Vérifier le message.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: PASS (aucune erreur).

- [ ] **Step 6: Commit**

```bash
git add src/service/blocking-host.ts src/service/blocking-host.test.ts
git commit -m "feat(service): host de blocage createBlockingHost (Lot 3)"
```

---

## Task 3: `createBlockingHandlers` + intégration pont nommé

**Files:**
- Modify: `src/service/blocking-host.ts`
- Modify: `src/service/blocking-host.test.ts`

`createBlockingHandlers` mappe les types de requête du protocole (`ServiceRequestType`)
vers les méthodes du host, sous la forme de la table de handlers attendue par
`createBridgeServer`. On le teste de bout en bout via une vraie paire serveur/client
en mémoire — comme `bridge/server.test.ts`.

- [ ] **Step 1: Ajouter `createBlockingHandlers` à `blocking-host.ts`**

Dans `src/service/blocking-host.ts`, ajouter l'import de type en tête de fichier,
après l'import de `BlockingPersistence` :

```ts
import type { BlockingPersistence } from './blocking/session/persistence'
import type { ServiceRequest } from '@shared/service-protocol'
import type { RequestHandler } from './bridge/server'
import log from './blocking/engine-log'
```

Puis, **à la fin du fichier**, après `createBlockingHost`, ajouter :

```ts

/**
 * Table de handlers du pont pour les commandes de blocage. À fusionner avec les
 * handlers système (`PING`, `GET_SERVICE_INFO`) dans `index.ts`. Chaque handler
 * dépaquète `req.payload` et délègue au host ; les erreurs remontent telles
 * quelles (le bridge les transforme en réponse `ok: false`).
 */
export function createBlockingHandlers(host: BlockingHost): Record<string, RequestHandler> {
  return {
    GET_STATE: () => host.getState(),
    SAVE_PROFILE: (req: ServiceRequest) => host.saveProfile(req.payload),
    DELETE_PROFILE: (req: ServiceRequest) =>
      host.deleteProfile((req.payload as { id: string }).id),
    START_SESSION: (req: ServiceRequest) => host.startSession(req.payload as StartSessionArgs),
    REQUEST_UNLOCK: () => host.requestUnlock(),
    SUBMIT_JUSTIFICATION: (req: ServiceRequest) =>
      host.submitJustification((req.payload as { text: string }).text),
    GET_LAYER_STATUS: () => host.getLayerStatus(),
  }
}
```

- [ ] **Step 2: Ajouter le bloc d'intégration pont à `blocking-host.test.ts`**

Dans `src/service/blocking-host.test.ts`, étendre l'import du module testé :

```ts
import {
  createBlockingHost,
  createBlockingHandlers,
  type BlockingHostDeps,
  type BlockingHostEvent,
} from './blocking-host'
```

Ajouter ces imports en tête de fichier :

```ts
import net from 'node:net'
import { createBridgeServer, type BridgeServer } from './bridge/server'
import { encodeMessage, createMessageDecoder, type ServiceMessage } from '@shared/service-protocol'
```

Puis, **après le `describe('createBlockingHost', ...)`** (au même niveau), ajouter :

```ts

describe('createBlockingHandlers (pont nommé)', () => {
  let server: BridgeServer | null = null

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-05-13T12:00:00.000Z') })
  })
  afterEach(async () => {
    await server?.close()
    server = null
    vi.useRealTimers()
  })

  const testPipe = (): string =>
    `\\\\.\\pipe\\nexus-test-${process.pid}-${Math.random().toString(36).slice(2)}`

  function collect(socket: net.Socket): { next: () => Promise<ServiceMessage> } {
    const decode = createMessageDecoder()
    const queue: ServiceMessage[] = []
    const waiters: Array<(m: ServiceMessage) => void> = []
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => {
      for (const m of decode(chunk)) {
        const w = waiters.shift()
        if (w) w(m)
        else queue.push(m)
      }
    })
    return {
      next: () =>
        new Promise<ServiceMessage>((resolve) => {
          const m = queue.shift()
          if (m) resolve(m)
          else waiters.push(resolve)
        }),
    }
  }

  it('GET_STATE renvoie l’état du host', async () => {
    const host = createBlockingHost(makeDeps())
    const pipe = testPipe()
    server = await createBridgeServer({ pipePath: pipe, handlers: createBlockingHandlers(host) })
    const client = net.createConnection(pipe)
    const inbox = collect(client)
    client.write(encodeMessage({ kind: 'request', id: 'g1', type: 'GET_STATE' }))
    const res = await inbox.next()
    expect(res).toMatchObject({ kind: 'response', id: 'g1', ok: true })
    client.destroy()
  })

  it('SAVE_PROFILE persiste le profil envoyé par le pont', async () => {
    const host = createBlockingHost(makeDeps())
    const pipe = testPipe()
    server = await createBridgeServer({ pipePath: pipe, handlers: createBlockingHandlers(host) })
    const client = net.createConnection(pipe)
    const inbox = collect(client)
    client.write(
      encodeMessage({
        kind: 'request',
        id: 's1',
        type: 'SAVE_PROFILE',
        payload: {
          name: 'Pont',
          blockedSites: [],
          blockedProcesses: [],
          blockedNetworkApps: [],
          unlockPolicy: { type: 'none' },
        },
      }),
    )
    const res = await inbox.next()
    expect(res).toMatchObject({ kind: 'response', id: 's1', ok: true })
    client.destroy()
  })

  it('diffuse SESSION_CHANGED après un START_SESSION sur le pont', async () => {
    const host = createBlockingHost(makeDeps())
    const pipe = testPipe()
    server = await createBridgeServer({ pipePath: pipe, handlers: createBlockingHandlers(host) })
    host.on((e) => server?.broadcast({ type: e.type, payload: e.payload }))
    const client = net.createConnection(pipe)
    const inbox = collect(client)
    client.write(
      encodeMessage({
        kind: 'request',
        id: 'st1',
        type: 'START_SESSION',
        payload: {
          profileId: PROFILE.id,
          durationMinutes: 60,
          sessionRulesEnabled: false,
          strictBlocking: true,
        },
      }),
    )
    // Deux trames attendues : la réponse START_SESSION et l’événement
    // SESSION_CHANGED diffusé (l’ordre d’arrivée n’est pas garanti).
    const messages = [await inbox.next(), await inbox.next()]
    expect(messages).toContainEqual(
      expect.objectContaining({ kind: 'event', type: 'SESSION_CHANGED' }),
    )
    client.destroy()
    host.stop()
  })
})
```

- [ ] **Step 3: Lancer les tests + le typecheck**

Run: `npm run typecheck:node && npm run test -- src/service/blocking-host.test.ts`
Expected: typecheck PASS ; **18 tests passed** (15 unitaires + 3 d'intégration pont).

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/service/blocking-host.ts src/service/blocking-host.test.ts
git commit -m "feat(service): handlers de blocage du pont createBlockingHandlers (Lot 3)"
```

---

## Task 4: `blocking-adapters.ts` — adapters réels couplés à l'OS

**Files:**
- Create: `src/service/blocking-adapters.ts`

Ce module assemble les dépendances réelles du host. C'est du câblage couplé à l'OS
(netsh, AppLocker, fichier hosts réel) : **pas de test unitaire dédié** — il est
couvert par le typecheck et la passe d'intégration manuelle (`npm run dev:service`,
spec §10). La logique de `createProcessControl` est un portage de
`blocking.handlers.ts` (lignes 50-97) ; le `notifyServiceNotStarted` (UI) et la
branche morte `forbidden.length === 0` du fallback y sont volontairement omis.

- [ ] **Step 1: Créer `blocking-adapters.ts`**

Créer `src/service/blocking-adapters.ts` :

```ts
import { promises as fsp } from 'node:fs'
import { createFirewallTracker } from './blocking/firewall/rule-tracker'
import { listRuleNames } from './blocking/firewall/netsh'
import { applyNexusBlock, clearNexusBlock, HOSTS_PATH } from './blocking/hosts/writer'
import { flushDns } from './blocking/hosts/flush-dns'
import { startProcessKiller } from './blocking/processes/killer'
import {
  getWindowsEdition,
  pickBlockingStrategy,
  startAppLockerBlocker,
  type WindowsEdition,
} from './blocking/applocker/policy'
import { createBlockingPersistence } from './blocking/session/persistence'
import type { HostsAdapter } from './blocking/session/manager'
import type { LayerStatusValue } from './blocking/session/types'
import type { Storage } from './storage'
import type { BlockingHostDeps, ProcessControl } from './blocking-host'
import log from './blocking/engine-log'

/**
 * Couche process réelle : sélection AppLocker vs process kill, suivi du statut.
 * Porté de `blocking.handlers.ts` — sans le `notifyServiceNotStarted` (notifs
 * réservées à l'UI, spec §6) : l'échec AppLocker est exposé via `status() = 'error'`.
 */
export function createProcessControl(cfg: {
  elevated: boolean
  edition: WindowsEdition
}): ProcessControl {
  let status: LayerStatusValue = 'inactive'
  let strictBlocking = true
  return {
    setStrictBlocking(strict) {
      strictBlocking = strict
    },
    status: () => status,
    start(forbidden) {
      if (forbidden.length === 0) {
        status = 'inactive'
        return { stop: () => undefined }
      }
      const strategy = pickBlockingStrategy({
        elevated: cfg.elevated,
        strictBlocking,
        edition: cfg.edition,
      })
      if (strategy.processLayer !== 'applocker') {
        status = 'ok'
        log.warn('[blocking] AppLocker indisponible, repli sur process kill', strategy.reason)
        const killer = startProcessKiller(forbidden)
        return {
          stop: () => {
            killer.stop()
            status = 'inactive'
          },
        }
      }
      const appLocker = startAppLockerBlocker(forbidden, strategy.appLockerMode)
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
      const killer = startProcessKiller(forbidden)
      status = 'ok'
      return {
        stop: () => {
          killer.stop()
          status = 'inactive'
        },
      }
    },
  }
}

/**
 * Assemble les dépendances réelles (couplées à l'OS) du host de blocage.
 * `elevated: true` — le service tourne en compte SYSTEM (spec §4).
 */
export function createBlockingAdapters(storage: Storage): BlockingHostDeps {
  const edition = getWindowsEdition()
  const hosts: HostsAdapter = {
    apply: applyNexusBlock,
    clear: clearNexusBlock,
    flushDns,
  }
  return {
    persistence: createBlockingPersistence(storage),
    hosts,
    firewall: createFirewallTracker(),
    processes: createProcessControl({ elevated: true, edition }),
    layerProbe: {
      readHostsFile: () => fsp.readFile(HOSTS_PATH, 'utf8'),
      listFirewallRules: () => listRuleNames(),
    },
    elevated: true,
  }
}
```

- [ ] **Step 2: Vérifier le typecheck**

Run: `npm run typecheck:node`
Expected: PASS. Si une erreur d'import non résolu apparaît : vérifier que les chemins
relatifs `./blocking/...` correspondent bien à l'arborescence
`src/service/blocking/{firewall,hosts,processes,applocker,session}/`.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/service/blocking-adapters.ts
git commit -m "feat(service): adapters réels du host de blocage (Lot 3)"
```

---

## Task 5: Câblage dans `index.ts` + vérification finale

**Files:**
- Modify: `src/service/index.ts`

Le point d'entrée du service instancie le host, fusionne les handlers de blocage avec
les handlers système sur le pont, diffuse les événements du host, puis hydrate l'état
de blocage. Le host est arrêté proprement à l'extinction.

- [ ] **Step 1: Réécrire `index.ts`**

Remplacer **tout le contenu** de `src/service/index.ts` par :

```ts
import { createBridgeServer, type BridgeServer } from './bridge/server'
import type { ServiceInfo } from '@shared/service-protocol'
import { createStorage } from './storage'
import { serviceDataDir } from './data-dir'
import { createBlockingAdapters } from './blocking-adapters'
import { createBlockingHost, createBlockingHandlers } from './blocking-host'
import log from './logging'

const SERVICE_VERSION = '0.12.0'
const startedAt = Date.now()

async function main(): Promise<void> {
  log.info('[service] starting', { pid: process.pid })

  // Le service possède ses fichiers de blocage dans C:\ProgramData\Nexus (spec §4.4).
  const storage = createStorage(serviceDataDir())
  const host = createBlockingHost(createBlockingAdapters(storage))

  const server: BridgeServer = await createBridgeServer({
    handlers: {
      PING: async () => 'pong',
      GET_SERVICE_INFO: async (): Promise<ServiceInfo> => ({
        version: SERVICE_VERSION,
        pid: process.pid,
        uptimeMs: Date.now() - startedAt,
      }),
      ...createBlockingHandlers(host),
    },
    onError: (err) => log.error('[service] bridge error', err),
  })

  // Câblé avant hydrate() : si l'hydratation ré-applique une session, son
  // événement SESSION_CHANGED est diffusé aux clients déjà connectés.
  host.on((event) => {
    server.broadcast({ type: event.type, payload: event.payload })
  })

  await host.hydrate()
  log.info('[service] bridge listening, blocking host ready')

  const shutdown = (signal: string): void => {
    log.info('[service] shutting down', { signal })
    host.stop()
    void server.close().then(() => process.exit(0))
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((err) => {
  log.error('[service] fatal', err)
  process.exit(1)
})
```

- [ ] **Step 2: Typecheck complet**

Run: `npm run typecheck`
Expected: PASS (node + web).

- [ ] **Step 3: Lint + tests**

Run: `npm run lint && npm run test`
Expected: `lint` PASS ; `test` **152 passed** (134 du Lot 2 + 18 ajoutés au Lot 3).

- [ ] **Step 4: Builds**

Run: `npm run build:service`
Expected: PASS — produit `out/service/index.js` (le bundle inclut désormais le host
de blocage et ses adapters).

Run: `npm run build`
Expected: la partie `electron-vite build` PASS ; l'étape `electron-builder` échoue
dans le worktree (limite d'environnement connue, cf. Task 1 Step 6).

- [ ] **Step 5: Vérifier l'absence de couplage `@main` dans le service**

Run (Grep) : chercher `@main` dans `src/service/`.
Expected : **aucun résultat** — le service est entièrement découplé du `main`.

- [ ] **Step 6: Commit**

```bash
git add src/service/index.ts
git commit -m "feat(service): câbler le host de blocage au pont nommé (Lot 3)"
```

---

## Vérification de fin de lot

État attendu après la Task 5 :
- `src/service/storage/` contient le module storage ; `src/main/storage/` n'existe
  plus ; aucun import `@main/storage` ne subsiste.
- `src/service/` ne contient **aucun** import `@main` (ni runtime, ni type-only).
- `src/service/blocking-host.ts` exporte `createBlockingHost` et `createBlockingHandlers` ;
  `src/service/blocking-adapters.ts` exporte `createProcessControl` et
  `createBlockingAdapters`.
- `src/service/index.ts` instancie le host, expose les 7 commandes de blocage sur le
  pont (`GET_STATE`, `SAVE_PROFILE`, `DELETE_PROFILE`, `START_SESSION`,
  `REQUEST_UNLOCK`, `SUBMIT_JUSTIFICATION`, `GET_LAYER_STATUS`) et diffuse les
  événements (`SESSION_CHANGED`, `SESSION_ENDED`, `LAYER_DRIFT`, `CLOCK_TAMPER`,
  `BREAK_REQUIRED`).
- 4 portes vertes : `typecheck` (node + web), `lint`, `electron-vite build`,
  `build:service` ; `test` = 152.
- **Comportement de l'app utilisateur strictement identique à avant le lot** : le
  `main` bloque toujours via `blocking.handlers.ts` (inchangé) ; le service n'est
  joint qu'à la main via `npm run dev:service`. La bascule est le Lot 4.

Validation d'intégration manuelle (optionnelle, spec §10) : `npm run dev:service`
démarre le service ; un client peut envoyer `START_SESSION` / `GET_LAYER_STATUS` sur
`\\.\pipe\NexusServiceBridge` et constater que le blocage réel s'applique.

## Lot suivant (hors de ce plan)

**Lot 4 — Bascule de l'UI :** `blocking.handlers.ts` devient un relais du pipe (chaque
`ipcMain.handle(BLOCKING_*)` appelle `serviceClient.request(...)`) ; les `ServiceEvent`
reçus sont re-`webContents.send` sur les canaux `BLOCKING_EVENT_*` ; l'UI gère les
notifications et l'écriture de `stats` sur `SESSION_ENDED` ; le blocage est retiré du
`main` ; le service est lancé en process détaché au démarrage ; les fichiers
`nexus_blocking*.json` sont migrés vers `C:\ProgramData\Nexus`.
