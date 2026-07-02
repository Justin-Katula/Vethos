# Vethos — Sous-projet 2 : Système de blocage

**Auteur :** Obed (avec Claude)
**Date :** 2026-05-04
**Statut :** Spec validée, prête pour planification

---

## 1. Objectif

Implémenter le **moteur de blocage multi-couches** de Vethos. À la fin du sous-projet,
l'utilisateur doit pouvoir :

1. Définir des **profiles** de blocage (listes de sites web + apps + apps réseau).
2. Démarrer une **session de blocage** d'une durée fixée → les 3 couches sont
   appliquées atomiquement.
3. Voir le **statut en temps réel** des 3 couches (vert/rouge) avec re-application
   automatique en cas de dérive (édition manuelle du hosts file, kill de la règle
   firewall, etc.).
4. Tenter d'arrêter une session en cours → être confronté au **verrou adaptatif** :
   cooldown obligatoire + justification écrite minimale.
5. Au crash ou redémarrage de Windows pendant une session : Vethos retrouve l'état
   actif et restaure les couches sans perte.

C'est le cœur du produit. Tout le reste (cercle 24h, niveaux, onboarding) gravite
autour. Donc la **fiabilité prime** : zéro fuite (pas de site débloqué par accident),
zéro corruption (pas de hosts file détruit), comportement prédictible sous panne.

---

## 2. Principes directeurs (issus des PDFs)

| Principe | Source | Application concrète |
|---|---|---|
| Élimination de la volonté | Blueprint §02 | L'utilisateur configure à froid, l'app décide à chaud |
| Friction maximale pour quitter | Blueprint §03-02 | Cooldown + 100 mots de justification pour arrêter avant l'heure |
| Approche multi-couches | Guide §Partie 4 | 3 couches superposées, pas une seule technique |
| Drift detection | Cold Turkey, DigitalZen | Watchdog qui ré-applique en cas de manipulation manuelle |
| Ne jamais blâmer | Blueprint §05 | Vocabulaire de l'UI : « Recentrons-nous », pas « Tu as échoué » |
| Sécurité avant fonctionnalité | bon sens | Sauvegarde du hosts file original, sentinels exacts, journal de transactions |

---

## 3. Architecture technique

### 3.1 Vue d'ensemble

```
┌──────────────────────────────────────────────────────────────┐
│                         RENDERER                              │
│  BlockingPage  ←  Zustand store  ←  IPC  ─────────────┐      │
└───────────────────────────────────────────────────────│──────┘
                                                       │
┌──────────────────────────────────────────────────────▼──────┐
│                          MAIN                                │
│                                                              │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                 SESSION MANAGER                       │   │
│   │   (state machine: idle → starting → active → ending) │   │
│   │   • orchestre les 3 couches                          │   │
│   │   • gère les verrous adaptatifs                      │   │
│   │   • persiste l'état actif                            │   │
│   └────────┬─────────────┬────────────┬─────────────────┘   │
│            │             │            │                      │
│   ┌────────▼──┐  ┌──────▼─────┐  ┌──▼──────────┐            │
│   │  HOSTS    │  │  PROCESS   │  │  FIREWALL   │            │
│   │  LAYER    │  │  LAYER     │  │  LAYER      │            │
│   │  (file)   │  │  (psutil-  │  │  (netsh)    │            │
│   │           │  │   like)    │  │             │            │
│   └───────────┘  └────────────┘  └─────────────┘            │
│                                                              │
│   ┌─────────────────────────────────────────────────────┐   │
│   │              DRIFT DETECTOR (watchdog)              │   │
│   │   tick toutes les 5s : vérifie cohérence des 3      │   │
│   │   couches vs état attendu, ré-applique si besoin    │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                              │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                  ELEVATION GUARD                     │   │
│   │   au démarrage, vérifie qu'on est admin             │   │
│   │   sinon prompt UAC pour relancer en admin           │   │
│   └─────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
                          │
                          ▼
              ┌────────────────────────┐
              │  PERSISTANCE (JSON)    │
              │  vethos_blocking.json   │  ← profiles, history
              │  vethos_blocking_active │  ← session en cours
              │     .json              │
              │  hosts.vethos.backup    │  ← copie originale du hosts
              └────────────────────────┘
```

### 3.2 Structure de fichiers

```
src/main/blocking/
├── elevation.ts                  # détection admin + UAC prompt
├── hosts/
│   ├── parser.ts                 # parse hosts file + extract Vethos block
│   ├── writer.ts                 # write atomique avec sentinels
│   ├── flush-dns.ts              # ipconfig /flushdns
│   └── hosts.test.ts             # TDD
├── processes/
│   ├── enumerator.ts             # tasklist parser → list de Process
│   ├── killer.ts                 # taskkill /F /IM <name>
│   ├── watcher.ts                # polling 1s, kill si match
│   └── processes.test.ts         # TDD du parser tasklist
├── firewall/
│   ├── netsh.ts                  # add/remove rule via netsh advfirewall
│   ├── rule-tracker.ts           # tracker des règles créées
│   └── firewall.test.ts          # TDD du parser netsh
├── session/
│   ├── types.ts                  # BlockingProfile, ActiveSession, ...
│   ├── manager.ts                # state machine orchestrateur
│   ├── persistence.ts            # vethos_blocking{,_active}.json IO
│   ├── drift-detector.ts         # watchdog cohérence
│   ├── manager.test.ts           # TDD state machine
│   └── locks/
│       ├── cooldown.ts           # cooldown lock
│       ├── justification.ts      # validateur word count
│       └── locks.test.ts         # TDD
└── ipc/
    └── blocking.handlers.ts      # registerBlockingHandlers
```

### 3.3 Schémas Zod (source de vérité, dans `src/shared/schemas.ts`)

```ts
// Profile = ce que l'utilisateur configure à froid
export const BlockingProfileSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(60),
  blockedSites: z.array(z.string().regex(DOMAIN_REGEX)),       // ['facebook.com', ...]
  blockedProcesses: z.array(z.string().regex(EXE_NAME_REGEX)), // ['chrome.exe', ...]
  blockedNetworkApps: z.array(z.string()),                     // chemins .exe pour firewall
  // verrou adaptatif appliqué à toute session basée sur ce profile
  unlockPolicy: z.discriminatedUnion('type', [
    z.object({ type: z.literal('none') }),
    z.object({ type: z.literal('cooldown'), minutes: z.number().int().min(1).max(60) }),
    z.object({ type: z.literal('justification'), minWords: z.number().int().min(50).max(500) }),
    z.object({ type: z.literal('cooldown_and_justification'),
               minutes: z.number().int().min(1).max(60),
               minWords: z.number().int().min(50).max(500) }),
  ]),
  createdAt: z.string().datetime(),
})
export type BlockingProfile = z.infer<typeof BlockingProfileSchema>

// Active session = ce qui tourne MAINTENANT
export const ActiveSessionSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  profileSnapshot: BlockingProfileSchema, // copie au moment du start, immuable
  startedAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  unlockState: z.discriminatedUnion('phase', [
    z.object({ phase: z.literal('locked') }),
    z.object({ phase: z.literal('cooldown'), startedAt: z.string().datetime() }),
    z.object({ phase: z.literal('awaiting_justification') }),
    z.object({ phase: z.literal('unlocked'), reason: z.string() }),
  ]),
})
export type ActiveSession = z.infer<typeof ActiveSessionSchema>

// État global persisté
export const BlockingStateSchema = z.object({
  profiles: z.array(BlockingProfileSchema),
  history: z.array(z.object({
    sessionId: z.string().uuid(),
    profileId: z.string().uuid(),
    startedAt: z.string().datetime(),
    endedAt: z.string().datetime(),
    completedNormally: z.boolean(),
  })).max(500),
})
```

### 3.4 IPC channels (`src/shared/ipc-channels.ts` — extension)

```ts
export const IPC_CHANNELS = {
  // ... existants
  BLOCKING_LIST_PROFILES: 'blocking:listProfiles',
  BLOCKING_SAVE_PROFILE: 'blocking:saveProfile',
  BLOCKING_DELETE_PROFILE: 'blocking:deleteProfile',
  BLOCKING_START_SESSION: 'blocking:startSession',
  BLOCKING_REQUEST_UNLOCK: 'blocking:requestUnlock',
  BLOCKING_SUBMIT_JUSTIFICATION: 'blocking:submitJustification',
  BLOCKING_GET_ACTIVE_SESSION: 'blocking:getActiveSession',
  BLOCKING_GET_LAYER_STATUS: 'blocking:getLayerStatus',
  BLOCKING_LIST_HISTORY: 'blocking:listHistory',
  // events main → renderer (via webContents.send)
  BLOCKING_EVENT_SESSION_CHANGED: 'blocking:event:sessionChanged',
  BLOCKING_EVENT_LAYER_DRIFT: 'blocking:event:layerDrift',
} as const
```

---

## 4. Détails par couche

### 4.1 Hosts file layer

**Sécurité maximum** :
- Au PREMIER démarrage avant toute modification : copier le hosts existant vers
  `app.getPath('userData')/hosts.vethos.backup` (atomique). Ne JAMAIS écraser ce
  backup ensuite.
- Toutes les écritures du hosts par Vethos utilisent ce format avec sentinels :
  ```
  # === VETHOS BLOCKING START — DO NOT EDIT (managed by Vethos) ===
  # session: <session-id> | started: <ISO timestamp>
  127.0.0.1 facebook.com
  127.0.0.1 www.facebook.com
  127.0.0.1 m.facebook.com
  ::1 facebook.com
  ::1 www.facebook.com
  ::1 m.facebook.com
  # === VETHOS BLOCKING END ===
  ```
- Le parser ignore TOUT ce qui n'est pas entre les sentinels. Le writer ne touche
  qu'à ce bloc.
- Pour chaque domaine, on génère automatiquement les sous-domaines connus :
  `domain.com` → `domain.com`, `www.domain.com`, `m.domain.com`, `mobile.domain.com`.
  Liste maintenue dans `src/main/blocking/hosts/subdomains.ts` (data, pas logique).
- On bloque IPv4 (`127.0.0.1`) ET IPv6 (`::1`).
- Après chaque écriture : `ipconfig /flushdns` (sinon le cache Windows continue à
  résoudre les domaines).

**Path** : `C:\Windows\System32\drivers\etc\hosts` (constante, pas configurable).

### 4.2 Process kill layer

**Approche** : pas de dépendance native (on évite `node-ffi` etc. — coût build trop
élevé pour le MVP). On utilise `child_process.exec` avec les commandes Windows :

- Énumération : `tasklist /FO CSV /NH` → parse CSV → `Process[]`
- Kill : `taskkill /F /IM <name.exe>` (force, par nom d'image)

**Watcher** : `setInterval(check, 1000)`. Pour chaque process listé qui matche un
nom interdit (case-insensitive), kill. On loggue les kills dans une trace volatile
(in-memory, pas persistée).

**Cas limite** : certains processus système ont le même nom qu'un process commun.
On maintient une `SAFE_LIST` hardcodée (svchost, explorer, dwm, etc.) qu'on refuse
de kill même si l'utilisateur l'inscrit dans un profile. Validation au save du profile.

### 4.3 Firewall layer

**Approche** : `netsh advfirewall firewall add rule` via `child_process.exec`.

Format de la règle :
```
netsh advfirewall firewall add rule
  name="Vethos_Block_<sessionId>_<exeBasename>"
  dir=out
  action=block
  program="C:\full\path\to\app.exe"
  enable=yes
```

Le `name` contient le `sessionId` → on peut TOUTES les retrouver et supprimer
proprement à la fin via :
```
netsh advfirewall firewall delete rule name=all program="<exe>"
```
(Ou itérer sur la liste qu'on a track). On garde un `rule-tracker.ts` qui mémorise
les règles créées dans la session active (in-memory + miroir dans
`vethos_blocking_active.json` pour survie au crash).

### 4.4 Session manager (state machine)

États possibles :
```
            ┌──────────────────────────────────────┐
            │                                      │
            ▼                                      │
        ┌──────┐  startSession()    ┌────────────┐ │
        │ idle │ ─────────────────▶ │  starting  │ │
        └──────┘                    └─────┬──────┘ │
            ▲                             │        │
            │                  layers ok  ▼        │
            │                       ┌──────────┐   │
            │                       │  active  │   │
            │                       └────┬─────┘   │
            │                            │         │
            │       endsAt reached       │         │
            │       OR unlock approved   ▼         │
            │                       ┌──────────┐   │
            └───────────────────────│  ending  │───┘  layers cleared
                                    └──────────┘
```

Transitions atomiques :
- `idle → starting` : crée session ID, snapshot du profile, persiste `vethos_blocking_active.json` AVANT d'appliquer les couches
- `starting → active` : applique hosts → processes → firewall, dans cet ordre.
  Si N'IMPORTE QUEL appel échoue : rollback les couches déjà appliquées, retour à
  `idle`, error remontée. (pas de session "à moitié" en prod)
- `active → ending` : déclenché par timer endsAt OU par `requestUnlock` une fois le
  verrou validé
- `ending → idle` : rollback hosts → firewall → processes (ordre inverse), append
  history, clear `vethos_blocking_active.json`, emit événement renderer

### 4.5 Drift detector

`setInterval(checkDrift, 5000)`. Pour chaque couche :
- **hosts** : ré-ouvre le fichier, parse le bloc Vethos. Si le bloc manque OU son
  contenu diffère de l'attendu → réécrit + flush DNS. Si tout le hosts file est
  corrompu (pas de sentinels mais on attendait notre bloc) → log `LAYER_DRIFT`,
  réécrit en restaurant proprement.
- **processes** : c'est implicite, le watcher tourne déjà toutes les secondes
- **firewall** : `netsh advfirewall firewall show rule name=Vethos_Block_*`. Si
  des règles attendues manquent → recrée.

Dérive détectée → emit `BLOCKING_EVENT_LAYER_DRIFT` au renderer pour afficher un
toast « 🛡 Couche restaurée ». Pas de blame — pédagogie.

### 4.6 Verrous adaptatifs

**Cooldown lock** : à la demande d'arrêt, on note `cooldownStartedAt`. Tant que
`now < cooldownStartedAt + minutes`, l'unlock est refusé. Le renderer affiche un
compte à rebours. À l'expiration, il faut relancer `submitJustification` (si la
politique le requiert) ou `requestUnlock` finalize.

**Justification lock** : minimum N mots (split sur whitespace, pas regex compliquée).
Refus si en dessous. Stocké dans l'history pour l'analytics future.

**Combiné** : `cooldown_and_justification` = cooldown PUIS justification. Le
cooldown peut servir à laisser passer la pulsion tandis que les mots à écrire
forcent la réflexion consciente.

### 4.7 Élévation admin

- Toutes les opérations (hosts file, netsh, taskkill système) requièrent admin.
- Stratégie : **manifest UAC** dans `electron-builder.yml` :
  ```yaml
  win:
    requestedExecutionLevel: requireAdministrator
  ```
  → l'utilisateur voit une prompt UAC au lancement de Vethos. C'est honnête et clair.
- En dev (`npm run dev`) : `electron-vite dev` ne propage pas le manifest. On
  détecte côté main : si pas admin → afficher une bannière d'erreur dans la page
  Blocage et désactiver le bouton « Démarrer ». Pas de relance automatique en dev
  (trop pénible pour le hot reload).
- Détection : `child_process.execSync('net session', { stdio: 'pipe' })` → throw si
  pas admin. C'est un check standard sur Windows.

---

## 5. UI (BlockingPage.tsx)

Remplace le placeholder. 3 sections verticales :

```
┌────────────────────────────────────────────────────────────┐
│ Blocage                                                    │
│ Crée des sanctuaires d'attention. Décide à froid pour…     │
│                                                            │
│ ┌─ Session active ────────────────────────────────────────┐│
│ │  🛡  Profile: « Étude maths »                           ││
│ │      Termine dans 1h 23min · 12 sites · 4 apps · 2 net  ││
│ │      [Statut couches: 🟢 hosts  🟢 processes  🟢 fw]    ││
│ │      [Demander à arrêter]   ← cooldown + justification  ││
│ └─────────────────────────────────────────────────────────┘│
│                                                            │
│ ┌─ Profiles ──────────────────────────────────────────────┐│
│ │  Étude maths       12 sites · 4 apps   [Démarrer ▶]     ││
│ │  Boulot deep       18 sites · 6 apps   [Démarrer ▶]     ││
│ │  Soir détente       3 sites · 2 apps   [Démarrer ▶]     ││
│ │  [+ Nouveau profile]                                    ││
│ └─────────────────────────────────────────────────────────┘│
│                                                            │
│ ┌─ Historique (30 derniers) ──────────────────────────────┐│
│ │  Sessions complétées: 23 / 25 · streak: 7 jours         ││
│ │  …                                                      ││
│ └─────────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────┘
```

L'éditeur de profile est un panneau slide-in (Framer Motion) : nom + 3 listes
éditables (sites/apps/apps réseau) + politique de verrou (radio buttons).

Pendant un cooldown : modal pleine largeur avec compte à rebours géant et un
champ texte verrouillé jusqu'à `cooldownStartedAt + minutes`. Une fois actif :
le champ se débloque, le bouton « Confirmer l'arrêt » apparaît dès que le seuil
de mots est atteint (compteur live).

Qualité visuelle 11/10 : transitions fluides, gradient des cartes profile en
fonction de leur dernier usage, micro-anim sur les bullets de statut quand une
dérive est restaurée (pulse vert).

---

## 6. Tests automatisés (Vitest)

TDD obligatoire pour :
- `hosts/parser` : parse `hosts` avec et sans bloc Vethos, multi-blocs (corruption),
  caractères exotiques BOM/CRLF
- `hosts/writer` : génération du bloc avec sentinels, idempotence
- `processes/enumerator` : parse output `tasklist /FO CSV` (test sur fixture)
- `session/manager` : state machine (transitions valides + invalides), atomicité
  start (mock des couches qui throw), rollback ending
- `session/locks/cooldown` : timer (vitest fake timers)
- `session/locks/justification` : compteur mots (whitespace edge cases, unicode)

Tests d'intégration (skippés sauf si `process.env.VETHOS_INTEG=1` pour pouvoir
les lancer manuellement avec admin) :
- hosts read/write réel
- netsh add/delete rule réel
- tasklist réel

CI normale : seuls les tests unitaires tournent (pas d'admin requis).

---

## 7. Démo bout-en-bout du sous-projet 2

À la fin :

1. `npm run dev` (en admin sur Windows) → l'app s'ouvre
2. Page Blocage → créer un profile « Test » : `[example.com]`, `[notepad.exe]`, `[]`,
   politique : `cooldown_and_justification` (5 min, 100 mots)
3. Démarrer une session de 10 min
4. Vérifier dans un terminal :
   - `type C:\Windows\System32\drivers\etc\hosts` → bloc Vethos présent
   - `ping example.com` → résolution `127.0.0.1`
   - lancer notepad → tué dans la seconde
5. Éditer manuellement le hosts file (retirer une ligne) → 5 secondes plus tard,
   Vethos la remet (toast « Couche restaurée »)
6. Cliquer « Demander à arrêter » → cooldown 5 min commence
7. Pendant cooldown : champ verrouillé. À l'expiration : champ s'active.
8. Tenter de soumettre 50 mots → refus
9. Soumettre 100+ mots → session arrêtée, hosts file restauré (bloc Vethos disparu),
   notepad re-lançable

---

## 8. Critères d'acceptation

1. ✅ Les 3 couches (hosts/process/firewall) sont implémentées et testées
2. ✅ State machine de session correcte (idle/starting/active/ending), atomique au start
3. ✅ Drift detector ré-applique en moins de 10s
4. ✅ Verrou cooldown + justification fonctionnel
5. ✅ Backup du hosts file original créé au premier démarrage et jamais écrasé
6. ✅ `vethos_blocking{,_active}.json` persistés via le storage atomique du sous-projet 1
7. ✅ Survit à un crash : au redémarrage en milieu de session, les couches sont
   restaurées et le timer reprend
8. ✅ Lint + typecheck + Vitest (unitaires) tous verts
9. ✅ Démo bout-en-bout fonctionnelle (cf. §7)
10. ✅ Manifest `requireAdministrator` dans le build de prod
11. ✅ Page Blocage UI 11/10 (cohérente avec sous-projet 1)
12. ✅ `VETHOS_SPEC.md` mis à jour : sous-projet 2 ✅

---

## 9. Hors scope (renvoyé en sous-projet 6 / Polish)

- DNS filtering (niveau 3) et WFP (niveau 5)
- Frozen Mode (lock de la session Windows)
- Anti-bypass agressif (bloquer regedit, task manager, désinstall, changement d'heure)
- Détection automatique des nouveaux navigateurs installés
- Friend lock via ntfy externe
- Time penalty cumulative
- Blocage par mot-clé dans titres d'onglets (besoin extension navigateur)
- Anticipation des distractions à partir de la fenêtre active (besoin de la couche
  d'observation des sous-projets 3-4)

Ces fonctionnalités sont précieuses mais ajouter trop de surface au sous-projet 2
casserait l'incrémentalité. Elles deviennent des enrichissements clairs une fois
le moteur de blocage stable.
