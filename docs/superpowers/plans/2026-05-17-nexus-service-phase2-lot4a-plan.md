# Phase 2 — Lot 4a : Relais UI → service

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformer `blocking.handlers.ts` en relais du pont nommé — le `main` ne fait plus aucun blocage, il relaie chaque appel IPC `BLOCKING_*` vers le service et re-diffuse les événements du service au renderer.

**Architecture:** `registerBlockingHandlers` ne crée plus de moteur (manager, drift, clock, intervalle). Il crée un `ServiceClient`, enregistre les 7 commandes de blocage comme appels `client.request(...)`, et abonne les `ServiceEvent` reçus pour les re-`webContents.send` sur les canaux `BLOCKING_EVENT_*` existants + déclencher les notifications + écrire `stats`. Les canaux `IS_ELEVATED` / `REQUEST_ELEVATION` restent traités localement (l'UI est encore élevée en Phase 2). Le renderer ne change pas.

**Tech Stack:** TypeScript, Electron IPC, named pipe (`ServiceClient`), Vitest.

---

## Contexte & périmètre

Ce plan est le **Lot 4a** du palier 2 du sous-projet P16 (service Windows).
Réf. spec : `docs/superpowers/specs/2026-05-15-nexus-windows-service-design.md` §4.1, §6, §7.
Les Lots 1-3 sont faits : le moteur de blocage vit dans `src/service/`, le service
expose les 7 commandes de blocage sur le named pipe (`createBlockingHandlers`) et
diffuse 5 types d'événements.

Le **Lot 4** (la bascule de l'UI) est scindé en deux :
- **Lot 4a** (ce plan) — `blocking.handlers.ts` devient un relais du pont. Le `main`
  ne bloque plus. Le service est, pour l'instant, lancé **à la main**
  (`npm run dev:service`) ; le relais s'y connecte via le `ServiceClient` (déjà
  doté d'une reconnexion automatique avec backoff).
- **Lot 4b** (plan suivant) — lancement automatique du service en process détaché
  par le `main`, migration des fichiers de blocage vers `C:\ProgramData\Nexus`,
  et packaging (`asarUnpack` du bundle service + `npm run build` qui lance
  `build:service`).

**Ce que Lot 4a fait :**
1. Réécrit `src/main/blocking/ipc/blocking.handlers.ts` en relais : 7 commandes
   relayées, 2 commandes d'élévation gardées en local, 5 événements re-diffusés.
2. Extrait `computeLongestStreak` dans un module pur testable (`src/main/blocking/
   streak.ts`) — c'est la seule logique non triviale du relais.
3. Retire du `main` le ping de diagnostic Phase 1 (`src/main/index.ts`).

**Ce que Lot 4a ne fait PAS** (Lot 4b) :
- Lancer le service automatiquement (il reste lancé via `npm run dev:service`).
- Migrer les fichiers vers `C:\ProgramData\Nexus`.
- Toucher au packaging / `electron-builder.yml`.

**Décisions de conception (verrouillées) :**
- **`IS_ELEVATED` / `REQUEST_ELEVATION` restent locaux.** Ces canaux concernent
  l'élévation de l'UI elle-même, pas le service ; ils n'ont pas d'équivalent dans
  le protocole du pont. En Phase 2 l'UI reste élevée (spec §11) — le `main` répond
  donc lui-même via `isElevated()` / `requestElevatedRelaunch()`.
- **Le payload `START_SESSION` est enrichi par le relais.** Le renderer envoie
  `{ profileId, durationMinutes }` (inchangé). Le relais lit `settings` (fichier
  possédé par l'UI) et complète avec `sessionRulesEnabled` / `strictBlocking`
  avant de relayer — c'est le contrat du protocole (spec §4.3).
- **`stats` reste écrit côté UI.** Le service émet `SESSION_ENDED { entry, session }` ;
  le relais déclenche `notifySessionEnd` et met `nexus_stats.json` à jour. Pour la
  série (`longestStreak`), il récupère l'historique via une requête `GET_STATE`.
- **Perte mineure assumée :** l'ancien handler `START_SESSION` déclenchait une
  notification `notifyBreakRequired` quand une règle de session refusait le
  démarrage. Le service renvoie maintenant l'erreur en texte ; le relais la
  laisse remonter (le renderer l'affiche en ligne) mais ne déclenche plus de
  notification native sur ce chemin précis. Les notifications `BREAK_REQUIRED`
  *en cours de session* (via l'événement) sont conservées.
- **Pas de test unitaire du relais.** `blocking.handlers.ts` importe `electron`
  (`ipcMain`) — non chargeable sous Vitest (`environment: node`). Le relais est
  vérifié par `typecheck` + la suite existante qui reste verte + l'intégration
  manuelle (spec §10). Seule la logique pure (`computeLongestStreak`) est extraite
  et testée.

## Structure de fichiers

```
CRÉÉ :
  src/main/blocking/streak.ts        # computeLongestStreak(history) — pur, sans electron
  src/main/blocking/streak.test.ts   # tests de la série

RÉÉCRIT :
  src/main/blocking/ipc/blocking.handlers.ts   # 318 lignes de moteur → ~130 lignes de relais

MODIFIÉ :
  src/main/index.ts                  # retrait du bloc ping de diagnostic Phase 1
```

`src/main/**` est déjà couvert par `tsconfig.node.json` et par les `vitest.config`
(`include: src/main/**/*.test.ts`) — aucune config à modifier.

---

## Task 1: Extraire `computeLongestStreak` dans un module pur

**Files:**
- Create: `src/main/blocking/streak.ts`
- Test: `src/main/blocking/streak.test.ts`

`computeLongestStreak` existe aujourd'hui dans `blocking.handlers.ts` (lignes 296-318)
et prend un `persistence` dont il lit l'historique. Le relais n'a plus de
`persistence` — il obtiendra l'historique via `GET_STATE`. On extrait donc la
fonction sous une forme **pure** (`history` en paramètre), dans un fichier sans
import `electron` pour qu'elle soit testable sous Vitest.

- [ ] **Step 1: Écrire le test (échouera — module absent)**

Créer `src/main/blocking/streak.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import type { BlockingHistoryEntry } from '@shared/schemas'
import { computeLongestStreak } from './streak'

function entry(endedAt: string, completedNormally = true): BlockingHistoryEntry {
  return {
    sessionId: crypto.randomUUID(),
    profileId: crypto.randomUUID(),
    startedAt: endedAt,
    endedAt,
    completedNormally,
  }
}

describe('computeLongestStreak', () => {
  it('renvoie 0 pour un historique vide', () => {
    expect(computeLongestStreak([])).toBe(0)
  })

  it('renvoie 1 pour une seule session terminée normalement', () => {
    expect(computeLongestStreak([entry('2026-05-13T10:00:00.000Z')])).toBe(1)
  })

  it('compte les jours consécutifs', () => {
    const streak = computeLongestStreak([
      entry('2026-05-11T10:00:00.000Z'),
      entry('2026-05-12T10:00:00.000Z'),
      entry('2026-05-13T10:00:00.000Z'),
    ])
    expect(streak).toBe(3)
  })

  it('un jour manquant casse la série', () => {
    const streak = computeLongestStreak([
      entry('2026-05-11T10:00:00.000Z'),
      entry('2026-05-12T10:00:00.000Z'),
      // 2026-05-13 manquant
      entry('2026-05-14T10:00:00.000Z'),
    ])
    expect(streak).toBe(2)
  })

  it('ignore les sessions non terminées normalement', () => {
    const streak = computeLongestStreak([
      entry('2026-05-11T10:00:00.000Z', true),
      entry('2026-05-12T10:00:00.000Z', false),
      entry('2026-05-13T10:00:00.000Z', true),
    ])
    // 11 et 13 comptent, 12 non → pas de série de 3, max = 1
    expect(streak).toBe(1)
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm run test -- src/main/blocking/streak.test.ts`
Expected: FAIL — `Failed to resolve import "./streak"`.

- [ ] **Step 3: Écrire `streak.ts`**

Créer `src/main/blocking/streak.ts` :

```ts
import type { BlockingHistoryEntry } from '@shared/schemas'

/**
 * Plus longue série de jours calendaires consécutifs comptant au moins une
 * session terminée normalement. Alimente la statistique `longestStreak`.
 * Logique extraite telle quelle de l'ancien `blocking.handlers.ts` — prend
 * désormais l'historique en paramètre (le relais l'obtient via GET_STATE).
 */
export function computeLongestStreak(history: BlockingHistoryEntry[]): number {
  const days = [
    ...new Set(
      history
        .filter((entry) => entry.completedNormally)
        .map((entry) => {
          const date = new Date(entry.endedAt)
          return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
        }),
    ),
  ].sort((a, b) => a - b)

  let longest = 0
  let current = 0
  let prev: number | null = null
  for (const day of days) {
    current = prev !== null && day - prev === 86_400_000 ? current + 1 : 1
    longest = Math.max(longest, current)
    prev = day
  }
  return longest
}
```

- [ ] **Step 4: Lancer le test + le typecheck**

Run: `npm run typecheck:node && npm run test -- src/main/blocking/streak.test.ts`
Expected: typecheck PASS ; **5 tests passed**.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/blocking/streak.ts src/main/blocking/streak.test.ts
git commit -m "refactor(main): extraire computeLongestStreak dans un module pur (Lot 4a)"
```

---

## Task 2: Réécrire `blocking.handlers.ts` en relais du pont

**Files:**
- Rewrite: `src/main/blocking/ipc/blocking.handlers.ts`

Le relais remplace intégralement l'ancien moteur. Il garde la même signature
`registerBlockingHandlers(storage, getMainWindow): Promise<{ isSessionActive }>`
— `registerAllIpcHandlers` (`src/main/ipc/index.ts`) n'a donc pas à changer.

- [ ] **Step 1: Remplacer tout le contenu de `blocking.handlers.ts`**

Remplacer **l'intégralité** de `src/main/blocking/ipc/blocking.handlers.ts` par :

```ts
import { ipcMain, type BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import type { ServiceEvent } from '@shared/service-protocol'
import type { ActiveSession, BlockingHistoryEntry } from '@shared/schemas'
import type { Storage } from '@service/storage'
import { createServiceClient } from '../../service-client/client'
import { isElevated, requestElevatedRelaunch } from '../elevation'
import { computeLongestStreak } from '../streak'
import {
  notifyBreakRequired,
  notifyClockTamper,
  notifySessionEnd,
  notifySessionStart,
} from '../../notifications'
import log from '@main/logging/setup'

/**
 * Relais de blocage : le blocage tourne dans le service Windows (cf. Lot 3).
 * Le `main` ne fait plus aucun blocage — il relaie les appels IPC `BLOCKING_*`
 * du renderer vers le service via le named pipe, et re-diffuse au renderer les
 * événements du service. Réf. spec §4.1, §6.
 */
export async function registerBlockingHandlers(
  storage: Storage,
  getMainWindow: () => BrowserWindow | null,
): Promise<{ isSessionActive: () => boolean }> {
  const client = createServiceClient()
  let sessionActive = false

  // ── Commandes renderer → service ─────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.BLOCKING_GET_INITIAL_STATE, () => client.request('GET_STATE'))

  ipcMain.handle(IPC_CHANNELS.BLOCKING_SAVE_PROFILE, (_e, draft: unknown) =>
    client.request('SAVE_PROFILE', draft),
  )

  ipcMain.handle(IPC_CHANNELS.BLOCKING_DELETE_PROFILE, (_e, id: string) =>
    client.request('DELETE_PROFILE', { id }),
  )

  ipcMain.handle(
    IPC_CHANNELS.BLOCKING_START_SESSION,
    async (_e, args: { profileId: string; durationMinutes: number }) => {
      // strictBlocking / sessionRulesEnabled vivent dans settings (côté UI) ;
      // le service en a besoin → on enrichit le payload (spec §4.3).
      const settings = await storage.read('settings')
      const session = (await client.request('START_SESSION', {
        profileId: args.profileId,
        durationMinutes: args.durationMinutes,
        sessionRulesEnabled: settings?.sessionRulesEnabled !== false,
        strictBlocking: settings?.strictBlocking !== false,
      })) as ActiveSession
      notifySessionStart(
        session.profileSnapshot.name,
        session.durationMinutes ?? args.durationMinutes,
        getMainWindow,
      )
      return session
    },
  )

  ipcMain.handle(IPC_CHANNELS.BLOCKING_REQUEST_UNLOCK, () => client.request('REQUEST_UNLOCK'))

  ipcMain.handle(IPC_CHANNELS.BLOCKING_SUBMIT_JUSTIFICATION, (_e, text: string) =>
    client.request('SUBMIT_JUSTIFICATION', { text }),
  )

  ipcMain.handle(IPC_CHANNELS.BLOCKING_GET_LAYER_STATUS, () => client.request('GET_LAYER_STATUS'))

  // Élévation : concerne l'UI elle-même (encore élevée en Phase 2), pas le
  // service — pas d'équivalent protocole, traité localement.
  ipcMain.handle(IPC_CHANNELS.BLOCKING_IS_ELEVATED, () => isElevated())
  ipcMain.handle(IPC_CHANNELS.BLOCKING_REQUEST_ELEVATION, () => requestElevatedRelaunch())

  // ── Événements service → renderer ────────────────────────────────────────

  async function handleSessionEnded(payload: {
    entry: BlockingHistoryEntry
    session: ActiveSession
  }): Promise<void> {
    const { entry, session } = payload
    if (!entry.completedNormally) return
    const durationMin = Math.max(
      0,
      Math.round(
        (new Date(entry.endedAt).getTime() - new Date(entry.startedAt).getTime()) / 60_000,
      ),
    )
    notifySessionEnd(session.profileSnapshot.name, durationMin, getMainWindow)
    const { state } = (await client.request('GET_STATE')) as {
      state: { history: BlockingHistoryEntry[] }
    }
    const stats = await storage.read('stats')
    await storage.write('stats', {
      totalFocusMinutes: (stats?.totalFocusMinutes ?? 0) + durationMin,
      totalSessions: (stats?.totalSessions ?? 0) + 1,
      longestStreak: Math.max(stats?.longestStreak ?? 0, computeLongestStreak(state.history)),
      lastUpdated: new Date().toISOString(),
    })
  }

  async function handleServiceEvent(event: ServiceEvent): Promise<void> {
    const win = getMainWindow()
    switch (event.type) {
      case 'SESSION_CHANGED':
        sessionActive = event.payload !== null
        win?.webContents.send(IPC_CHANNELS.BLOCKING_EVENT_SESSION_CHANGED, event.payload)
        return
      case 'SESSION_ENDED':
        await handleSessionEnded(
          event.payload as { entry: BlockingHistoryEntry; session: ActiveSession },
        )
        return
      case 'LAYER_DRIFT':
        win?.webContents.send(IPC_CHANNELS.BLOCKING_EVENT_LAYER_DRIFT, event.payload)
        return
      case 'CLOCK_TAMPER': {
        const payload = event.payload as { driftMs: number }
        win?.webContents.send(IPC_CHANNELS.BLOCKING_EVENT_CLOCK_TAMPER, payload)
        notifyClockTamper(payload.driftMs, getMainWindow)
        return
      }
      case 'BREAK_REQUIRED': {
        const payload = event.payload as { reason: string; restMinutes: number }
        win?.webContents.send(IPC_CHANNELS.BLOCKING_EVENT_BREAK_REQUIRED, payload)
        notifyBreakRequired(payload.restMinutes, getMainWindow)
        return
      }
      default:
        log.warn('[blocking-relay] événement service inconnu', event.type)
    }
  }

  // `.catch` obligatoire : `onEvent` est fire-and-forget ; une rejection non
  // capturée déclencherait le `unhandledRejection` global du main (app.exit).
  client.onEvent((event) => {
    handleServiceEvent(event).catch((err) => {
      log.error('[blocking-relay] échec du traitement d un événement service', err)
    })
  })

  return { isSessionActive: () => sessionActive }
}
```

Notes pour l'implémenteur :
- Le `setBlockingDataDir(...)` de l'ancien fichier disparaît : le `main` ne bloque
  plus, le service utilise son propre répertoire de données par défaut.
- `computeLongestStreak` n'est plus défini ici — il est importé de `../streak`
  (créé en Task 1).
- L'export `setBlockingDataDir` de `@service/blocking/blocking-paths` n'a plus
  d'appelant côté `main` après ce lot. Le laisser tel quel (toujours utilisé par
  le service ; un export sans appelant n'est pas une erreur).

- [ ] **Step 2: Vérifier typecheck + lint**

Run: `npm run typecheck:node && npm run lint`
Expected: typecheck PASS ; lint PASS.

Si le typecheck signale un import non résolu : vérifier que `../streak`
(`src/main/blocking/streak.ts`) et `../../service-client/client`
(`src/main/service-client/client.ts`) existent bien.

- [ ] **Step 3: Vérifier que la suite de tests reste verte**

Run: `npm run test`
Expected: **161 passed** (156 du Lot 3 + 5 ajoutés par `streak.test.ts` en Task 1).
Aucun test ne dépend de l'ancien moteur de `blocking.handlers.ts` (ce fichier
n'avait pas de test).

- [ ] **Step 4: Commit**

```bash
git add src/main/blocking/ipc/blocking.handlers.ts
git commit -m "feat(main): blocking.handlers.ts devient un relais du pont service (Lot 4a)"
```

---

## Task 3: Retirer le ping de diagnostic Phase 1 + vérification finale

**Files:**
- Modify: `src/main/index.ts`

Le `main` contient encore un bloc Phase 1 qui crée un `ServiceClient` jetable
juste pour pinguer `GET_SERVICE_INFO` et logger si le service répond. Le relais
(Task 2) crée désormais son propre client ; ce ping n'a plus de raison d'être.

- [ ] **Step 1: Retirer le bloc ping et son import**

Dans `src/main/index.ts`, supprimer la ligne d'import (ligne 10) :

```ts
import { createServiceClient } from './service-client/client'
```

Puis supprimer le bloc suivant (à l'intérieur de `app.whenReady().then(...)`) :

```ts
  // Phase 1 P16 : on vérifie seulement que le pont service répond.
  // Le blocage reste dans le main jusqu'à la Phase 2.
  const serviceClient = createServiceClient()
  setTimeout(() => {
    serviceClient
      .request('GET_SERVICE_INFO')
      .then((info) => log.info('[main] service joignable', info))
      .catch((err) => log.warn('[main] service injoignable', err.message))
  }, 1500)

```

Ne toucher à rien d'autre dans `index.ts`. L'import `IPC_CHANNELS` (ligne 11)
reste utilisé ailleurs dans le fichier — ne pas le retirer.

- [ ] **Step 2: Typecheck complet + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS (node + web). Le `lint` confirme qu'il ne reste pas d'import ou
de variable inutilisés dans `index.ts` après le retrait.

- [ ] **Step 3: Suite de tests**

Run: `npm run test`
Expected: **161 passed**.

- [ ] **Step 4: Builds**

Run: `npm run build:service`
Expected: PASS — `out/service/index.js`.

Run: `npm run build`
Expected: la partie `electron-vite build` (main/preload/renderer) PASS. L'étape
`electron-builder` échoue dans le worktree faute d'Electron packagé localement —
limite d'environnement connue, sans rapport avec ce lot.

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts
git commit -m "chore(main): retirer le ping de diagnostic service Phase 1 (Lot 4a)"
```

---

## Vérification de fin de lot

État attendu après la Task 3 :
- `src/main/blocking/ipc/blocking.handlers.ts` ne contient plus aucun import de
  moteur (`@service/blocking/session/manager`, `drift-detector`, `clock-monitor`,
  etc.) — uniquement le `ServiceClient`, les notifications, l'élévation et `streak`.
- Le `main` ne crée plus de `createSessionManager` / `createDriftDetector` /
  `startClockMonitor` ni d'intervalle de règles ni de `hydrateFromDisk`.
- Les 7 commandes de blocage du renderer sont relayées vers le service ; les
  2 commandes d'élévation restent locales ; les 5 événements du service sont
  re-diffusés sur les canaux `BLOCKING_EVENT_*`.
- `index.ts` n'a plus de ping de diagnostic Phase 1.
- 4 portes vertes : `typecheck` (node + web), `lint`, `electron-vite build`,
  `build:service` ; `test` = 161.

**Validation d'intégration manuelle (spec §10) :** lancer `npm run dev:service`
dans un terminal, puis `npm run dev` dans un autre. Créer un profil, démarrer une
session : le blocage doit s'appliquer (c'est le service qui l'exécute). Tuer le
process UI : les règles hosts/firewall posées par le service restent en place —
le service n'étant pas tué, le blocage tient. C'est le payoff de la Phase 2.

## Lot suivant (hors de ce plan)

**Lot 4b — Lancement automatique + migration + packaging :** le `main` lance le
service en process détaché au démarrage (ping d'abord ; spawn si absent ;
`ELECTRON_RUN_AS_NODE`, `detached`, `unref`) ; migration idempotente des
`nexus_blocking*.json` + `hosts.nexus.backup` de `%APPDATA%` vers
`C:\ProgramData\Nexus` avant le lancement ; `asarUnpack` du bundle service dans
`electron-builder.yml` + `npm run build` qui enchaîne `build:service`. À l'issue
du Lot 4b, la Phase 2 est complète et mergée dans `master`.
