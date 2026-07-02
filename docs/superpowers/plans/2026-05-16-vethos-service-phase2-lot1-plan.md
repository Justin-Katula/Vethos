# Phase 2 — Lot 1 : Relocalisation du moteur de blocage

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Déplacer le moteur de blocage de `src/main/blocking/` vers `src/service/blocking/`, sans changer aucun comportement, pour que le service puisse l'utiliser dans les lots suivants.

**Architecture:** Pur refactor de relocalisation, fait en **un seul déplacement atomique**. Les modules moteur (hosts, firewall, processes, applocker, et la session sauf `persistence.ts`) se référencent entre eux par chemins relatifs — ils doivent donc être déplacés tous ensemble dans le même commit, sinon le build casse entre deux étapes. Les deux consommateurs externes (`ipc/blocking.handlers.ts` et `tracking/handlers.ts`, qui **restent** dans le `main`) voient leurs imports repointés vers l'alias `@service`. Aucune ligne de logique modifiée.

**Tech Stack:** TypeScript, electron-vite, Vitest, `git mv`.

---

## Contexte & périmètre

Ce plan est le **Lot 1 du palier 2a** du sous-projet P16 (service Windows).
Réf. spec : `docs/superpowers/specs/2026-05-15-vethos-windows-service-design.md` §6.

**Ce que Lot 1 fait :** relocaliser le code, rien d'autre. Comportement strictement
identique. `npm run build`, `npm run build:service`, `npm run typecheck`,
`npm run lint`, `npm run test` (134 tests) doivent rester verts. **Rien ne change
pour l'utilisateur.**

**Ce que Lot 1 ne fait PAS** (lots suivants) :
- Découpler les modules d'Electron / `@main` (Lot 2). Les fichiers déplacés
  gardent **temporairement** leurs imports `@main/logging/setup` et `electron` —
  c'est volontaire : ils ne sont encore compilés/exécutés que dans le process
  `main` (le bundle service ne les importe pas encore). Le découplage se fera au
  Lot 2. **Un reviewer ne doit PAS signaler ces imports `@main`/`electron` comme
  un bug — ils sont transitoires et documentés ici.**
- Construire le host de blocage du service (Lot 2).
- Basculer l'UI vers le service (Lot 2b).

**Pourquoi un déplacement atomique :** `session/drift-detector.ts` importe
`../hosts/writer`, `../hosts/parser`, `../hosts/flush-dns`, `../firewall/netsh`.
Si on déplaçait `hosts/` sans déplacer `drift-detector.ts` en même temps, ces
imports relatifs pointeraient dans le vide. Tout le moteur bouge donc en une fois.

## Structure de fichiers

```
DÉPLACÉ (git mv) — src/main/blocking/  →  src/service/blocking/ :
  hosts/                  (flush-dns, parser+test, sentinels, subdomains, writer+test)
  firewall/               (netsh+test, rule-tracker)
  processes/              (enumerator+test, killer, safe-list)
  applocker/              (policy+test)
  session/manager.ts (+test)
  session/drift-detector.ts
  session/clock-monitor.ts
  session/timer.ts
  session/types.ts
  session/rules.ts (+test)
  session/locks/          (cooldown, justification, locks.test)

RESTE dans src/main/blocking/ :
  elevation.ts            (couplé Electron : dialog/app — concerne l'UI)
  session/persistence.ts  (couplé Electron + storage — traité au Lot 2)
  ipc/blocking.handlers.ts (handler IPC du main — devient le relais au Lot 2b)

MODIFIÉ :
  electron.vite.config.ts                   (+ alias @service au build main)
  src/main/blocking/ipc/blocking.handlers.ts (imports moteur repointés vers @service)
  src/main/tracking/handlers.ts              (import processes/enumerator repointé)
```

`tsconfig.node.json` et `vitest.config.{ts,mjs}` connaissent déjà l'alias
`@service` et incluent `src/service/**` (posé en Phase 1) — aucune modification.

---

## Task 1: Alias `@service` pour le build main

**Files:**
- Modify: `electron.vite.config.ts`

- [ ] **Step 1: Ajouter l'alias `@service` au build `main`**

Dans `electron.vite.config.ts`, section `main.resolve.alias`, remplacer :

```ts
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@shared': resolve('src/shared'),
      },
    },
    build: {
      outDir: 'out/main',
    },
```

par :

```ts
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@shared': resolve('src/shared'),
        '@service': resolve('src/service'),
      },
    },
    build: {
      outDir: 'out/main',
    },
```

(Sans cet alias, le bundle `main` ne pourra pas résoudre les imports `@service/...`
ajoutés à la Task 2.)

- [ ] **Step 2: Vérifier le typecheck**

Run: `npm run typecheck:node`
Expected: PASS (aucune erreur — changement de config uniquement).

- [ ] **Step 3: Commit**

```bash
git add electron.vite.config.ts
git commit -m "chore(service): alias @service pour le build main"
```

---

## Task 2: Déplacer le moteur de blocage (atomique)

**Files:**
- Move: les modules moteur de `src/main/blocking/` → `src/service/blocking/`
- Modify: `src/main/blocking/ipc/blocking.handlers.ts`
- Modify: `src/main/tracking/handlers.ts`

- [ ] **Step 1: Déplacer tous les modules moteur en une fois**

Depuis la racine du worktree, exécuter (`persistence.ts` reste — il n'est PAS dans
la liste) :

```bash
mkdir -p src/service/blocking/session
git mv src/main/blocking/hosts src/service/blocking/hosts
git mv src/main/blocking/firewall src/service/blocking/firewall
git mv src/main/blocking/processes src/service/blocking/processes
git mv src/main/blocking/applocker src/service/blocking/applocker
git mv src/main/blocking/session/manager.ts src/service/blocking/session/manager.ts
git mv src/main/blocking/session/manager.test.ts src/service/blocking/session/manager.test.ts
git mv src/main/blocking/session/drift-detector.ts src/service/blocking/session/drift-detector.ts
git mv src/main/blocking/session/clock-monitor.ts src/service/blocking/session/clock-monitor.ts
git mv src/main/blocking/session/timer.ts src/service/blocking/session/timer.ts
git mv src/main/blocking/session/types.ts src/service/blocking/session/types.ts
git mv src/main/blocking/session/rules.ts src/service/blocking/session/rules.ts
git mv src/main/blocking/session/rules.test.ts src/service/blocking/session/rules.test.ts
git mv src/main/blocking/session/locks src/service/blocking/session/locks
```

Après ça, `src/main/blocking/` ne contient plus que `elevation.ts`,
`session/persistence.ts` et `ipc/blocking.handlers.ts`. Le build est cassé jusqu'à
la fin de la Task 2 — c'est normal, on le répare aux steps suivants.

- [ ] **Step 2: Repointer les imports moteur dans `blocking.handlers.ts`**

Dans `src/main/blocking/ipc/blocking.handlers.ts`, remplacer **tout le bloc
d'imports (lignes 1 à 30)** :

```ts
import { ipcMain, type BrowserWindow } from 'electron'
import { promises as fsp } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import { BlockingProfileSchema } from '@shared/schemas'
import type { Storage } from '@main/storage'
import { createSessionManager } from '../session/manager'
import { createDriftDetector } from '../session/drift-detector'
import { createFirewallTracker } from '../firewall/rule-tracker'
import { listRuleNames } from '../firewall/netsh'
import { applyVethosBlock, clearVethosBlock } from '../hosts/writer'
import { HOSTS_PATH } from '../hosts/writer'
import { parseHostsFile } from '../hosts/parser'
import { flushDns } from '../hosts/flush-dns'
import { createBlockingPersistence } from '../session/persistence'
import { isElevated, requestElevatedRelaunch } from '../elevation'
import { isSafeListed } from '../processes/safe-list'
import { startProcessKiller } from '../processes/killer'
import { getWindowsEdition, pickBlockingStrategy, startAppLockerBlocker } from '../applocker/policy'
import { evaluateSessionRules } from '../session/rules'
import {
  notifyBreakRequired,
  notifyClockTamper,
  notifyServiceNotStarted,
  notifySessionEnd,
  notifySessionStart,
} from '../../notifications'
import { startClockMonitor } from '../session/clock-monitor'
import log from '@main/logging/setup'
import { getPreviousFreeMinutesByDate } from '@main/free-time/recalculate'
```

par :

```ts
import { ipcMain, type BrowserWindow } from 'electron'
import { promises as fsp } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { IPC_CHANNELS } from '@shared/ipc-channels'
import { BlockingProfileSchema } from '@shared/schemas'
import type { Storage } from '@main/storage'
import { createSessionManager } from '@service/blocking/session/manager'
import { createDriftDetector } from '@service/blocking/session/drift-detector'
import { createFirewallTracker } from '@service/blocking/firewall/rule-tracker'
import { listRuleNames } from '@service/blocking/firewall/netsh'
import { applyVethosBlock, clearVethosBlock } from '@service/blocking/hosts/writer'
import { HOSTS_PATH } from '@service/blocking/hosts/writer'
import { parseHostsFile } from '@service/blocking/hosts/parser'
import { flushDns } from '@service/blocking/hosts/flush-dns'
import { createBlockingPersistence } from '../session/persistence'
import { isElevated, requestElevatedRelaunch } from '../elevation'
import { isSafeListed } from '@service/blocking/processes/safe-list'
import { startProcessKiller } from '@service/blocking/processes/killer'
import { getWindowsEdition, pickBlockingStrategy, startAppLockerBlocker } from '@service/blocking/applocker/policy'
import { evaluateSessionRules } from '@service/blocking/session/rules'
import {
  notifyBreakRequired,
  notifyClockTamper,
  notifyServiceNotStarted,
  notifySessionEnd,
  notifySessionStart,
} from '../../notifications'
import { startClockMonitor } from '@service/blocking/session/clock-monitor'
import log from '@main/logging/setup'
import { getPreviousFreeMinutesByDate } from '@main/free-time/recalculate'
```

Seuls les imports du moteur changent. `createBlockingPersistence` (`../session/persistence`),
`isElevated`/`requestElevatedRelaunch` (`../elevation`) et les `notify*`
(`../../notifications`) restent inchangés. Aucune autre ligne du fichier n'est touchée.

- [ ] **Step 3: Repointer l'import dans `tracking/handlers.ts`**

Dans `src/main/tracking/handlers.ts`, remplacer :

```ts
import { listProcesses } from '../blocking/processes/enumerator'
```

par :

```ts
import { listProcesses } from '@service/blocking/processes/enumerator'
```

- [ ] **Step 4: Vérifier typecheck + tests**

Run: `npm run typecheck:node && npm run test`
Expected: typecheck PASS (le déplacement est complet et cohérent) ; tests
**134 passed** (les tests `*.test.ts` déplacés tournent depuis `src/service/blocking/`,
vitest les inclut déjà via `src/service/**/*.test.ts`).

Si typecheck échoue sur un import non résolu : un module moteur en importait un
autre par un chemin qui n'a pas suivi — vérifier le message, corriger l'import
vers `@service/blocking/...` ou le chemin relatif correct, et relancer.

- [ ] **Step 5: Vérification finale complète**

Run: `npm run typecheck && npm run lint && npm run build && npm run build:service`
Expected : tout PASS — `typecheck` (node + web) sans erreur ; `lint` sans erreur ;
`npm run build` produit les bundles main/preload/renderer ; `npm run build:service`
produit `out/service/index.js`. (Les avertissements pré-existants
`MODULE_TYPELESS_PACKAGE_JSON` et « CJS build of Vite deprecated » sont du bruit
attendu, pas des erreurs.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(service): relocaliser le moteur de blocage vers src/service/blocking"
```

---

## Vérification de fin de lot

État attendu après la Task 2 :
- `src/service/blocking/` contient `hosts/`, `firewall/`, `processes/`,
  `applocker/`, `session/` (sans `persistence.ts`).
- `src/main/blocking/` ne contient plus que `elevation.ts`,
  `session/persistence.ts`, `ipc/blocking.handlers.ts`.
- `blocking.handlers.ts` importe le moteur via `@service/blocking/...` ;
  `persistence`/`elevation` via leurs chemins relatifs locaux inchangés.
- `tracking/handlers.ts` importe `listProcesses` via `@service/blocking/...`.
- 4 gates verts : `typecheck`, `lint`, `build`, `build:service` ; `test` = 134.
- Comportement de l'app strictement identique à avant le lot.

## Lot suivant (hors de ce plan)

**Lot 2 — Le service exécute le blocage** : découpler les modules déplacés
d'Electron/`@main` (logger, `app.getPath`), relocaliser et découpler
`persistence.ts`, construire le host de blocage du service
(`src/service/blocking-host.ts`), étendre le protocole du pont, et faire répondre
le service aux commandes de blocage sur le named pipe. Puis **Lot 2b** : bascule
de l'UI + suppression du blocage du `main`.
