# Service Windows de blocage — Plan d'implémentation Phase 1

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poser le squelette du process « Vethos Service » et du pont named pipe UI↔Service, et dé-risquer les 3 inconnues techniques — sans encore migrer le blocage.

**Architecture:** Un nouveau module `src/service/` produit un bundle Node exécuté sur le binaire Electron embarqué (`ELECTRON_RUN_AS_NODE=1`). Il expose un serveur named pipe (`\\.\pipe\VethosServiceBridge`) parlant un protocole JSON ligne-délimité. Le process `main` de l'UI reçoit un client pipe. En Phase 1, le service ne répond qu'à `PING` et `GET_SERVICE_INFO` ; le blocage reste dans le `main`.

**Tech Stack:** TypeScript, Node `net` (named pipes), Vite (cible de build dédiée), electron-vite (`externalizeDepsPlugin`), electron-log, node-windows (spike uniquement), Vitest.

---

## Contexte & périmètre

Ce plan couvre **uniquement la Phase 1** du spec
`docs/superpowers/specs/2026-05-15-vethos-windows-service-design.md`. Les Phases 2-4
(migration du blocage, vrai service Windows, durcissement) auront chacune leur
propre plan, écrit une fois les spikes de la Phase 1 résolus.

**Gate spike :** la Tâche 2 est un spike de faisabilité. Les Tâches 3-7 supposent
qu'il a réussi. Si un spike échoue, **arrêter** et réviser le plan/spec avant de
continuer (cf. spec §9 : repli possible vers un `.exe` autonome Node SEA).

À la fin de la Phase 1 : `npm run typecheck`, `npm run lint`, `npm run test` verts ;
l'UI logue « service joignable » au démarrage en dev ; rien de visible ne change
pour l'utilisateur.

## Structure de fichiers

```
CRÉÉ :
  electron.vite.service.config.ts        # build Vite de la cible service
  src/shared/service-protocol.ts          # types + framing des messages UI↔Service
  src/shared/service-protocol.test.ts
  src/service/index.ts                    # point d'entrée du service
  src/service/data-dir.ts                 # résout C:\ProgramData\Vethos
  src/service/logging.ts                  # electron-log en mode Node
  src/service/bridge/server.ts            # serveur named pipe + routage
  src/service/bridge/server.test.ts
  src/main/service-client/client.ts       # client named pipe (UI)
  src/main/service-client/client.test.ts

MODIFIÉ :
  tsconfig.node.json                      # include src/service
  vitest.config.ts                        # include les tests src/service
  package.json                            # scripts build:service / dev:service
  src/main/index.ts                        # ping du service au démarrage
```

---

## Task 1: Config TypeScript & Vitest pour `src/service/`

**Files:**
- Modify: `tsconfig.node.json`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Étendre `tsconfig.node.json` au module service**

Dans `tsconfig.node.json`, ajouter le mapping `@service` dans `compilerOptions.paths`
(à côté de `@main/*` et `@shared/*`) :

```json
      "@service/*": ["src/service/*"]
```

Puis remplacer la ligne `include` :

```json
  "include": ["src/main/**/*", "src/preload/**/*", "src/shared/**/*", "src/service/**/*"]
```

- [ ] **Step 2: Ajouter les tests et l'alias `src/service` à Vitest**

Dans `vitest.config.ts`, remplacer le tableau `include` :

```ts
    include: [
      'src/main/**/*.test.ts',
      'src/renderer/**/*.test.ts',
      'src/shared/**/*.test.ts',
      'src/service/**/*.test.ts',
    ],
```

Et ajouter l'alias `@service` dans `resolve.alias` :

```ts
      '@service': resolve('src/service'),
```

Note : le repo contient aussi `vitest.config.mjs`. Vérifier lequel Vitest charge
(`npx vitest run --reporter=verbose` affiche le fichier de config au démarrage) et
appliquer les mêmes `include` + alias au fichier réellement utilisé.

- [ ] **Step 3: Vérifier que le typecheck passe**

Run: `npm run typecheck:node`
Expected: PASS (le glob `src/service/**/*` ne matche encore rien — aucune erreur).

- [ ] **Step 4: Commit**

```bash
git add tsconfig.node.json vitest.config.ts
git commit -m "chore(service): inclure src/service dans tsconfig et vitest"
```

---

## Task 2: Spike de faisabilité — runtime, build, logging, node-windows

⚠️ **Tâche manuelle, exécutée par Obed sur une machine Windows réelle.** Non
automatisable par un subagent (lancement de processus, droits admin requis à
l'étape node-windows). Pas de TDD : c'est de l'exploration avec critères de
succès et un point de décision.

**Files:**
- Create: `electron.vite.service.config.ts`
- Create: `src/service/index.ts` (version spike minimale, conservée)
- Modify: `package.json`

- [ ] **Step 1: Créer la config de build de la cible service**

Créer `electron.vite.service.config.ts` :

```ts
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { externalizeDepsPlugin } from 'electron-vite'

// Build du process service. electron-vite ne gère nativement que
// main/preload/renderer ; on utilise une config Vite dédiée.
export default defineConfig({
  plugins: [externalizeDepsPlugin()],
  resolve: {
    alias: { '@shared': resolve('src/shared') },
  },
  build: {
    outDir: 'out/service',
    emptyOutDir: true,
    minify: false,
    target: 'node18',
    lib: {
      entry: resolve('src/service/index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.js',
    },
    rollupOptions: { external: ['electron'] },
  },
})
```

- [ ] **Step 2: Créer un service minimal (heartbeat)**

Créer `src/service/index.ts` :

```ts
import log from 'electron-log/node'

log.transports.file.fileName = 'vethos-service-spike.log'
log.info('[service] spike alive', { pid: process.pid })

setInterval(() => {
  log.info('[service] heartbeat', { uptimeMs: Math.round(process.uptime() * 1000) })
}, 5000)
```

- [ ] **Step 3: Ajouter les scripts npm**

Dans `package.json`, section `scripts`, ajouter :

```json
    "build:service": "vite build --config electron.vite.service.config.ts",
    "dev:service": "node scripts/run-service-dev.mjs",
```

(Le script `dev:service` sera créé en Tâche 7 ; l'ajouter ici évite un 2e commit.)

- [ ] **Step 4: Spike A — build + runtime Electron-as-Node**

Run: `npm run build:service`
Expected: `out/service/index.js` est produit sans erreur.

Run (cmd.exe) : `set ELECTRON_RUN_AS_NODE=1 && .\node_modules\electron\dist\electron.exe out\service\index.js`
Expected : le process tourne SANS fenêtre Electron ; un heartbeat est loggé toutes
les 5 s. `Ctrl+C` pour arrêter.

**Critère de succès A :** le bundle s'exécute comme du Node pur sur le binaire
Electron.

- [ ] **Step 5: Spike B — electron-log en mode Node**

Vérifier que le fichier `vethos-service-spike.log` a bien été écrit (chemin par
défaut d'electron-log ; le chercher dans `%LOCALAPPDATA%` ou via la sortie console).

**Critère de succès B :** `electron-log/node` écrit un fichier de log sans dépendre
de l'API `app` d'Electron. Si KO → repli : logger fichier maison minimal (à
documenter, impacte la Tâche 5).

- [ ] **Step 6: Spike C — node-windows installe le service**

Investiguer l'API `Service` de `node-windows@1.0.0-beta.8` (déjà en dépendance).
Objectif : enregistrer un service Windows qui exécute `out/service/index.js` **sur
le binaire Electron** (`ELECTRON_RUN_AS_NODE=1`), pas sur un `node` système absent
chez l'utilisateur final.

Pistes à tester, dans l'ordre :
1. Option `env` du constructeur `Service` pour injecter `ELECTRON_RUN_AS_NODE=1`,
   et voir si node-windows accepte un chemin d'exécutable custom.
2. Sinon : éditer la config winsw générée par node-windows (`<executable>` →
   `electron.exe`).
3. Repli ultime : enregistrer le service directement via `sc.exe create` (sans
   node-windows) pointant sur `electron.exe`.

Procédure de validation (terminal **admin**) :
- Installer un service de spike `VethosBlockingServiceSpike` exécutant le heartbeat.
- `sc query VethosBlockingServiceSpike` → état `RUNNING`.
- Fermer toute UI/terminal → le heartbeat continue dans le log (le service survit).
- Désinstaller le service de spike.

**Critère de succès C :** le service tourne en compte SYSTEM, démarre, survit, se
désinstalle proprement.

- [ ] **Step 7: Point de décision**

- Spikes A, B, C **tous OK** → continuer la Tâche 3.
- Un spike **KO** → STOP. Documenter le blocage, remonter à Obed, réviser le
  spec/plan (cf. spec §9 : repli vers `.exe` autonome via Node SEA) avant de
  reprendre.

- [ ] **Step 8: Commit**

```bash
git add electron.vite.service.config.ts src/service/index.ts package.json
git commit -m "feat(service): squelette du build service + spike runtime (Phase 1)"
```

---

## Task 3: Protocole partagé & framing des messages

**Files:**
- Create: `src/shared/service-protocol.ts`
- Test: `src/shared/service-protocol.test.ts`

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `src/shared/service-protocol.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { encodeMessage, createMessageDecoder, type ServiceMessage } from './service-protocol'

describe('service-protocol framing', () => {
  const ping: ServiceMessage = { kind: 'request', id: 'a1', type: 'PING' }

  it('encode ajoute exactement un saut de ligne final', () => {
    const encoded = encodeMessage(ping)
    expect(encoded.endsWith('\n')).toBe(true)
    expect(encoded.slice(0, -1).includes('\n')).toBe(false)
  })

  it('round-trip encode -> decode', () => {
    const decode = createMessageDecoder()
    expect(decode(encodeMessage(ping))).toEqual([ping])
  })

  it('décode plusieurs messages dans un même chunk', () => {
    const decode = createMessageDecoder()
    const chunk = encodeMessage(ping) + encodeMessage({ ...ping, id: 'a2' })
    const out = decode(chunk)
    expect(out.map((m) => (m as { id: string }).id)).toEqual(['a1', 'a2'])
  })

  it('bufferise un chunk partiel puis émet quand il est complet', () => {
    const decode = createMessageDecoder()
    const full = encodeMessage(ping)
    const cut = Math.floor(full.length / 2)
    expect(decode(full.slice(0, cut))).toEqual([])
    expect(decode(full.slice(cut))).toEqual([ping])
  })

  it('ignore les lignes vides', () => {
    const decode = createMessageDecoder()
    expect(decode('\n\n')).toEqual([])
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/shared/service-protocol.test.ts`
Expected: FAIL — `Failed to resolve import './service-protocol'`.

- [ ] **Step 3: Écrire l'implémentation**

Créer `src/shared/service-protocol.ts` :

```ts
/** Chemin du named pipe UI <-> Service. */
export const PIPE_PATH = '\\\\.\\pipe\\VethosServiceBridge'

export type ServiceRequest = {
  kind: 'request'
  id: string
  type: string
  payload?: unknown
}

export type ServiceResponse =
  | { kind: 'response'; id: string; ok: true; data?: unknown }
  | { kind: 'response'; id: string; ok: false; error: string }

export type ServiceEvent = {
  kind: 'event'
  type: string
  payload?: unknown
}

export type ServiceMessage = ServiceRequest | ServiceResponse | ServiceEvent

/** Renvoie l'info diagnostique du service (réponse de GET_SERVICE_INFO). */
export type ServiceInfo = {
  version: string
  pid: number
  uptimeMs: number
}

/** Sérialise un message en ligne JSON terminée par `\n`. */
export function encodeMessage(msg: ServiceMessage): string {
  return JSON.stringify(msg) + '\n'
}

/**
 * Crée un décodeur à état : accumule les chunks reçus du socket et renvoie les
 * messages complets (délimités par `\n`). Les chunks partiels sont bufferisés.
 */
export function createMessageDecoder(): (chunk: string) => ServiceMessage[] {
  let buffer = ''
  return (chunk: string): ServiceMessage[] => {
    buffer += chunk
    const messages: ServiceMessage[] = []
    let nl = buffer.indexOf('\n')
    while (nl !== -1) {
      const line = buffer.slice(0, nl)
      buffer = buffer.slice(nl + 1)
      if (line.trim() !== '') messages.push(JSON.parse(line) as ServiceMessage)
      nl = buffer.indexOf('\n')
    }
    return messages
  }
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/shared/service-protocol.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck & lint**

Run: `npm run typecheck:node && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/shared/service-protocol.ts src/shared/service-protocol.test.ts
git commit -m "feat(service): protocole de messages UI<->Service + framing"
```

---

## Task 4: Serveur named pipe

**Files:**
- Create: `src/service/bridge/server.ts`
- Test: `src/service/bridge/server.test.ts`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/service/bridge/server.test.ts` :

```ts
import { describe, it, expect, afterEach } from 'vitest'
import net from 'node:net'
import { createBridgeServer, type BridgeServer } from './server'
import { encodeMessage, createMessageDecoder, type ServiceMessage } from '@shared/service-protocol'

const testPipe = (): string => `\\\\.\\pipe\\vethos-test-${process.pid}-${Math.random().toString(36).slice(2)}`

let server: BridgeServer | null = null
afterEach(async () => {
  await server?.close()
  server = null
})

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

describe('createBridgeServer', () => {
  it('route une requête vers son handler et répond avec le même id', async () => {
    const pipe = testPipe()
    server = await createBridgeServer({
      pipePath: pipe,
      handlers: { PING: async () => 'pong' },
    })
    const client = net.createConnection(pipe)
    const inbox = collect(client)
    client.write(encodeMessage({ kind: 'request', id: 'r1', type: 'PING' }))
    const res = await inbox.next()
    expect(res).toEqual({ kind: 'response', id: 'r1', ok: true, data: 'pong' })
    client.destroy()
  })

  it('répond ok:false pour un type de requête inconnu', async () => {
    const pipe = testPipe()
    server = await createBridgeServer({ pipePath: pipe, handlers: {} })
    const client = net.createConnection(pipe)
    const inbox = collect(client)
    client.write(encodeMessage({ kind: 'request', id: 'r2', type: 'NOPE' }))
    const res = await inbox.next()
    expect(res).toMatchObject({ kind: 'response', id: 'r2', ok: false })
    client.destroy()
  })

  it('broadcast pousse un événement aux clients connectés', async () => {
    const pipe = testPipe()
    server = await createBridgeServer({ pipePath: pipe, handlers: {} })
    const client = net.createConnection(pipe)
    const inbox = collect(client)
    await new Promise((r) => client.once('connect', r))
    server.broadcast({ type: 'SESSION_CHANGED', payload: { foo: 1 } })
    const evt = await inbox.next()
    expect(evt).toEqual({ kind: 'event', type: 'SESSION_CHANGED', payload: { foo: 1 } })
    client.destroy()
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/service/bridge/server.test.ts`
Expected: FAIL — `Failed to resolve import './server'`.

- [ ] **Step 3: Écrire l'implémentation**

Créer `src/service/bridge/server.ts` :

```ts
import net from 'node:net'
import {
  PIPE_PATH,
  encodeMessage,
  createMessageDecoder,
  type ServiceRequest,
  type ServiceResponse,
  type ServiceEvent,
} from '@shared/service-protocol'

export type RequestHandler = (req: ServiceRequest) => Promise<unknown>

export type BridgeServer = {
  /** Pousse un événement à tous les clients connectés. */
  broadcast: (event: Omit<ServiceEvent, 'kind'>) => void
  /** Ferme le serveur et toutes les connexions. */
  close: () => Promise<void>
}

export function createBridgeServer(opts: {
  pipePath?: string
  handlers: Record<string, RequestHandler>
  onError?: (err: Error) => void
}): Promise<BridgeServer> {
  const pipePath = opts.pipePath ?? PIPE_PATH
  const sockets = new Set<net.Socket>()

  async function handleRequest(req: ServiceRequest, socket: net.Socket): Promise<void> {
    const handler = opts.handlers[req.type]
    let res: ServiceResponse
    if (!handler) {
      res = { kind: 'response', id: req.id, ok: false, error: `Unknown request type: ${req.type}` }
    } else {
      try {
        res = { kind: 'response', id: req.id, ok: true, data: await handler(req) }
      } catch (err) {
        res = { kind: 'response', id: req.id, ok: false, error: (err as Error).message }
      }
    }
    if (!socket.destroyed) socket.write(encodeMessage(res))
  }

  const server = net.createServer((socket) => {
    sockets.add(socket)
    socket.setEncoding('utf8')
    const decode = createMessageDecoder()
    socket.on('data', (chunk: string) => {
      let messages
      try {
        messages = decode(chunk)
      } catch (err) {
        opts.onError?.(err as Error)
        return
      }
      for (const msg of messages) {
        if (msg.kind === 'request') void handleRequest(msg, socket)
      }
    })
    socket.on('error', (err) => opts.onError?.(err))
    socket.on('close', () => sockets.delete(socket))
  })

  return new Promise<BridgeServer>((resolve, reject) => {
    server.once('error', reject)
    server.listen(pipePath, () => {
      server.removeListener('error', reject)
      resolve({
        broadcast(event) {
          const line = encodeMessage({ kind: 'event', ...event })
          for (const s of sockets) if (!s.destroyed) s.write(line)
        },
        close() {
          return new Promise<void>((res) => {
            for (const s of sockets) s.destroy()
            server.close(() => res())
          })
        },
      })
    })
  })
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/service/bridge/server.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck & lint**

Run: `npm run typecheck:node && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/service/bridge/server.ts src/service/bridge/server.test.ts
git commit -m "feat(service): serveur named pipe + routage des requêtes"
```

---

## Task 5: Point d'entrée du service (Phase 1)

**Files:**
- Create: `src/service/data-dir.ts`
- Create: `src/service/logging.ts`
- Modify: `src/service/index.ts` (remplace la version spike de la Tâche 2)

- [ ] **Step 1: Résolution du répertoire de données**

Créer `src/service/data-dir.ts` :

```ts
import { join } from 'node:path'

/**
 * Répertoire de données du service, partagé entre le service (SYSTEM) et l'UI
 * (utilisateur) : `C:\ProgramData\Vethos`. Voir spec §4.4.
 */
export function serviceDataDir(): string {
  const programData = process.env['ProgramData'] ?? 'C:\\ProgramData'
  return join(programData, 'Vethos')
}
```

- [ ] **Step 2: Logging du service**

Créer `src/service/logging.ts` :

```ts
import { join } from 'node:path'
import log from 'electron-log/node'
import { serviceDataDir } from './data-dir'

// electron-log en mode Node : l'API `app` d'Electron est indisponible sous
// ELECTRON_RUN_AS_NODE. Approche validée par le spike (Tâche 2, étape 5).
log.transports.file.resolvePathFn = () =>
  join(serviceDataDir(), 'logs', 'vethos-service.log')
log.transports.file.maxSize = 10 * 1024 * 1024

export default log
```

Note : si le spike B a imposé un repli (logger maison), remplacer ce fichier par
l'implémentation de repli en conservant la même export par défaut (objet avec
`.info` / `.warn` / `.error`).

- [ ] **Step 3: Réécrire `src/service/index.ts`**

Remplacer **tout** le contenu de `src/service/index.ts` (version spike) par :

```ts
import { createBridgeServer, type BridgeServer } from './bridge/server'
import type { ServiceInfo } from '@shared/service-protocol'
import log from './logging'

const SERVICE_VERSION = '0.12.0'
const startedAt = Date.now()

async function main(): Promise<void> {
  log.info('[service] starting', { pid: process.pid })

  const server: BridgeServer = await createBridgeServer({
    handlers: {
      PING: async () => 'pong',
      GET_SERVICE_INFO: async (): Promise<ServiceInfo> => ({
        version: SERVICE_VERSION,
        pid: process.pid,
        uptimeMs: Date.now() - startedAt,
      }),
    },
    onError: (err) => log.error('[service] bridge error', err),
  })

  log.info('[service] bridge listening')

  const shutdown = (signal: string): void => {
    log.info('[service] shutting down', { signal })
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

- [ ] **Step 4: Build du service**

Run: `npm run build:service`
Expected: `out/service/index.js` produit sans erreur.

- [ ] **Step 5: Vérification manuelle du pipe**

⚠️ Étape manuelle (lance un process). Terminal 1 :
`set ELECTRON_RUN_AS_NODE=1 && .\node_modules\electron\dist\electron.exe out\service\index.js`
Expected : log « bridge listening ».

Terminal 2 — tester le pipe avec un mini-client Node :
`node -e "const n=require('net');const s=n.createConnection('\\\\\\\\.\\\\pipe\\\\VethosServiceBridge');s.on('connect',()=>s.write(JSON.stringify({kind:'request',id:'x',type:'PING'})+'\n'));s.on('data',d=>{console.log(d.toString());process.exit(0)})"`
Expected : affiche `{"kind":"response","id":"x","ok":true,"data":"pong"}`.

- [ ] **Step 6: Typecheck & lint**

Run: `npm run typecheck:node && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/service/data-dir.ts src/service/logging.ts src/service/index.ts
git commit -m "feat(service): point d'entrée + handlers PING/GET_SERVICE_INFO"
```

---

## Task 6: Client named pipe (côté UI)

**Files:**
- Create: `src/main/service-client/client.ts`
- Test: `src/main/service-client/client.test.ts`

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/main/service-client/client.test.ts` :

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { createBridgeServer, type BridgeServer } from '@service/bridge/server'
import { createServiceClient, type ServiceClient } from './client'

const testPipe = (): string => `\\\\.\\pipe\\vethos-test-${process.pid}-${Math.random().toString(36).slice(2)}`
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

let server: BridgeServer | null = null
let client: ServiceClient | null = null
afterEach(async () => {
  client?.close()
  client = null
  await server?.close()
  server = null
})

describe('createServiceClient', () => {
  it('envoie une requête et résout avec la réponse corrélée', async () => {
    const pipe = testPipe()
    server = await createBridgeServer({ pipePath: pipe, handlers: { PING: async () => 'pong' } })
    client = createServiceClient({ pipePath: pipe })
    await wait(100)
    expect(client.isConnected()).toBe(true)
    await expect(client.request('PING')).resolves.toBe('pong')
  })

  it('rejette quand le handler renvoie une erreur', async () => {
    const pipe = testPipe()
    server = await createBridgeServer({
      pipePath: pipe,
      handlers: { BOOM: async () => { throw new Error('nope') } },
    })
    client = createServiceClient({ pipePath: pipe })
    await wait(100)
    await expect(client.request('BOOM')).rejects.toThrow('nope')
  })

  it('délivre les événements broadcastés', async () => {
    const pipe = testPipe()
    server = await createBridgeServer({ pipePath: pipe, handlers: {} })
    client = createServiceClient({ pipePath: pipe })
    await wait(100)
    const received: unknown[] = []
    client.onEvent((e) => received.push(e))
    server.broadcast({ type: 'CLOCK_TAMPER', payload: { driftMs: 9000 } })
    await wait(100)
    expect(received).toEqual([{ kind: 'event', type: 'CLOCK_TAMPER', payload: { driftMs: 9000 } }])
  })

  it('rejette une requête quand le service est injoignable', async () => {
    client = createServiceClient({ pipePath: testPipe() })
    await wait(100)
    expect(client.isConnected()).toBe(false)
    await expect(client.request('PING')).rejects.toThrow('not connected')
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/main/service-client/client.test.ts`
Expected: FAIL — `Failed to resolve import './client'`.

- [ ] **Step 3: Écrire l'implémentation**

Créer `src/main/service-client/client.ts` :

```ts
import net from 'node:net'
import { randomUUID } from 'node:crypto'
import {
  PIPE_PATH,
  encodeMessage,
  createMessageDecoder,
  type ServiceEvent,
} from '@shared/service-protocol'

export type ServiceClient = {
  /** Envoie une requête ; résout avec `data`, rejette sur erreur/timeout. */
  request: (type: string, payload?: unknown) => Promise<unknown>
  /** Abonne un callback aux événements poussés par le service. */
  onEvent: (cb: (event: ServiceEvent) => void) => void
  isConnected: () => boolean
  close: () => void
}

const REQUEST_TIMEOUT_MS = 5000
const MAX_RECONNECT_DELAY_MS = 10_000

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }

export function createServiceClient(opts?: {
  pipePath?: string
  onStatusChange?: (connected: boolean) => void
}): ServiceClient {
  const pipePath = opts?.pipePath ?? PIPE_PATH
  const pending = new Map<string, Pending>()
  const eventListeners: Array<(e: ServiceEvent) => void> = []
  let socket: net.Socket | null = null
  let connected = false
  let reconnectDelay = 500
  let closed = false

  function connect(): void {
    if (closed) return
    const decode = createMessageDecoder()
    const s = net.createConnection(pipePath)
    s.setEncoding('utf8')

    s.on('connect', () => {
      socket = s
      connected = true
      reconnectDelay = 500
      opts?.onStatusChange?.(true)
    })

    s.on('data', (chunk: string) => {
      let messages
      try {
        messages = decode(chunk)
      } catch {
        return
      }
      for (const msg of messages) {
        if (msg.kind === 'response') {
          const p = pending.get(msg.id)
          if (!p) continue
          clearTimeout(p.timer)
          pending.delete(msg.id)
          if (msg.ok) p.resolve(msg.data)
          else p.reject(new Error(msg.error))
        } else if (msg.kind === 'event') {
          for (const cb of eventListeners) cb(msg)
        }
      }
    })

    // 'error' précède 'close' ; on laisse 'close' gérer la reconnexion.
    s.on('error', () => undefined)
    s.on('close', () => {
      if (socket === s) {
        socket = null
        connected = false
        opts?.onStatusChange?.(false)
      }
      if (!closed) {
        setTimeout(connect, reconnectDelay)
        reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS)
      }
    })
  }

  connect()

  return {
    request(type, payload) {
      return new Promise<unknown>((resolve, reject) => {
        if (!socket || !connected) {
          reject(new Error('Service not connected'))
          return
        }
        const id = randomUUID()
        const timer = setTimeout(() => {
          pending.delete(id)
          reject(new Error(`Service request timed out: ${type}`))
        }, REQUEST_TIMEOUT_MS)
        pending.set(id, { resolve, reject, timer })
        socket.write(encodeMessage({ kind: 'request', id, type, payload }))
      })
    },
    onEvent(cb) {
      eventListeners.push(cb)
    },
    isConnected: () => connected,
    close() {
      closed = true
      for (const p of pending.values()) {
        clearTimeout(p.timer)
        p.reject(new Error('Service client closed'))
      }
      pending.clear()
      socket?.destroy()
    },
  }
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/main/service-client/client.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck & lint**

Run: `npm run typecheck:node && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/service-client/client.ts src/main/service-client/client.test.ts
git commit -m "feat(service): client named pipe côté UI (requêtes + events + reconnexion)"
```

---

## Task 7: Câblage UI & workflow de dev

**Files:**
- Create: `scripts/run-service-dev.mjs`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Script de lancement du service en dev**

Créer `scripts/run-service-dev.mjs` :

```js
// Lance le service en dev : build puis exécution sur le binaire Electron
// en mode Node (ELECTRON_RUN_AS_NODE). Utilisé par `npm run dev:service`.
import { spawnSync, spawn } from 'node:child_process'
import { join } from 'node:path'

const build = spawnSync('npm', ['run', 'build:service'], { stdio: 'inherit', shell: true })
if (build.status !== 0) process.exit(build.status ?? 1)

const electronExe = join('node_modules', 'electron', 'dist', 'electron.exe')
const child = spawn(electronExe, [join('out', 'service', 'index.js')], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
})
child.on('exit', (code) => process.exit(code ?? 0))
```

- [ ] **Step 2: Ping du service au démarrage de l'UI**

Dans `src/main/index.ts`, ajouter l'import en tête (près des autres imports) :

```ts
import { createServiceClient } from './service-client/client'
```

Puis, dans le callback `app.whenReady().then(async () => { ... })`, après la ligne
`startUpdater(() => mainWindow)`, ajouter :

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

- [ ] **Step 3: Vérification manuelle bout-en-bout**

⚠️ Étape manuelle. Terminal 1 : `npm run dev:service` (laisse tourner).
Terminal 2 : `npm run dev`.
Expected : le log du `main` (`%APPDATA%\Vethos\logs\vethos.log` ou la console dev)
contient `[main] service joignable { version: '0.12.0', pid: ..., uptimeMs: ... }`.

Puis fermer le service (Ctrl+C terminal 1), relancer `npm run dev` : le log
contient `[main] service injoignable` — sans crash de l'UI.

- [ ] **Step 4: Typecheck, lint & tests complets**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: PASS partout.

- [ ] **Step 5: Commit**

```bash
git add scripts/run-service-dev.mjs src/main/index.ts
git commit -m "feat(service): câblage UI->service au démarrage + script dev:service"
```

---

## Phases suivantes (hors de ce plan)

Une fois la Phase 1 livrée et les spikes validés, chaque phase aura son plan :

- **Phase 2** — migration du blocage dans le service ; l'UI bascule en client pipe ;
  fichiers vers `C:\ProgramData\Vethos`. Élargit le protocole (`GET_STATE`,
  `START_SESSION`, etc.) et les événements.
- **Phase 3** — vrai service Windows via node-windows (install par helper élevé +
  `sudo-prompt`), retrait de `requireAdministrator`, bandeau « service indisponible ».
- **Phase 4** — durcissement : ACL du pipe, reconnexion, notification « service non
  démarré », nettoyage.

Réf. spec : `docs/superpowers/specs/2026-05-15-vethos-windows-service-design.md` §11.
