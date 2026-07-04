# Phase 2 — Lot 2 : Découplage du moteur de blocage

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Supprimer les couplages d'exécution à Electron et `@main` des modules moteur déjà relocalisés dans `src/service/blocking/`, pour que le service puisse les exécuter — sans changer aucun comportement.

**Architecture:** Refactor de découplage, behavior-preserving. Deux petits modules neufs : `engine-log.ts` (logger basé sur `electron-log/node`, valable dans le `main` comme dans le service) et `blocking-paths.ts` (répertoire de données configurable, qui remplace `app.getPath('userData')`). `persistence.ts` est déplacé dans `src/service/blocking/session/` et découplé d'`electron`. Le `main` appelle `setBlockingDataDir(app.getPath('userData'))` au démarrage, ce qui garde exactement son comportement actuel.

**Tech Stack:** TypeScript, electron-log/node, Vitest, git mv.

---

## Contexte & périmètre

Ce plan est le **Lot 2** du palier 2 du sous-projet P16 (service Windows).
Le Lot 1 (relocalisation) est fait. Numérotation des lots restants : **Lot 2**
(découplage, ce plan) ; **Lot 3** (host de blocage du service + protocole, le
service bloque en autonomie) ; **Lot 4** (bascule de l'UI — l'« ex-2b »).

**Couplages d'exécution à supprimer** (constatés par grep dans `src/service/blocking/`) :
- `hosts/writer.ts` → `import { app } from 'electron'` (utilise `app.getPath('userData')`).
- `session/timer.ts`, `session/clock-monitor.ts`, `processes/killer.ts` → `import log from '@main/logging/setup'`.
- `session/persistence.ts` (encore dans `src/main/blocking/session/`) → `import { app } from 'electron'`.

**Ce que Lot 2 fait :** supprimer ces couplages **runtime**, behavior-preserving.
`npm run typecheck`, `lint`, `build`, `build:service`, `test` (134) restent verts.
**Rien ne change pour l'utilisateur.**

**Ce que Lot 2 ne fait PAS :**
- L'import **type-only** `import type { Storage } from '@main/storage'` dans
  `persistence.ts` est **conservé volontairement** : un import de type est effacé
  à la compilation — aucun couplage à l'exécution. Il sera résolu au Lot 3 (quand
  le module `storage` sera relocalisé). **Un reviewer ne doit PAS signaler cet
  import type-only comme un bug.**
- Construire le host de blocage / étendre le protocole (Lot 3).

**Note logger :** `@main/logging/setup` (electron-log/main) écrit dans `vethos.log`
via l'API Electron `app`. `electron-log/node` (validé en Phase 1) fonctionne dans
tout contexte Node. Conséquence transitoire : tant que le moteur tourne dans le
`main` (jusqu'au Lot 4), ses logs de diagnostic vont dans le fichier par défaut
d'`electron-log/node` au lieu de `vethos.log`. C'est cosmétique (diagnostics
moteur), sans effet sur le comportement de l'app, et correct une fois le moteur
exécuté uniquement par le service.

## Structure de fichiers

```
CRÉÉ :
  src/service/blocking/engine-log.ts      # logger neutre (electron-log/node)
  src/service/blocking/blocking-paths.ts  # répertoire de données configurable

DÉPLACÉ (git mv) :
  src/main/blocking/session/persistence.ts → src/service/blocking/session/persistence.ts

MODIFIÉ :
  src/service/blocking/session/timer.ts          # import logger
  src/service/blocking/session/clock-monitor.ts  # import logger
  src/service/blocking/processes/killer.ts       # import logger
  src/service/blocking/hosts/writer.ts           # retrait electron → blockingDataDir()
  src/service/blocking/session/persistence.ts    # retrait electron → blockingDataDir()
  src/main/blocking/ipc/blocking.handlers.ts     # setBlockingDataDir() + import persistence
```

Après le Lot 2, `src/main/blocking/` ne contient plus que `elevation.ts` et
`ipc/blocking.handlers.ts`.

---

## Task 1: Logger neutre `engine-log.ts`

**Files:**
- Create: `src/service/blocking/engine-log.ts`
- Modify: `src/service/blocking/session/timer.ts`
- Modify: `src/service/blocking/session/clock-monitor.ts`
- Modify: `src/service/blocking/processes/killer.ts`

- [ ] **Step 1: Créer `engine-log.ts`**

Créer `src/service/blocking/engine-log.ts` :

```ts
// Logger du moteur de blocage — utilisable dans le main ET le service.
// electron-log/node fonctionne dans n'importe quel contexte Node, y compris
// sous ELECTRON_RUN_AS_NODE (validé en Phase 1). Évite la dépendance à
// @main/logging/setup, couplé à l'API Electron `app`.
import log from 'electron-log/node'

export default log
```

- [ ] **Step 2: Repointer le logger dans les 3 modules**

Dans `src/service/blocking/session/timer.ts`, remplacer :
```ts
import log from '@main/logging/setup'
```
par :
```ts
import log from '../engine-log'
```

Faire le **même remplacement** dans `src/service/blocking/session/clock-monitor.ts`
(le chemin `../engine-log` est correct : ce fichier est aussi dans `session/`).

Dans `src/service/blocking/processes/killer.ts`, remplacer la même ligne par :
```ts
import log from '../engine-log'
```
(`killer.ts` est dans `processes/`, donc `../engine-log` pointe aussi sur
`src/service/blocking/engine-log.ts`.)

Ne toucher à rien d'autre dans ces fichiers — l'API `log.warn`/`log.error` est
identique.

- [ ] **Step 3: Vérifier**

Run: `npm run typecheck:node && npm run test`
Expected: typecheck PASS ; tests **134 passed**.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(service): logger neutre engine-log pour le moteur de blocage"
```

---

## Task 2: Répertoire de données configurable `blocking-paths.ts`

**Files:**
- Create: `src/service/blocking/blocking-paths.ts`
- Modify: `src/service/blocking/hosts/writer.ts`
- Modify: `src/main/blocking/ipc/blocking.handlers.ts`

- [ ] **Step 1: Créer `blocking-paths.ts`**

Créer `src/service/blocking/blocking-paths.ts` :

```ts
import { serviceDataDir } from '../data-dir'

// Répertoire des fichiers de blocage (backup du hosts, staging, fichier de
// session active). Par défaut : le data dir du service. Le `main` le surcharge
// au démarrage via setBlockingDataDir() pour conserver son comportement actuel
// (userData de l'app) tant que le blocage tourne dans le main — jusqu'au Lot 4.
let dataDir = serviceDataDir()

export function setBlockingDataDir(dir: string): void {
  dataDir = dir
}

export function blockingDataDir(): string {
  return dataDir
}
```

- [ ] **Step 2: Découpler `hosts/writer.ts` d'`electron`**

Dans `src/service/blocking/hosts/writer.ts`, remplacer la ligne d'import :
```ts
import { app } from 'electron'
```
par :
```ts
import { blockingDataDir } from '../blocking-paths'
```

Puis, dans la fonction `ensureBackup`, remplacer :
```ts
  const backupPath = path.join(app.getPath('userData'), 'hosts.vethos.backup')
```
par :
```ts
  const backupPath = path.join(blockingDataDir(), 'hosts.vethos.backup')
```

Puis, dans la fonction `atomicWriteHosts`, remplacer :
```ts
  const stagingPath = path.join(app.getPath('userData'), 'hosts.vethos.staging')
```
par :
```ts
  const stagingPath = path.join(blockingDataDir(), 'hosts.vethos.staging')
```

- [ ] **Step 3: Câbler `setBlockingDataDir` dans `blocking.handlers.ts`**

Dans `src/main/blocking/ipc/blocking.handlers.ts`, remplacer la première ligne :
```ts
import { ipcMain, type BrowserWindow } from 'electron'
```
par :
```ts
import { ipcMain, app, type BrowserWindow } from 'electron'
import { setBlockingDataDir } from '@service/blocking/blocking-paths'
```

Puis, dans `registerBlockingHandlers`, ajouter l'appel `setBlockingDataDir` comme
**toute première instruction** du corps. Remplacer :
```ts
): Promise<{ isSessionActive: () => boolean }> {
  const persistence = createBlockingPersistence(storage)
```
par :
```ts
): Promise<{ isSessionActive: () => boolean }> {
  // Le moteur de blocage tourne encore dans le main (jusqu'au Lot 4) : on lui
  // fait pointer son répertoire de données sur le userData de l'app, comme avant.
  setBlockingDataDir(app.getPath('userData'))
  const persistence = createBlockingPersistence(storage)
```

Ce câblage garantit que les chemins `hosts.vethos.backup` / `hosts.vethos.staging`
restent **identiques** à avant le lot — comportement strictement préservé.

- [ ] **Step 4: Vérifier**

Run: `npm run typecheck:node && npm run test`
Expected: typecheck PASS ; tests **134 passed**.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(service): chemin de données configurable, hosts/writer découplé d'electron"
```

---

## Task 3: Déplacer et découpler `persistence.ts` + vérification finale

**Files:**
- Move: `src/main/blocking/session/persistence.ts` → `src/service/blocking/session/persistence.ts`
- Modify: `src/service/blocking/session/persistence.ts`
- Modify: `src/main/blocking/ipc/blocking.handlers.ts`

- [ ] **Step 1: Déplacer `persistence.ts`**

```bash
git mv src/main/blocking/session/persistence.ts src/service/blocking/session/persistence.ts
```

(Après ça, `src/main/blocking/` ne contient plus que `elevation.ts` et `ipc/`.)

- [ ] **Step 2: Découpler `persistence.ts` d'`electron`**

Dans `src/service/blocking/session/persistence.ts`, remplacer la ligne :
```ts
import { app } from 'electron'
```
par :
```ts
import { blockingDataDir } from '../blocking-paths'
```

Puis, dans la méthode `clearActive`, remplacer :
```ts
      const file = path.join(app.getPath('userData'), 'vethos_blocking_active.json')
```
par :
```ts
      const file = path.join(blockingDataDir(), 'vethos_blocking_active.json')
```

**Conserver** la ligne `import type { Storage } from '@main/storage'` telle quelle :
c'est un import de **type uniquement** (effacé à la compilation, aucun couplage à
l'exécution) — il sera résolu au Lot 3.

- [ ] **Step 3: Repointer l'import de persistence dans `blocking.handlers.ts`**

Dans `src/main/blocking/ipc/blocking.handlers.ts`, remplacer :
```ts
import { createBlockingPersistence } from '../session/persistence'
```
par :
```ts
import { createBlockingPersistence } from '@service/blocking/session/persistence'
```

- [ ] **Step 4: Vérifier le découplage**

Run: `npm run typecheck:node && npm run test`
Expected: typecheck PASS ; tests **134 passed**.

Vérifier qu'il ne reste **aucun** couplage runtime à Electron/`@main` dans le
moteur. Lister les imports `electron` / `@main` de `src/service/blocking/` :

Run (Grep) : chercher `from 'electron'` et `from '@main` dans `src/service/blocking/`.
Expected : **un seul résultat** — `import type { Storage } from '@main/storage'`
dans `session/persistence.ts` (import de type, attendu et documenté). Aucun
`from 'electron'`, aucun `import log from '@main/...'`.

- [ ] **Step 5: Vérification finale complète**

Run: `npm run typecheck && npm run lint && npm run build && npm run build:service`
Expected : `typecheck` (node + web), `lint`, le bundle `electron-vite build` et
`build:service` passent. (L'étape `electron-builder` de `npm run build` échoue
dans le worktree faute d'Electron installé localement — limite d'environnement
connue, sans rapport ; la partie `electron-vite build` doit, elle, réussir. Les
avertissements `MODULE_TYPELESS_PACKAGE_JSON` / « CJS build of Vite deprecated »
sont du bruit attendu.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(service): déplacer et découpler persistence.ts d'electron"
```

---

## Vérification de fin de lot

État attendu après la Task 3 :
- `src/service/blocking/` ne contient aucun import runtime d'`electron` ni de
  `@main/*` — seul subsiste l'import **type-only** `Storage` dans `persistence.ts`.
- `engine-log.ts` et `blocking-paths.ts` existent dans `src/service/blocking/`.
- `persistence.ts` est dans `src/service/blocking/session/`.
- `src/main/blocking/` ne contient plus que `elevation.ts` et `ipc/blocking.handlers.ts`.
- `blocking.handlers.ts` appelle `setBlockingDataDir(app.getPath('userData'))` au
  démarrage → chemins de blocage inchangés.
- `typecheck`, `lint`, `build` (partie electron-vite), `build:service` verts ;
  `test` = 134.
- Comportement de l'app strictement identique à avant le lot.

## Lot suivant (hors de ce plan)

**Lot 3 — Le service exécute le blocage** : relocaliser le module `storage`
(résout l'import type-only restant), construire le host de blocage du service
(`src/service/blocking-host.ts` — manager + adapters + drift + clock monitor),
étendre le protocole du pont, et faire répondre le service aux commandes de
blocage sur le named pipe. Puis **Lot 4** : bascule de l'UI.
