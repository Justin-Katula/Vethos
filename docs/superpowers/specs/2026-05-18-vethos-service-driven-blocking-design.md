# Vethos — Blocage piloté par le service (« Calendrier vivant », couche 3)

## Contexte
Couches 1-2 livrent un calendrier vivant et un registre de classifications
(sites/apps utiles vs distractions, par objectif/tâche). Cette couche 3 fait
que le blocage **s'active automatiquement** quand un bloc planifié arrive,
**survit à la fermeture de l'UI** et **survit au redémarrage du PC**.

## Statut de la conception
Brainstormé en session avec l'utilisateur. Toutes les décisions ci-dessous
ont été validées. Préreq : Couche 2 mergée + bug 1 P16 corrigé (sans service
qui s'installe, cette couche est techniquement intacte mais invalidable en
bout de chaîne).

## Décisions de design

### D1 — Le service pilote
Le service Windows (P16) est **autonome** : c'est lui qui décide quand
démarrer une session, pas le renderer. Conséquence directe :
- Le blocage continue si l'UI est fermée.
- Le blocage reprend après redémarrage du PC (cf. D3).

### D2 — Le renderer pousse le plan
- À chaque recomputation de `usePlacement`, le renderer construit un plan
  des **24 prochaines heures** : la liste des blocs avec leurs distractions
  et leur unlockPolicy **déjà résolus** (le service n'a pas accès aux
  objectifs, tâches, registre).
- Le push est **debouncé à 1×/min** pour ne pas spammer le pipe.
- Le push est **idempotent** : un même plan re-envoyé n'a aucun effet
  (le service compare un hash et ignore si identique).

### D3 — Persistance disque
- Le service écrit le plan sur `C:\ProgramData\Vethos\vethos_plan.json` à
  chaque push.
- Au boot du service, il relit le fichier avant le premier tick. Aucune
  intervention de l'UI n'est nécessaire pour que le blocage reprenne après
  un reboot.
- Format : `{ pushedAt: ISO, blocks: PushedBlock[] }`.

### D4 — Scheduler par tick
- Tick toutes les **15 secondes** dans le service.
- Logique du tick :
  1. Si une session est déjà active → skip.
  2. Calculer `(date, minuteOfDay)` actuel.
  3. Trouver un bloc actif : `b.date === date && b.startMinute <= minute < b.endMinute`.
  4. Si aucun bloc actif → skip.
  5. Si le bloc est dans `triggeredBlockIds` (déjà démarré dans cette
     exécution) → skip.
  6. Sinon → démarrer une session avec le payload **figé** du bloc, durée
     = `endMinute - minuteOfDay`. Ajouter l'id au Set.

### D5 — Démarrage de la session
- Construction d'un `BlockingProfile` éphémère à partir de `PushedBlock` :
  ```ts
  {
    id: `auto-${block.id}`,
    name: `Auto: ${block.label}`,
    blockedSites: block.blockedSites,
    blockedProcesses: block.blockedProcesses,
    blockedNetworkApps: block.blockedNetworkApps,
    unlockPolicy: block.unlockPolicy,
    createdAt: <now>,
  }
  ```
- Appelle le mécanisme `START_SESSION` existant (P16).
- Émet une **notification native** : « \[label\] commence — focus ! ».

### D6 — Fin de la session
- La session se termine d'elle-même au bout de sa durée (mécanisme P16
  existant — `SESSION_ENDED`).
- Émet une **notification native** : « \[label\] terminé (1h30) ».

### D7 — Comportement en cas de veille / hibernation
- Au réveil du PC :
  - Si le `now` est encore dans le bloc → démarrer la session avec **durée
    tronquée** (`endMinute - currentMinute`).
  - Si le `now` est passé `endMinute` → bloc skipé (loggué seulement, pas
    de notification).

### D8 — Payload figé pendant la session
- Le service utilise le payload tel qu'il a été poussé au démarrage du bloc.
- Une classification ajoutée pendant la session (via la couche 2) **n'affecte
  pas la session en cours**. Le prochain push contiendra le changement pour
  les blocs futurs.
- Cohérent avec l'anti-sabotage de Couche 2 D11 : pas de modification
  rétroactive d'un blocage actif.

### D9 — Crash recovery
- Si le service crash pendant un bloc puis redémarre, le `triggeredBlockIds`
  est réinitialisé. Au tick suivant, le bloc est toujours « actif » selon
  l'horloge → le service redémarre la session avec la **durée restante**.
- Conséquence : une notification de démarrage peut se déclencher 2 fois en
  cas de crash. Rare et acceptable.

### D10 — Transitions entre blocs
- Si bloc A finit à 15:00 et bloc B commence à 15:00 : la session A se
  termine via son mécanisme de durée, puis au tick suivant (≤ 15 s plus
  tard), le service détecte B et le démarre.
- Conséquence : courte fenêtre ≤ 15 s sans blocage entre deux blocs collés.
  Acceptable v1. Une implémentation « pile à l'heure » est possible plus
  tard (timer dédié au lieu d'un tick périodique).

### D11 — Plus de manuel
- L'utilisateur ne démarre plus de session manuellement (la BlockingPage
  Couche 2 est passive). Tout passe par le calendrier auto.
- Conséquence : pas de gestion de conflit « session manuelle vs auto ».
- Pas de bouton « Démarrer maintenant » côté UI.

## Périmètre

**Dans :**
- Commande IPC `PUSH_PLAN` (`service-protocol.ts`).
- Persistance disque (lecture au boot + écriture à chaque push).
- Scheduler service (tick + détection bloc actif + démarrage session).
- Hook renderer `usePlanPush` (debouncing + push à chaque changement).
- Notifications natives au démarrage et à la fin.
- Préload + relais main pour `PUSH_PLAN`.

**Hors :**
- Durcissement (P16 Phase 4 — ACL sur le pipe, ACL sur le fichier de plan).
- Bugs P16, scan d'apps, historique navigateur — chantiers parallèles.
- IA pour pré-classification (Couche 2 D11).

## Architecture & fichiers

**Schéma & protocole :**
- `src/shared/service-protocol.ts` : ajouter `PushedBlock` + commande
  `PUSH_PLAN`.
- `src/shared/ipc-channels.ts` : ajouter `BLOCKING_PUSH_PLAN`.

**Service :**
- `src/service/blocking-scheduler.ts` (new) : logique pure du scheduler
  (`findActiveBlock(blocks, date, minute)`).
- `src/service/blocking-scheduler.test.ts` (new) : tests Vitest.
- `src/service/blocking-host.ts` : handler `PUSH_PLAN` + persistance disque
  + tick scheduler + intégration avec `START_SESSION`.

**Main :**
- `src/main/blocking/ipc/blocking.handlers.ts` : relais `PUSH_PLAN`.

**Renderer :**
- `src/preload/index.ts` : exposer `vethos.blocking.pushPlan`.
- `src/renderer/src/lib/ipc.ts` : typer la méthode.
- `src/renderer/src/lib/use-plan-push.ts` (new) : hook qui résout les
  distractions via Couche 2 + pousse le plan, debouncé.
- Composant racine UI (Layout.tsx ou App.tsx) : monte le hook.

## Format `PushedBlock`

```ts
type PushedBlock = {
  id: string                   // re-utilise l'id du placement engine
  date: string                  // YYYY-MM-DD
  startMinute: number           // 0..1439
  endMinute: number             // 1..1440
  refKind: 'task' | 'objective'
  refId: string                 // id de l'item source
  label: string                 // nom à afficher en notif ("Maths")
  blockedSites: string[]
  blockedProcesses: string[]
  blockedNetworkApps: string[]
  unlockPolicy: UnlockPolicy
}
```

## Risques

- **Préreq fort : bug 1 P16** (service ne s'installe pas). Tant qu'il n'est
  pas résolu, cette couche est techniquement écrite mais non testable de
  bout en bout. Le smoke test final reste impossible.
- **Push spam** : si l'utilisateur change rapidement plusieurs tâches/
  objectifs/réglages, le debouncing 1×/min limite mais ne supprime pas la
  charge. À surveiller en pratique.
- **Disk write fréquent** : chaque push réécrit `vethos_plan.json` (24 h de
  données, petit). Pas un goulot d'étranglement mais à monitorer.
- **Notification spam au crash recovery** : 2 notifs au lieu d'une en cas
  de crash/redémarrage du service pendant un bloc. Rare ; acceptable v1.
- **Fenêtre de blocage manquée à la transition** : ≤ 15 s sans blocage
  entre deux blocs collés. Acceptable v1, mécanique « timer dédié » possible
  ultérieurement.
- **PC en veille longue** : un bloc planifié pendant la veille est skipé
  (D7). Pas de rattrapage. Acceptable.
