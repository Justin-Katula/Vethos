# Vethos — Service Windows de blocage (V3 · Problème 16)

**Auteur :** Obed (avec Claude)
**Date :** 2026-05-15
**Statut :** Spec validée, prête pour planification
**Réf. :** Prompt V3 — Problème 16. Complète le sous-projet 2 (système de blocage).

---

## 1. Objectif

Aujourd'hui, tout le blocage tourne dans le **process main d'Electron**. Si
l'utilisateur ouvre le Gestionnaire des tâches et tue `Vethos.exe`, le blocage
s'arrête : le drift detector ne tourne plus, hosts et firewall ne sont plus
surveillés. Vethos n'est donc pas un « vrai » bloqueur.

Ce sous-projet déplace le blocage dans un **service Windows séparé**. À la fin :

1. Tout le blocage (hosts, firewall, process, AppLocker, drift detector, clock
   monitor, timer de session, persistance de l'état de blocage) tourne dans un
   **service Windows**, en compte **SYSTEM**, démarré au boot Windows.
2. L'UI Electron tourne en **utilisateur normal** (plus de `requireAdministrator`)
   et communique avec le service via un **named pipe**.
3. Fermer ou tuer l'UI **n'arrête pas le blocage**. Le service tient.
4. Si le service est absent / arrêté / planté, l'UI le détecte, propose de le
   **réparer** (élévation ponctuelle), et — en cas d'échec — affiche un bandeau
   honnête et désactive le démarrage de session.

**Ce sous-projet ne couvre PAS** la résistance au kill du *service lui-même*
(P14, watchdog) ni la détection d'édition Windows pour AppLocker (P17). P16 pose
l'architecture ; P14 et P17 s'appuieront dessus.

---

## 2. Contexte & principes (Prompt V3)

| Principe | Source | Application concrète |
|---|---|---|
| Le service fait tout le blocage, l'UI n'affiche que | V3 P16 | Un seul pipeline de blocage, dans le service |
| L'UI peut être lancée sans admin | V3 P16 (modèle Cold Turkey) | `requireAdministrator` retiré ; UI en utilisateur normal |
| Communication par named pipe (pas TCP) | V3 P16 | `\\.\pipe\VethosServiceBridge`, isolé, non exposé au réseau |
| Service avec auto-restart | V3 P16 | `node-windows` `maxRestarts` / `wait` / `grow` |
| Honnêteté UI > marketing | V3 P13/P17 | Service KO → bandeau explicite, démarrage de session désactivé |
| Pas de solution inventée | V3 méthode | `node-windows` (déjà en dépendance), `sudo-prompt` (déjà en dépendance) |

**Limite connue (V3, assumée) :** sur Windows Home, un utilisateur admin peut
toujours arrêter le service via `services.msc`. L'empêcher totalement exigerait un
driver kernel — hors scope définitif.

---

## 3. Décisions de cadrage (validées avec l'utilisateur)

1. **Service indisponible → échec honnête + auto-réparation.** Un seul pipeline de
   blocage (dans le service). **Pas** de repli en-process : on évite de maintenir
   deux pipelines de blocage en parallèle.
2. **UI non-élevée.** `requestedExecutionLevel: requireAdministrator` est retiré.
   Le service est installé/réparé via une **élévation ponctuelle `sudo-prompt`**.
3. **Runtime du service : le binaire Electron en mode Node** (`ELECTRON_RUN_AS_NODE=1`).
   Aucun runtime Node supplémentaire à embarquer ni à compiler.

---

## 4. Architecture

### 4.1 Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────┐
│                      VETHOS UI (utilisateur)                  │
│  renderer  ──IPC──▶  main                                     │
│                       │                                      │
│                       │  service-client (named pipe client)  │
│                       ▼                                      │
└───────────────────────┼──────────────────────────────────────┘
                        │   \\.\pipe\VethosServiceBridge
                        │   (requêtes corrélées + events push)
┌───────────────────────▼──────────────────────────────────────┐
│                  VETHOS SERVICE (SYSTEM, boot)                 │
│   bridge/server  ──▶  SESSION MANAGER (state machine)         │
│                         • hosts · processes · firewall       │
│                         • AppLocker · drift detector         │
│                         • clock monitor · timer de session   │
└───────────────────────┼──────────────────────────────────────┘
                        ▼
              ┌──────────────────────────────┐
              │  C:\ProgramData\Vethos\        │
              │   vethos_blocking.json         │  profils + historique
              │   vethos_blocking_active.json  │  session en cours
              │   hosts.vethos.backup          │
              └──────────────────────────────┘
```

**Sens de circulation :**
- `renderer → main` : canaux IPC `BLOCKING_*` **inchangés**.
- `main → service` : le `main` ne fait plus de blocage ; il **relaie** chaque
  appel IPC vers le service via le named pipe.
- `service → main → renderer` : les événements du service (`SESSION_CHANGED`,
  `LAYER_DRIFT`, `CLOCK_TAMPER`, `SESSION_ENDED`) remontent par le pipe, puis
  sont re-`webContents.send` sur les canaux `BLOCKING_EVENT_*` existants.

### 4.2 Structure de fichiers

```
src/service/                          # NOUVEAU — process du service
├── index.ts                          # point d'entrée du service
├── logging.ts                        # electron-log en mode Node (sans API Electron)
├── data-dir.ts                       # résout C:\ProgramData\Vethos
├── bridge/
│   ├── server.ts                     # serveur named pipe + routage
│   └── server.test.ts
├── blocking/                         # DÉPLACÉ depuis src/main/blocking/
│   ├── hosts/  processes/  firewall/  applocker/
│   ├── session/  (manager, persistence, drift-detector,
│   │              clock-monitor, timer, rules, locks/)
│   └── safe-list.ts …
└── install/
    ├── service-control.ts            # node-windows : install/start/stop/uninstall
    └── migrate-legacy.ts             # copie vethos_blocking*.json → ProgramData

src/main/
├── service-client/                   # NOUVEAU
│   ├── client.ts                     # client pipe : connexion, requêtes
│   │                                 #   corrélées, events, reconnexion backoff
│   ├── service-status.ts             # détecte installé/démarré → réparation
│   └── client.test.ts
├── elevated-install.ts               # NOUVEAU — lance le helper via sudo-prompt
├── blocking/ipc/blocking.handlers.ts # RÉÉCRIT — relaie IPC renderer ↔ client pipe
└── index.ts                          # MODIFIÉ — flag --install-service, statut service

src/shared/
└── service-protocol.ts               # NOUVEAU — types des messages UI↔Service
```

Le module `src/main/storage/` est générique (lecture/écriture JSON atomique, prend
un répertoire de base en paramètre). Il est réutilisé tel quel par le service ;
s'il dépend d'une API Electron, en extraire la partie pure vers `src/shared/`.

### 4.3 Le pont — protocole du named pipe

Pipe : `\\.\pipe\VethosServiceBridge`. Service = serveur (`net.createServer`), UI =
client (`net.createConnection`). Messages **JSON délimités par `\n`** (le JSON
échappe les sauts de ligne internes, le délimiteur est donc sûr).

```ts
// src/shared/service-protocol.ts
export type ServiceRequest =
  | { kind: 'request'; id: string; type: 'PING' }
  | { kind: 'request'; id: string; type: 'GET_STATE' }
  | { kind: 'request'; id: string; type: 'SAVE_PROFILE'; payload: unknown }
  | { kind: 'request'; id: string; type: 'DELETE_PROFILE'; payload: { id: string } }
  | { kind: 'request'; id: string; type: 'START_SESSION';
      payload: { profileId: string; durationMinutes: number;
                 sessionRulesEnabled: boolean; strictBlocking: boolean } }
  | { kind: 'request'; id: string; type: 'REQUEST_UNLOCK' }
  | { kind: 'request'; id: string; type: 'SUBMIT_JUSTIFICATION'; payload: { text: string } }
  | { kind: 'request'; id: string; type: 'GET_LAYER_STATUS' }

export type ServiceResponse =
  | { kind: 'response'; id: string; ok: true; data?: unknown }
  | { kind: 'response'; id: string; ok: false; error: string }

export type ServiceEvent =
  | { kind: 'event'; type: 'SESSION_CHANGED'; payload: unknown }
  | { kind: 'event'; type: 'SESSION_ENDED'; payload: unknown }
  | { kind: 'event'; type: 'LAYER_DRIFT'; payload: unknown }
  | { kind: 'event'; type: 'CLOCK_TAMPER'; payload: { driftMs: number } }
```

- Chaque requête porte un `id` (uuid) ; la réponse réutilise le même `id` →
  corrélation côté client.
- `START_SESSION` transporte `sessionRulesEnabled` et `strictBlocking` : ces deux
  réglages vivent côté UI (`%APPDATA%`) mais le service en a besoin. Le service
  **re-valide** lui-même les règles de session avec l'historique qu'il possède —
  il ne fait jamais confiance au client (un utilisateur pourrait parler au pipe
  directement).
- `GET_LAYER_STATUS` doit retourner le **vrai** statut des couches (corrige au
  passage le bug `BLOCKING_GET_LAYER_STATUS` qui renvoyait `'ok'` en dur — Partie E
  de l'audit).

### 4.4 Propriété des données — `C:\ProgramData\Vethos\`

Le service tourne en SYSTEM, l'UI en utilisateur : `app.getPath('userData')`
résout vers des dossiers différents. Les fichiers de blocage déménagent donc vers
un emplacement **machine** partagé.

- **Possédés par le service** (`C:\ProgramData\Vethos\`) : `vethos_blocking.json`
  (profils + historique), `vethos_blocking_active.json` (session active),
  `hosts.vethos.backup`. Source de vérité unique. L'UI ne les lit/écrit **jamais**
  en direct — uniquement via `GET_STATE`.
- **Restent côté UI** (`%APPDATA%\Vethos`) : `settings`, `schedule`, `objectives`,
  `stats`, `app-usage`, etc. — tout ce qui n'est pas du blocage.
- Le service crée `C:\ProgramData\Vethos\` avec une ACL : écriture SYSTEM/Admins,
  lecture pour les utilisateurs.

### 4.5 Runtime & build

- Le service s'exécute sur le binaire Electron embarqué lancé avec
  `ELECTRON_RUN_AS_NODE=1` (mode Node pur — l'API Electron `app` n'est PAS
  disponible ; le service n'utilise donc que des API Node + `C:\ProgramData`).
- Le bundle service est produit par une étape de build dédiée pour `src/service/`
  (electron-vite ne gère nativement que `main`/`preload`/`renderer` ; on ajoute une
  configuration de build Vite pour la cible `service`). À trancher en Phase 1.
- Logging : `electron-log` en mode Node (`electron-log/node`), car `electron-log/main`
  dépend de l'API `app`. À valider en Phase 1.

---

## 5. Cycle de vie du service

### 5.1 Installation & réparation (sudo-prompt + node-windows)

- L'installation se fait en relançant le binaire Vethos avec un flag :
  `Vethos.exe --install-service <userDataPath>`, via `sudo-prompt` (élévation UAC
  ponctuelle).
- `src/main/index.ts` détecte ce flag **tout au début** : si présent, il exécute la
  routine d'installation au lieu d'ouvrir l'UI, puis quitte. La routine :
  1. `node-windows` `Service.install()` + `start()` (service `VethosBlockingService`,
     auto-restart configuré).
  2. **Migration** : copie les `vethos_blocking*.json` et `hosts.vethos.backup`
     existants depuis `<userDataPath>` vers `C:\ProgramData\Vethos\` (le helper est
     élevé, il peut écrire ProgramData ; le `<userDataPath>` est passé par l'UI).
- node-windows lance par défaut le script via `node`. Le service devant tourner
  sur le binaire Electron embarqué, l'intégration node-windows ↔ `ELECTRON_RUN_AS_NODE`
  est le point technique le plus incertain → **spike en Phase 1** (cf. §9).

### 5.2 Démarrage & résilience

- Le service démarre automatiquement au boot Windows.
- Auto-restart `node-windows` en cas de crash (`maxRestarts`, `wait`, `grow`).
- Au démarrage, le service exécute `hydrateFromDisk()` : si une session active
  valide existe, il ré-applique les couches ; sinon il nettoie les orphelins.

### 5.3 Détection côté UI

- Au lancement, l'UI (`service-status.ts`) se connecte au pipe et envoie `PING`.
- Pas de pipe / pas de réponse → statut `unavailable`. L'UI déclenche le flux
  d'auto-réparation : service non installé → dialog « Installer le composant de
  blocage » → `sudo-prompt` ; service installé mais arrêté → tentative de
  redémarrage (élévation ponctuelle si nécessaire).
- Échec de réparation → statut `unavailable` persistant.

---

## 6. Migration du code

- `src/main/blocking/{hosts,processes,firewall,applocker,session}` → déplacé sous
  `src/service/blocking/`. `createSessionManager` et ses adapters bougent **quasi
  tels quels** : le manager est déjà découplé d'Electron (orchestration via
  adapters injectés).
- `src/service/index.ts` : instancie `storage(C:\ProgramData\Vethos)`, le session
  manager, le drift detector, le clock monitor, démarre le serveur pipe, route les
  messages. Reprend la logique de `registerBlockingHandlers` côté service.
- `src/main/blocking/ipc/blocking.handlers.ts` : **réécrit**. Ne crée plus de
  manager. Chaque `ipcMain.handle(BLOCKING_*)` devient un appel `request()` du
  client pipe ; les `ServiceEvent` reçus sont re-`webContents.send` sur les canaux
  `BLOCKING_EVENT_*`.
- `notifications.ts` **reste côté UI** (API `Notification` d'Electron). Le service
  émet des événements ; l'UI déclenche la notif correspondante. UI fermée = pas de
  notif, mais le blocage tient (acceptable).
- `elevation.ts` : la détection « suis-je admin » disparaît du chemin de blocage.
  L'invocation `sudo-prompt` est conservée et déplacée vers `elevated-install.ts`.
- `electron-builder.yml` : retrait de `requestedExecutionLevel: requireAdministrator` ;
  ajout du bundle `service` aux `files` et du binaire winsw de node-windows aux
  `extraResources`.

---

## 7. Comportement de l'UI

- Le flux de données de blocage du **renderer ne change pas** : mêmes canaux IPC,
  mêmes stores, mêmes composants (profils, session active, historique, unlock).
  Seule la source des données passe désormais par le pipe.
- **Ajout** dans `BlockingPage` : un bandeau d'état du service (`ok` /
  `installing` / `unavailable`), réutilisant exactement le pattern du bandeau admin
  P13 actuel — bandeau persistant + bouton « Réparer » + bouton « Démarrer »
  désactivé quand le service est indisponible. Ce bandeau **remplace** le bandeau
  admin P13 (l'UI n'étant plus élevée, l'ancien bandeau admin n'a plus de sens).
- Nouveaux canaux IPC : `BLOCKING_GET_SERVICE_STATUS`, `BLOCKING_REPAIR_SERVICE`,
  et l'événement `BLOCKING_EVENT_SERVICE_STATUS`.

---

## 8. Erreurs & sécurité

- **ACL du pipe** : le service crée le pipe avec un descripteur de sécurité
  autorisant les utilisateurs interactifs locaux à se connecter, refusant l'accès
  réseau.
- **Validation côté service** : safe-list des process et validation des profils
  re-vérifiées dans le service. Aucune confiance accordée aux messages du pipe.
- **Reconnexion** : si le pipe tombe (service qui redémarre), le client retente la
  connexion avec backoff ; le bandeau « service indisponible » s'affiche
  entre-temps, puis disparaît à la reconnexion.
- **Service down en pleine session** : les règles hosts/firewall posées restent
  actives ; au redémarrage (auto-restart), le service ré-hydrate depuis
  `vethos_blocking_active.json`. Le nettoyage des orphelins en cas d'arrêt
  *définitif* relève de P14.
- **Échec d'installation/réparation** : jamais de crash silencieux — bandeau +
  log `electron-log`.

---

## 9. Risques & inconnues — à dé-risquer en Phase 1 (spikes)

1. **node-windows + binaire Electron.** node-windows assume `node` ; il faut le
   faire pointer sur `Vethos.exe` avec `ELECTRON_RUN_AS_NODE=1`. Spike : installer un
   service minimal qui logge un battement, vérifier qu'il démarre en SYSTEM au boot.
2. **Build de la 4e cible `service`.** electron-vite ne gère que main/preload/
   renderer. Spike : produire un bundle `src/service/index.ts` exécutable.
3. **electron-log hors Electron.** Vérifier `electron-log/node` dans le contexte
   `ELECTRON_RUN_AS_NODE`. Repli : logger fichier minimal maison.

Si un spike échoue, on réévalue le runtime (option B du design : `.exe` autonome
via Node SEA) **avant** d'entamer la Phase 2.

---

## 10. Tests (Vitest)

- **TDD** : `bridge` (encodage/décodage des messages, framing `\n`, corrélation
  des `id`) et `service-client` (requêtes, timeout, reconnexion) — testés avec une
  paire serveur/client en mémoire.
- `createSessionManager` : tests unitaires existants conservés (adapters mockés) —
  inchangés par le déménagement.
- `service-status` : logique installé/démarré/à-réparer testée avec un contrôle de
  service mocké.
- **Intégration** (manuel, `VETHOS_INTEG=1`) : installation réelle du service
  node-windows, survie au kill de l'UI, communication pipe réelle. Non joués en CI
  (inhérent à un service Windows).

---

## 11. Découpage en phases

Le plan d'implémentation détaillera ; vue d'ensemble :

- **Phase 1 — Spikes + squelette.** Dé-risquer les 3 inconnues (§9). Créer
  `src/service/` + serveur pipe répondant à `PING`/`GET_STATE` ; client pipe côté
  UI. Le blocage **reste dans le main** — rien de visible ne change.
- **Phase 2 — Migration du blocage.** Déplacer les modules de blocage dans le
  service ; le service (lancé comme **processus détaché**) porte le blocage ; l'UI
  bascule en client pipe ; fichiers migrés vers ProgramData. Payoff : tuer l'UI ne
  stoppe plus le blocage. L'UI reste **temporairement élevée** (transitoire).
- **Phase 3 — Vrai service Windows.** node-windows : install via helper élevé +
  `sudo-prompt`, démarrage au boot en SYSTEM, auto-restart. Retrait de
  `requireAdministrator`. Bandeau « service indisponible » + réparation.
- **Phase 4 — Durcissement.** ACL du pipe, reconnexion/backoff, notification
  « service non démarré » (réclamée aussi par P22), nettoyage, `VETHOS_SPEC.md`.

---

## 12. Critères d'acceptation

1. Le blocage (hosts, firewall, process, AppLocker, drift, clock monitor, timer)
   tourne intégralement dans le service ; le `main` n'en exécute plus aucun.
2. Tuer `Vethos.exe` (UI) pendant une session active **n'arrête pas** le blocage
   (vérifié : règles hosts/firewall toujours présentes après le kill).
3. Le service démarre automatiquement au boot Windows, en compte SYSTEM.
4. L'UI tourne sans `requireAdministrator` ; aucune prompt UAC au lancement normal.
5. Service absent → l'UI propose l'installation (`sudo-prompt`), l'installe, et le
   blocage devient opérationnel.
6. Service indisponible → bandeau persistant + bouton Réparer + démarrage de
   session désactivé.
7. Communication UI↔service par named pipe ; reconnexion automatique après
   redémarrage du service.
8. Les fichiers `vethos_blocking*.json` sont migrés vers `C:\ProgramData\Vethos\` ;
   un utilisateur existant ne perd ni profils ni historique.
9. `GET_LAYER_STATUS` renvoie le statut réel des couches (plus de `'ok'` en dur).
10. Lint + typecheck (Node + Web + service) + Vitest (unitaires) tous verts.
11. `VETHOS_SPEC.md` mis à jour.

---

## 13. Hors scope (sous-projets suivants)

- **P14** — watchdog sidecar qui relance l'UI/le service ; handlers de cleanup
  `process.on('exit'/'SIGINT'/'SIGTERM'/'uncaughtException')`. Le service a déjà
  l'auto-restart node-windows ; le watchdog complet reste P14.
- **P17** — détection de l'édition Windows + `pickBlockingStrategy` + WMI Bridge.
  La couche AppLocker **migre** dans le service telle quelle, mais le choix de
  stratégie par édition reste P17.
- Empêcher l'arrêt du service via `services.msc` : impossible sans driver kernel
  (V3 le confirme) — hors scope définitif.
- Installation du service via le postInstall NSIS (option écartée au cadrage au
  profit de l'install par `sudo-prompt`).
