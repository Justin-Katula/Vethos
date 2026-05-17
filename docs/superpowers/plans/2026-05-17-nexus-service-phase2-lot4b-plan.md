# Phase 2 — Lot 4b : Lancement automatique du service + migration + packaging

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Le `main` lance automatiquement le service de blocage en process détaché et migre les données de blocage vers `C:\ProgramData\Nexus` — à la fin du Lot 4b, tuer l'UI ne stoppe plus le blocage, sans aucune manipulation manuelle, et la Phase 2 est complète.

**Architecture:** Un module pur `migrate-blocking-data.ts` copie les fichiers de blocage de `%APPDATA%\Nexus` vers `C:\ProgramData\Nexus` sans écraser (idempotent, testable). Un module `service-launcher.ts` sonde le named pipe ; si aucun service ne répond, il migre puis lance le service en **process détaché** (`ELECTRON_RUN_AS_NODE`, `detached`, `unref`) — le service survit à la fermeture/au kill de l'UI. `index.ts` appelle `ensureServiceRunning()` au démarrage. Le packaging sort le bundle service de l'asar (`asarUnpack`) pour qu'il soit exécutable comme script Node, et `npm run build` enchaîne `build:service`.

**Tech Stack:** TypeScript, Electron, `node:child_process`, `node:net`, electron-builder, Vitest.

---

## Contexte & périmètre

Ce plan est le **Lot 4b** du palier 2 du sous-projet P16 (service Windows).
Réf. spec : `docs/superpowers/specs/2026-05-15-nexus-windows-service-design.md` §5, §6, §11.
Les Lots 1-3 ont déplacé le moteur de blocage dans le service. Le **Lot 4a** a fait
de `blocking.handlers.ts` un relais : le `main` ne bloque plus, il parle au service
via le named pipe. Mais le service est, à ce stade, lancé **à la main**
(`npm run dev:service`).

**Lot 4b** ferme la Phase 2 : le `main` lance le service tout seul, en process
détaché, et migre les données de blocage vers l'emplacement machine.

**Ce que Lot 4b fait :**
1. `migrate-blocking-data.ts` — copie idempotente des `nexus_blocking*.json` +
   `hosts.nexus.backup` de `%APPDATA%\Nexus` vers `C:\ProgramData\Nexus`.
2. `service-launcher.ts` — sonde le pipe ; si aucun service ne répond, migre
   puis lance le service en process détaché.
3. Câble `ensureServiceRunning()` dans `index.ts` au démarrage.
4. Packaging : `asarUnpack` du bundle service dans `electron-builder.yml` ;
   `npm run build` / `build:unpack` / `build:portable` enchaînent `build:service`.

**Ce que Lot 4b ne fait PAS** (Phase 3+) :
- Le vrai service Windows node-windows (install via `sudo-prompt`, démarrage au
  boot, compte SYSTEM, auto-restart) — Phase 3.
- Le retrait de `requestedExecutionLevel: requireAdministrator` — Phase 3 (en
  Phase 2 l'UI reste élevée, c'est elle qui lance le service détaché).
- Le bandeau « service indisponible » + auto-réparation — Phase 3.
- L'ACL de `C:\ProgramData\Nexus` et du pipe — Phase 4.

**Décisions de conception (verrouillées) :**
- **Lancement = sonde-puis-spawn.** Au démarrage, le `main` tente une connexion
  unique au pipe. Si un service répond (typiquement un service détaché survivant
  d'un lancement précédent), on le réutilise. Sinon, on migre et on lance. Un
  double lancement serait de toute façon inoffensif (le 2ᵉ service échoue à
  écouter le pipe et quitte), mais sonder évite de lancer des process voués.
- **Process détaché, pas service Windows.** `child_process.spawn(detached, unref)`
  sur le binaire Electron en mode Node. Le process survit au kill de l'UI (c'est
  le payoff Phase 2) mais **pas au reboot** — le vrai service au boot est la
  Phase 3. Au prochain lancement de l'UI après reboot, la sonde ne trouve rien
  et relance.
- **Migration avant lancement, idempotente.** La copie ne se fait que vers un
  fichier **absent** de la cible (le service est propriétaire des fichiers après
  la 1ʳᵉ migration — on ne réécrit jamais par-dessus). `hosts.nexus.staging`
  (fichier transitoire d'écriture atomique) n'est PAS migré.
- **`ensureServiceRunning()` ne lève jamais.** Un échec (migration, spawn) est
  journalisé ; l'app continue. Si le service finit indisponible, le relais du
  Lot 4a fait remonter des erreurs honnêtes (le bandeau de réparation est Phase 3).
- **Chemin du bundle service.** En dev : `<racine>/out/service/index.js` (produit
  par `npm run build:service`). En production : `asarUnpack` extrait le bundle
  vers `<resources>/app.asar.unpacked/out/service/index.js` — un script à
  l'intérieur de l'asar ne serait pas exécutable en mode Node pur.
- **Limite de vérification.** Ce worktree ne peut pas lancer `electron-builder`.
  Les changements de `electron-builder.yml` et le chemin packagé de
  `resolveServiceEntry` sont vérifiés **par inspection** ; la passe runtime se
  fait en dev (`npm run build:service` puis `npm run dev`) et, pour le packagé,
  sur une machine de build.
- **Pas de test unitaire du launcher.** `service-launcher.ts` importe `electron`
  (`app`) et `node:child_process` — non chargeable / non déterministe sous
  Vitest. Il est vérifié par typecheck + intégration manuelle (spec §10). Seule
  la migration (pur `fs`) est testée.

## Structure de fichiers

```
CRÉÉ :
  src/main/blocking/migrate-blocking-data.ts       # migrateBlockingData(from,to) — pur fs, idempotent
  src/main/blocking/migrate-blocking-data.test.ts  # tests (tmpdir)
  src/main/service-launcher.ts                     # probe pipe + spawn détaché + ensureServiceRunning

MODIFIÉ :
  src/main/index.ts          # appel ensureServiceRunning() dans app.whenReady()
  electron-builder.yml       # asarUnpack du bundle service
  package.json               # build / build:unpack / build:portable enchaînent build:service
```

`src/main/**` est déjà couvert par `tsconfig.node.json` et les `vitest.config`
(`include: src/main/**/*.test.ts`) — aucune config TS/Vitest à modifier. Le build
`main` connaît l'alias `@service` (utilisé pour `@service/data-dir`).

---

## Task 1: Module de migration des données de blocage

**Files:**
- Create: `src/main/blocking/migrate-blocking-data.ts`
- Test: `src/main/blocking/migrate-blocking-data.test.ts`

Quand le blocage tournait dans le `main` (≤ Lot 4a), ses fichiers vivaient dans
`%APPDATA%\Nexus`. Le service les lit dans `C:\ProgramData\Nexus` (spec §4.4). Ce
module copie les fichiers existants vers le nouvel emplacement, **sans écraser**.

- [ ] **Step 1: Écrire le test (échouera — module absent)**

Créer `src/main/blocking/migrate-blocking-data.test.ts` :

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { migrateBlockingData } from './migrate-blocking-data'

describe('migrateBlockingData', () => {
  let base: string
  let fromDir: string
  let toDir: string

  beforeEach(async () => {
    base = await fsp.mkdtemp(join(tmpdir(), 'nexus-migrate-'))
    fromDir = join(base, 'from')
    toDir = join(base, 'to')
    await fsp.mkdir(fromDir, { recursive: true })
  })
  afterEach(async () => {
    await fsp.rm(base, { recursive: true, force: true })
  })

  it('copie un fichier de blocage absent de la cible', async () => {
    await fsp.writeFile(join(fromDir, 'nexus_blocking.json'), '{"profiles":[]}', 'utf8')
    await migrateBlockingData(fromDir, toDir)
    expect(await fsp.readFile(join(toDir, 'nexus_blocking.json'), 'utf8')).toBe('{"profiles":[]}')
  })

  it("n'écrase pas un fichier déjà présent dans la cible", async () => {
    await fsp.writeFile(join(fromDir, 'nexus_blocking.json'), 'NOUVEAU', 'utf8')
    await fsp.mkdir(toDir, { recursive: true })
    await fsp.writeFile(join(toDir, 'nexus_blocking.json'), 'EXISTANT', 'utf8')
    await migrateBlockingData(fromDir, toDir)
    expect(await fsp.readFile(join(toDir, 'nexus_blocking.json'), 'utf8')).toBe('EXISTANT')
  })

  it('ignore un fichier absent de la source sans erreur', async () => {
    await expect(migrateBlockingData(fromDir, toDir)).resolves.toBeUndefined()
    expect(await fsp.readdir(toDir)).toEqual([])
  })

  it("crée le répertoire cible s'il n'existe pas", async () => {
    await fsp.writeFile(join(fromDir, 'hosts.nexus.backup'), 'backup', 'utf8')
    await migrateBlockingData(fromDir, toDir)
    expect(await fsp.readFile(join(toDir, 'hosts.nexus.backup'), 'utf8')).toBe('backup')
  })

  it('migre les 4 fichiers de blocage connus, pas le staging', async () => {
    for (const name of [
      'nexus_blocking.json',
      'nexus_blocking_history.json',
      'nexus_blocking_active.json',
      'hosts.nexus.backup',
      'hosts.nexus.staging',
    ]) {
      await fsp.writeFile(join(fromDir, name), name, 'utf8')
    }
    await migrateBlockingData(fromDir, toDir)
    expect((await fsp.readdir(toDir)).sort()).toEqual(
      [
        'hosts.nexus.backup',
        'nexus_blocking.json',
        'nexus_blocking_active.json',
        'nexus_blocking_history.json',
      ].sort(),
    )
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm run test -- src/main/blocking/migrate-blocking-data.test.ts`
Expected: FAIL — `Failed to resolve import "./migrate-blocking-data"`.

- [ ] **Step 3: Écrire `migrate-blocking-data.ts`**

Créer `src/main/blocking/migrate-blocking-data.ts` :

```ts
import { promises as fsp } from 'node:fs'
import { join } from 'node:path'

/**
 * Fichiers de blocage migrés de `%APPDATA%\Nexus` (ancien emplacement, quand le
 * blocage tournait dans le main) vers `C:\ProgramData\Nexus` (emplacement du
 * service). `hosts.nexus.staging` n'y figure pas : c'est un fichier transitoire
 * d'écriture atomique, recréé à la volée — rien à migrer.
 */
const BLOCKING_FILES = [
  'nexus_blocking.json',
  'nexus_blocking_history.json',
  'nexus_blocking_active.json',
  'hosts.nexus.backup',
] as const

async function fileExists(path: string): Promise<boolean> {
  try {
    await fsp.access(path)
    return true
  } catch {
    return false
  }
}

/**
 * Copie les fichiers de blocage de `fromDir` vers `toDir`, **sans écraser** : un
 * fichier déjà présent dans `toDir` est laissé tel quel (le service en est
 * propriétaire après la 1ʳᵉ migration). Crée `toDir` au besoin. Idempotent —
 * ré-appelée, elle ne fait rien de plus.
 */
export async function migrateBlockingData(fromDir: string, toDir: string): Promise<void> {
  await fsp.mkdir(toDir, { recursive: true })
  for (const name of BLOCKING_FILES) {
    const dest = join(toDir, name)
    if (await fileExists(dest)) continue
    const src = join(fromDir, name)
    if (!(await fileExists(src))) continue
    await fsp.copyFile(src, dest)
  }
}
```

- [ ] **Step 4: Lancer le test + le typecheck**

Run: `npm run typecheck:node && npm run test -- src/main/blocking/migrate-blocking-data.test.ts`
Expected: typecheck PASS ; **5 tests passed**.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/blocking/migrate-blocking-data.ts src/main/blocking/migrate-blocking-data.test.ts
git commit -m "feat(main): migration des données de blocage vers ProgramData (Lot 4b)"
```

---

## Task 2: Lanceur de service en process détaché

**Files:**
- Create: `src/main/service-launcher.ts`

Ce module sonde le named pipe et, si aucun service ne répond, migre les données
puis lance le service en process détaché. Il est couplé à l'OS (`child_process`,
`net`, `electron`) — **pas de test unitaire** (cf. périmètre) ; vérifié par
typecheck + intégration manuelle.

- [ ] **Step 1: Créer `service-launcher.ts`**

Créer `src/main/service-launcher.ts` :

```ts
import { spawn } from 'node:child_process'
import net from 'node:net'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { PIPE_PATH } from '@shared/service-protocol'
import { serviceDataDir } from '@service/data-dir'
import { migrateBlockingData } from './blocking/migrate-blocking-data'
import log from './logging/setup'

const PROBE_TIMEOUT_MS = 1000

/**
 * Teste en une seule tentative brève si un service répond déjà sur le named
 * pipe. Aucune reconnexion : connexion ouverte → service présent ; erreur
 * (pipe inexistant) ou timeout → absent.
 */
function probeService(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection(PIPE_PATH)
    let settled = false
    const finish = (running: boolean): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.destroy()
      resolve(running)
    }
    const timer = setTimeout(() => finish(false), PROBE_TIMEOUT_MS)
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
  })
}

/**
 * Chemin du bundle du service. En dev : `out/service/index.js` à la racine du
 * projet (produit par `npm run build:service`). En production : le bundle est
 * sorti de l'asar par `asarUnpack` (cf. electron-builder.yml) — un script dans
 * l'asar ne serait pas exécutable en mode Node pur.
 */
function resolveServiceEntry(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'app.asar.unpacked', 'out', 'service', 'index.js')
  }
  return join(app.getAppPath(), 'out', 'service', 'index.js')
}

/**
 * Lance le service en process détaché : il survit à la fermeture / au kill de
 * l'UI. Tourne sur le binaire Electron en mode Node (`ELECTRON_RUN_AS_NODE`).
 */
function spawnDetachedService(entry: string): void {
  const child = spawn(process.execPath, [entry], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  })
  child.unref()
}

/**
 * S'assure qu'un service de blocage tourne. Si aucun service ne répond sur le
 * pipe : migre les fichiers de blocage vers `C:\ProgramData\Nexus`, puis lance
 * le service en process détaché. Ne lève jamais — un échec est journalisé et
 * l'app continue (le relais du Lot 4a remontera alors des erreurs honnêtes).
 */
export async function ensureServiceRunning(): Promise<void> {
  if (await probeService()) {
    log.info('[service-launcher] service déjà en cours')
    return
  }
  const entry = resolveServiceEntry()
  if (!existsSync(entry)) {
    log.warn('[service-launcher] bundle service introuvable — lancement ignoré', entry)
    return
  }
  try {
    await migrateBlockingData(app.getPath('userData'), serviceDataDir())
    spawnDetachedService(entry)
    log.info('[service-launcher] service lancé en process détaché', entry)
  } catch (err) {
    log.error('[service-launcher] échec du lancement du service', err)
  }
}
```

- [ ] **Step 2: Vérifier typecheck + lint**

Run: `npm run typecheck:node && npm run lint`
Expected: typecheck PASS ; lint PASS.

Si le typecheck signale `process.resourcesPath` : la propriété est ajoutée au
type `NodeJS.Process` par les types d'Electron — ce fichier importe `electron`,
l'augmentation s'applique donc. En cas d'échec inattendu, vérifier que l'import
`electron` est présent.

- [ ] **Step 3: Vérifier que la suite reste verte**

Run: `npm run test`
Expected: **167 passed** (162 du Lot 4a + 5 ajoutés en Task 1). `service-launcher.ts`
n'a pas de test (module couplé à l'OS) — le total ne change pas par rapport à
la fin de la Task 1.

- [ ] **Step 4: Commit**

```bash
git add src/main/service-launcher.ts
git commit -m "feat(main): lanceur du service de blocage en process détaché (Lot 4b)"
```

---

## Task 3: Câbler `index.ts`, packaging, et vérification finale

**Files:**
- Modify: `src/main/index.ts`
- Modify: `electron-builder.yml`
- Modify: `package.json`

- [ ] **Step 1: Appeler `ensureServiceRunning()` dans `index.ts`**

Dans `src/main/index.ts`, ajouter l'import après la ligne
`import { recalculateFreeTimeAtBoot } from './free-time/recalculate'` :

```ts
import { recalculateFreeTimeAtBoot } from './free-time/recalculate'
import { ensureServiceRunning } from './service-launcher'
```

Puis, dans le corps de `app.whenReady().then(async () => {`, remplacer :

```ts
  await ensureElevatedAtStartup()
  const recoveredFromCrash = existsSync(crashMarkerPath())
  writeCrashMarker()

  const storage = createStorage(app.getPath('userData'))
```

par :

```ts
  await ensureElevatedAtStartup()
  const recoveredFromCrash = existsSync(crashMarkerPath())
  writeCrashMarker()

  // P16 Lot 4b : lance le service de blocage (process détaché) s'il ne tourne
  // pas déjà, après migration des données vers C:\ProgramData\Nexus. Placé
  // après ensureElevatedAtStartup (la migration écrit dans ProgramData) et
  // avant registerAllIpcHandlers (dont le relais se connectera au service).
  await ensureServiceRunning()

  const storage = createStorage(app.getPath('userData'))
```

`ensureServiceRunning()` ne lève jamais (cf. son contrat) — pas de `.catch`
nécessaire.

- [ ] **Step 2: `asarUnpack` du bundle service dans `electron-builder.yml`**

Dans `electron-builder.yml`, remplacer la ligne :

```yaml
asar: true
```

par :

```yaml
asar: true
asarUnpack:
  - 'out/service/**'
```

(Le bundle service reste inclus dans le package via `files: ['out/**/*']`, mais
`asarUnpack` l'extrait dans `app.asar.unpacked/` pour qu'il soit exécutable comme
script Node — `resolveServiceEntry` pointe précisément là en production.)

- [ ] **Step 3: Enchaîner `build:service` dans les scripts de build**

Dans `package.json`, dans la section `scripts`, remplacer ces trois lignes :

```json
    "build": "electron-vite build && electron-builder --win --dir && node scripts/build-simple-installer.mjs",
    "build:unpack": "electron-vite build && electron-builder --win --dir",
    "build:portable": "electron-vite build && electron-builder --win portable",
```

par :

```json
    "build": "electron-vite build && npm run build:service && electron-builder --win --dir && node scripts/build-simple-installer.mjs",
    "build:unpack": "electron-vite build && npm run build:service && electron-builder --win --dir",
    "build:portable": "electron-vite build && npm run build:service && electron-builder --win portable",
```

(Ainsi `out/service/index.js` existe quand `electron-builder` empaquette
`out/**/*`. La ligne `build:service` elle-même est inchangée.)

- [ ] **Step 4: Typecheck + lint + tests**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: `typecheck` (node + web) PASS ; `lint` PASS ; `test` **167 passed**.

- [ ] **Step 5: Builds**

Run: `npm run build:service`
Expected: PASS — produit `out/service/index.js`.

Run: `npx electron-vite build`
Expected: PASS — bundles main/preload/renderer.

Note : `npm run build` enchaîne désormais `electron-vite build` + `build:service`
+ `electron-builder`. Les deux premiers passent ; l'étape `electron-builder`
échoue dans le worktree faute d'Electron packagé — limite d'environnement connue.
Les changements de `electron-builder.yml` et de `package.json` sont vérifiés ici
**par inspection** ; le package réel doit être produit sur une machine de build.

- [ ] **Step 6: Commit**

```bash
git add src/main/index.ts electron-builder.yml package.json
git commit -m "feat(main): lancement auto du service au démarrage + packaging (Lot 4b)"
```

---

## Vérification de fin de lot

État attendu après la Task 3 :
- `src/main/service-launcher.ts` expose `ensureServiceRunning()` ; `index.ts`
  l'appelle dans `app.whenReady()`, après `ensureElevatedAtStartup()` et avant
  `registerAllIpcHandlers`.
- `migrateBlockingData` copie les 4 fichiers de blocage de `%APPDATA%` vers
  `C:\ProgramData\Nexus` sans jamais écraser une cible existante.
- `electron-builder.yml` a `asarUnpack: ['out/service/**']` ; `build`,
  `build:unpack`, `build:portable` enchaînent `build:service`.
- 4 portes vertes : `typecheck` (node + web), `lint`, `electron-vite build`,
  `build:service` ; `test` = 167.

**Validation d'intégration manuelle (spec §10) :** `npm run build:service`, puis
`npm run dev`. Au démarrage, le `main` ne trouve pas de service sur le pipe →
migre les données → lance le service détaché. Créer un profil, démarrer une
session : le blocage s'applique. **Tuer le process UI** : le service détaché
reste vivant, les règles hosts/firewall tiennent. Rouvrir l'UI : la sonde trouve
le service déjà en cours et s'y reconnecte. C'est le but de la Phase 2 atteint
**sans manipulation manuelle**.

## Phase 2 terminée

À l'issue du Lot 4b, la Phase 2 du sous-projet P16 est complète : le blocage vit
dans un service séparé, lancé automatiquement, qui survit au kill de l'UI. La
branche `nexus-service-phase2` peut être mergée dans `master`.

Restent les phases suivantes (hors P16 Phase 2) :
- **Phase 3** — vrai service Windows node-windows (install via `sudo-prompt`,
  démarrage au boot en compte SYSTEM, auto-restart, retrait de
  `requireAdministrator`, bandeau « service indisponible » + réparation).
- **Phase 4** — durcissement : ACL du pipe et de `C:\ProgramData\Nexus`,
  reconnexion/backoff affinés, `NEXUS_SPEC.md`.
