# Phase 3 — Lot 1 : Spike node-windows

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dé-risquer le point technique #1 du sous-projet P16 : prouver (ou réfuter) que node-windows peut installer Nexus comme un vrai service Windows tournant sur le binaire Electron en mode Node.

**Architecture:** Un module `src/main/service-install.ts` configure un `Service` node-windows pointant sur le bundle `out/service/index.js`, exécuté via le binaire Electron avec `ELECTRON_RUN_AS_NODE=1`. `src/main/index.ts` détecte les flags `--install-service` / `--uninstall-service` tout au début et exécute la routine d'installation au lieu d'ouvrir l'UI, puis quitte.

**Tech Stack:** TypeScript, Electron, node-windows, electron-vite.

---

## Contexte & périmètre

Ce plan est le **Lot 1 de la Phase 3** du sous-projet P16 (service Windows).
Réf. : design Phase 3 `docs/superpowers/specs/2026-05-17-nexus-windows-service-phase3-design.md` §3 Lot 1, et spec maître §5, §9.

**Nature du lot : un spike.** Son but n'est pas de livrer une fonctionnalité finie
mais de **vérifier empiriquement** une hypothèse technique. Le code ci-dessous est
l'approche à éprouver — pas une solution garantie.

**Hypothèse à valider :** la routine d'install tourne sous `Nexus.exe --install-service`
(donc `process.execPath` = le binaire Electron). node-windows, en installant le
service, fait pointer le service sur un exécutable Node ; avec `ELECTRON_RUN_AS_NODE=1`
dans l'environnement du service, le binaire Electron exécute alors `out/service/index.js`
en mode Node pur. Le service obtenu démarre au boot, en compte SYSTEM, avec auto-restart.

**Ce que Lot 1 livre :**
1. `node-windows` en dépendance + une déclaration de types locale.
2. `service-install.ts` : `installService()` / `uninstallService()`.
3. Détection des flags `--install-service` / `--uninstall-service` dans `index.ts`.

**Ce que Lot 1 ne livre PAS** (lots suivants, conditionnés au résultat du spike) :
- L'installation déclenchée via `sudo-prompt` depuis l'UI (Lot 2).
- La détection d'état et le bandeau côté UI (Lot 3).
- Le retrait de `requireAdministrator` (Lot 4).

**Vérification.** Les portes automatiques (`typecheck`, `lint`, `build:service`,
`electron-vite build`) valident que le *code* du spike compile. Mais le cœur du
spike — installation réelle d'un service Windows, démarrage au boot, compte SYSTEM —
est **vérifié manuellement** (cf. « Protocole de vérification manuelle » en fin de
plan). Ce n'est pas automatisable en CI et c'est inhérent à un service Windows
(spec §10).

**Critère de réussite du spike :** le service `NexusBlockingService` survit à un
reboot et porte le blocage en compte SYSTEM. **Si le spike échoue** (node-windows
ne sait pas piloter le binaire Electron, ou le service ne démarre pas en SYSTEM) :
on s'arrête, et on rédige un court compte-rendu d'échec ; le design Phase 3 sera
révisé pour le runtime de repli (Node SEA — `.exe` autonome — ou pilotage direct
de winsw / `sc.exe`).

## Structure de fichiers

```
MODIFIÉ :
  package.json                    # + dépendance node-windows
  src/main/index.ts               # détection des flags --install-service / --uninstall-service

CRÉÉ :
  src/main/node-windows.d.ts       # déclaration de types locale (node-windows n'a pas de @types fiable)
  src/main/service-install.ts      # installService() / uninstallService() via node-windows
```

---

## Task 1: Ajouter node-windows + sa déclaration de types

**Files:**
- Modify: `package.json`
- Create: `src/main/node-windows.d.ts`

- [ ] **Step 1: Installer node-windows**

Run: `npm install node-windows@1.0.0-beta.8`
Expected: `node-windows` ajouté à `dependencies` dans `package.json`, installé dans
`node_modules`. (Si la version `1.0.0-beta.8` n'est pas résolvable, prendre la
dernière version stable publiée — `npm view node-windows version` — et l'installer ;
noter la version retenue dans le rapport.)

- [ ] **Step 2: Déclarer les types de node-windows**

node-windows est un paquet CJS ancien sans typage TypeScript officiel fiable. On
fournit une déclaration de module locale, limitée à l'API `Service` utilisée par
le spike. Créer `src/main/node-windows.d.ts` :

```ts
// Déclaration de types locale pour node-windows : le paquet n'a pas de @types
// officiel fiable. Couvre uniquement l'API `Service` utilisée par le spike P16.
declare module 'node-windows' {
  export interface ServiceOptions {
    /** Nom du service Windows (sans espaces). */
    name: string
    description?: string
    /** Chemin absolu du script JS exécuté par le service. */
    script: string
    /** Variables d'environnement du service. */
    env?: Array<{ name: string; value: string }>
    /** Délai initial (s) avant la 1re tentative de redémarrage. */
    wait?: number
    /** Facteur de croissance du délai entre redémarrages. */
    grow?: number
    /** Nombre maximum de redémarrages dans une fenêtre de 60 s. */
    maxRestarts?: number
  }

  export type ServiceEvent =
    | 'install'
    | 'alreadyinstalled'
    | 'invalidinstallation'
    | 'uninstall'
    | 'start'
    | 'stop'
    | 'error'

  export class Service {
    constructor(options: ServiceOptions)
    /** True si le service est déjà installé. */
    readonly exists: boolean
    install(): void
    uninstall(): void
    start(): void
    stop(): void
    on(event: 'error', listener: (err: Error) => void): this
    on(event: Exclude<ServiceEvent, 'error'>, listener: () => void): this
  }
}
```

- [ ] **Step 3: Vérifier le typecheck**

Run: `npm run typecheck:node`
Expected: PASS — la déclaration `src/main/node-windows.d.ts` est dans le périmètre
de `tsconfig.node.json` (`include: src/main/**/*`), node-windows est désormais typé.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/main/node-windows.d.ts
git commit -m "chore(main): dépendance node-windows + types locaux (Phase 3 Lot 1)"
```

---

## Task 2: Module `service-install.ts`

**Files:**
- Create: `src/main/service-install.ts`

Ce module configure et installe/désinstalle le service Windows via node-windows.
C'est le cœur du spike. Pas de test unitaire : le module pilote l'installation
réelle d'un service Windows (couplé à l'OS) — il est vérifié par typecheck + le
protocole manuel.

- [ ] **Step 1: Créer `service-install.ts`**

Créer `src/main/service-install.ts` :

```ts
import { join } from 'node:path'
import { app } from 'electron'
import { Service } from 'node-windows'
import log from './logging/setup'

/** Nom du service Windows installé pour porter le blocage Nexus. */
export const SERVICE_NAME = 'NexusBlockingService'

/**
 * Chemin du bundle du service (`out/service/index.js`). En production le bundle
 * est hors de l'asar (`asarUnpack`, posé au Lot 4b). En dev, à la racine du projet.
 */
function serviceScriptPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'app.asar.unpacked', 'out', 'service', 'index.js')
  }
  return join(app.getAppPath(), 'out', 'service', 'index.js')
}

/**
 * Construit l'objet `Service` node-windows. HYPOTHÈSE DU SPIKE : node-windows fait
 * tourner le service via un exécutable Node ; comme la routine d'install s'exécute
 * sous `Nexus.exe` (binaire Electron), et avec `ELECTRON_RUN_AS_NODE=1` dans
 * l'environnement du service, le binaire Electron exécute le bundle en mode Node.
 */
function buildService(): Service {
  return new Service({
    name: SERVICE_NAME,
    description: 'Service de blocage en arrière-plan de Nexus (sous-projet P16).',
    script: serviceScriptPath(),
    env: [{ name: 'ELECTRON_RUN_AS_NODE', value: '1' }],
    wait: 2,
    grow: 0.5,
    maxRestarts: 10,
  })
}

/**
 * Installe `NexusBlockingService` et le démarre. Idempotent : si le service est
 * déjà installé, résout sans erreur. À appeler depuis une routine élevée
 * (l'install d'un service Windows exige les droits admin).
 */
export function installService(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const svc = buildService()
    svc.on('install', () => {
      log.info('[service-install] service installé, démarrage')
      svc.start()
      resolve()
    })
    svc.on('alreadyinstalled', () => {
      log.info('[service-install] service déjà installé')
      resolve()
    })
    svc.on('invalidinstallation', () => {
      reject(new Error('Installation du service invalide'))
    })
    svc.on('error', (err) => reject(err))
    svc.install()
  })
}

/** Désinstalle `NexusBlockingService`. Idempotent côté node-windows. */
export function uninstallService(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const svc = buildService()
    svc.on('uninstall', () => {
      log.info('[service-install] service désinstallé')
      resolve()
    })
    svc.on('error', (err) => reject(err))
    svc.uninstall()
  })
}
```

- [ ] **Step 2: Vérifier typecheck + lint**

Run: `npm run typecheck:node && npm run lint`
Expected: typecheck PASS ; lint PASS.

- [ ] **Step 3: Commit**

```bash
git add src/main/service-install.ts
git commit -m "feat(main): module d'install du service Windows via node-windows (Phase 3 Lot 1)"
```

---

## Task 3: Détecter `--install-service` / `--uninstall-service` dans `index.ts`

**Files:**
- Modify: `src/main/index.ts`

Quand `Nexus.exe` est lancé avec `--install-service` (resp. `--uninstall-service`),
le `main` exécute la routine correspondante **au lieu** d'ouvrir l'UI, puis quitte.
La détection doit se faire **avant** `app.requestSingleInstanceLock()` et
`app.whenReady()` — la routine d'install ne doit ni prendre le verrou d'instance
unique ni ouvrir de fenêtre.

- [ ] **Step 1: Lire `src/main/index.ts`**

Lire le fichier en entier pour situer : la ligne `setupLogging()`, le bloc
`app.whenReady().then(...)`, et le bloc `const gotLock = app.requestSingleInstanceLock()`.

- [ ] **Step 2: Ajouter l'import de la routine d'install**

Dans `src/main/index.ts`, après la ligne `import { recalculateFreeTimeAtBoot } from './free-time/recalculate'`
(ou à la suite des autres imports `./`), ajouter :

```ts
import { installService, uninstallService } from './service-install'
```

- [ ] **Step 3: Brancher la détection des flags juste après `setupLogging()`**

Repérer, en haut de `src/main/index.ts`, le bloc :

```ts
// Init logging avant toute autre logique main (cf. setup.ts pour le pourquoi
// du module paresseux).
setupLogging()

const isDev = !app.isPackaged
```

Insérer, **entre `setupLogging()` et `const isDev`**, le bloc de détection :

```ts
// Init logging avant toute autre logique main (cf. setup.ts pour le pourquoi
// du module paresseux).
setupLogging()

// P16 Phase 3 — Lot 1 : si l'app est lancée avec un flag d'install/désinstall
// du service Windows, on exécute la routine correspondante au lieu d'ouvrir
// l'UI, puis on quitte. Détecté AVANT le verrou d'instance unique et whenReady.
const wantsInstallService = process.argv.includes('--install-service')
const wantsUninstallService = process.argv.includes('--uninstall-service')
if (wantsInstallService || wantsUninstallService) {
  const routine = wantsInstallService ? installService : uninstallService
  routine()
    .then(() => {
      log.info('[main] routine service-install terminée', {
        action: wantsInstallService ? 'install' : 'uninstall',
      })
      app.exit(0)
    })
    .catch((err) => {
      log.error('[main] routine service-install échouée', err)
      app.exit(1)
    })
} else {
  startNexusApp()
}

const isDev = !app.isPackaged
```

- [ ] **Step 4: Encapsuler le démarrage normal dans `startNexusApp()`**

Le démarrage normal de l'app (le `app.whenReady().then(...)`, les `app.on(...)`,
le `requestSingleInstanceLock`, les `process.on(...)`) ne doit s'exécuter QUE
hors mode install. Envelopper tout ce bloc dans une fonction `startNexusApp()`.

Concrètement : juste avant le `app.whenReady().then(async () => {` existant,
ouvrir la fonction ; juste après le dernier `process.on('SIGTERM', ...)`, la
fermer. C'est-à-dire remplacer :

```ts
app.whenReady().then(async () => {
```

par :

```ts
function startNexusApp(): void {
app.whenReady().then(async () => {
```

et ajouter, **tout à la fin du fichier**, après le dernier handler
`process.on('SIGTERM', () => { ... })` :

```ts
}
```

(La fermeture `}` referme `startNexusApp`. `startNexusApp()` est appelée dans la
branche `else` du Step 3. Le contenu interne est inchangé, seulement réindenté
n'est PAS nécessaire — laisser l'indentation telle quelle est acceptable pour le
spike ; `lint`/`prettier` la corrigeront si besoin au step de vérif.)

- [ ] **Step 5: Vérifier typecheck + lint + tests**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: `typecheck` (node + web) PASS ; `lint` PASS ; `test` **167 passed**
(le spike n'ajoute pas de test unitaire). Si `lint`/`prettier` signale
l'indentation du bloc `startNexusApp`, lancer `npm run format` puis re-vérifier.

- [ ] **Step 6: Vérifier les builds**

Run: `npm run build:service && npx electron-vite build`
Expected: les deux PASS — `out/service/index.js` produit, bundles main/preload/
renderer produits.

- [ ] **Step 7: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(main): flags --install-service / --uninstall-service (Phase 3 Lot 1)"
```

---

## Protocole de vérification manuelle (le cœur du spike)

À exécuter sur une machine Windows réelle, en administrateur. **Ce protocole, et
non les portes automatiques, décide de la réussite ou de l'échec du spike.**

1. **Build :** `npm run build:service` puis `npm run build:unpack` (produit l'app
   packagée dans `release/`, bundle service inclus hors asar).
2. **Installer :** lancer `Nexus.exe --install-service` depuis l'app packagée.
   Vérifier : aucune fenêtre ne s'ouvre, le process quitte (code 0), et
   `services.msc` (ou `sc query NexusBlockingService`) montre le service installé.
3. **Démarrage & SYSTEM :** vérifier que le service est `Running` et que sa
   colonne « Ouvrir une session en tant que » est `Système local` (SYSTEM).
   Vérifier `C:\ProgramData\Nexus\logs\nexus-service.log` : le service a logué
   son démarrage.
4. **Blocage :** ouvrir l'UI Nexus, démarrer une session de blocage, confirmer
   qu'un site bloqué l'est réellement (c'est le service en SYSTEM qui l'applique).
5. **Survie au reboot :** redémarrer Windows. Sans ouvrir l'UI, vérifier que
   `NexusBlockingService` est de nouveau `Running` (démarrage automatique au boot).
6. **Auto-restart :** tuer le process du service via le Gestionnaire des tâches.
   Attendre quelques secondes ; vérifier qu'il est relancé automatiquement.
7. **Désinstaller :** `Nexus.exe --uninstall-service` ; vérifier que le service
   disparaît de `services.msc`.

**Résultat attendu :** toutes les étapes passent → spike réussi, on enchaîne sur
le Lot 2. **Si une étape échoue** (notamment 2, 3 ou 5) → spike échoué : rédiger
un court compte-rendu (`docs/superpowers/specs/`-adjacent ou en commentaire de
suivi) décrivant le point de blocage exact, et réviser le design Phase 3 vers le
runtime de repli (Node SEA ou winsw direct) avant d'attaquer le Lot 2.

## Vérification de fin de lot (automatique)

- `node-windows` est en dépendance ; `src/main/node-windows.d.ts` la type.
- `src/main/service-install.ts` exporte `installService` / `uninstallService`.
- `src/main/index.ts` détecte `--install-service` / `--uninstall-service` avant
  le verrou d'instance unique et `whenReady`, et exécute la routine puis quitte.
- 4 portes vertes : `typecheck` (node + web), `lint`, `electron-vite build`,
  `build:service` ; `test` = 167.
- Le **protocole de vérification manuelle** ci-dessus reste à exécuter pour
  conclure le spike — il requiert une machine Windows et un reboot.
