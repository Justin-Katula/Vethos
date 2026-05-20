# Nexus — Blocage piloté par le bloc actif (« Calendrier vivant », couche 3)

## Contexte
Couches 1-2 livrent un calendrier vivant et des jeux de distractions sur
objectifs/tâches. Cette couche fait que le blocage s'active **automatiquement**
quand un bloc planifié arrive — sans clic utilisateur — et survit à la
fermeture de l'UI.

## ⚠️ Spec non brainstormée
Pas brainstormée. Décisions ci-dessous = meilleures hypothèses. À relire avant
implémentation. Préreq : bug 1 P16 corrigé (sans service qui tourne, cette
couche n'est pas validable).

## Décisions

### D1 — Qui pilote le déclenchement ?
**Le service Windows, pas le renderer.** Raison : le blocage doit survivre à
la fermeture de l'UI ; si le renderer pilotait, fermer l'app = plus de
déclenchement automatique. Le service P16 tourne en arrière-plan, il a toutes
les capacités pour démarrer une session.

### D2 — Comment le service connaît le plan ?
Le renderer envoie le plan au service via une nouvelle commande IPC
`PUSH_PLAN`. Le plan = la liste des blocs à venir (24 prochaines heures),
avec leurs distractions **déjà résolues** (le service n'a pas accès aux
tâches/objectifs). Le renderer pousse à chaque fois que `usePlacement`
recalcule, debouncé à 1×/min.

### D3 — Persistance du plan poussé ?
**Aucune.** Le service stocke en mémoire. Si le service redémarre (reboot),
il n'a plus de plan tant que l'UI n'a pas re-poussé. Acceptable v1 : au boot,
le service démarre, puis l'utilisateur ouvre l'UI rapidement et la push se
fait.

### D4 — Format du push

```ts
type PushedBlock = {
  id: string
  date: string         // YYYY-MM-DD
  startMinute: number  // 0..1439
  endMinute: number    // 1..1440
  refKind: 'task' | 'objective'
  refId: string        // pour les logs
  distractions: DistractionSet  // résolu côté renderer
}

// Commande IPC :
//   { type: 'PUSH_PLAN', payload: { blocks: PushedBlock[] } }
```

Les blocs sans distractions (`resolveDistractions === null`) sont **filtrés
avant push** — pas la peine de les envoyer.

### D5 — Scheduler service

Une boucle (tick toutes les 15 secondes) :
1. Compute `(date, minuteOfDay)` actuel.
2. Trouve un bloc actif : `block.date === date && block.startMinute <= minuteOfDay < block.endMinute`.
3. Si un bloc actif est trouvé ET aucune session n'est en cours ET le bloc n'a
   pas déjà été déclenché → démarre une session.
4. La session est démarrée via le mécanisme existant (`startSession`), avec
   un `BlockingProfile` éphémère construit depuis `block.distractions`.
5. La session se termine d'elle-même via le mécanisme de durée existant.

### D6 — Conflit avec une session manuelle
Si l'utilisateur démarre une session manuellement (depuis un éventuel bouton
de la BlockingPage) ET qu'un bloc planifié arrive pendant : on ne fait rien
(la session manuelle prévaut). Le bloc qui débute est sauté. Cohérent avec D5.

### D7 — Que se passe-t-il si le plan change pendant une session ?
La session en cours n'est pas modifiée. Le prochain bloc utilisera le plan
mis à jour.

### D8 — Reconnaître qu'un bloc a déjà été déclenché
Le service garde un `Set<string>` des IDs des blocs déjà démarrés durant
cette exécution. À chaque tick, si le bloc actif est dans le Set → skip. Le
Set est en mémoire ; au redémarrage du service il est réinitialisé. C'est OK :
le service ne re-déclenche pas un bloc passé (son `endMinute < minuteOfDay`).

## Périmètre

**Dans :**
- Commande IPC `PUSH_PLAN`.
- Scheduler service (tick + démarrage auto).
- Hook renderer `usePlanPush`.
- Préload + relais main.

**Hors :**
- Durcissement (P16 Phase 4 — ACL pipe, etc.).
- Bugs (le bug 1 du service est un préreq, pas une partie de ce plan).
- UI de session manuelle (existante ou non — pas touchée ici).

## Architecture & fichiers

- `src/shared/service-protocol.ts` : ajouter `PUSH_PLAN` + type `PushedBlock`.
- `src/service/blocking-scheduler.ts` (new) : logique pure du scheduler.
- `src/service/blocking-scheduler.test.ts` (new).
- `src/service/blocking-host.ts` : handler `PUSH_PLAN`, tick scheduler.
- `src/main/blocking/ipc/blocking.handlers.ts` : relais.
- `src/shared/ipc-channels.ts` : nouveau canal `BLOCKING_PUSH_PLAN`.
- `src/preload/index.ts` : exposer `nexus.blocking.pushPlan(blocks)`.
- `src/renderer/src/lib/ipc.ts` : typer la méthode.
- `src/renderer/src/lib/use-plan-push.ts` (new) : hook.
- Un composant racine du renderer (Layout.tsx ou App.tsx) : monter le hook.

## Risques

- **UI jamais ouverte** : aucun plan poussé → aucun blocage auto. Acceptable v1.
- **Pipe spammé** : limiter à 1×/min via debouncing + hash de comparaison.
- **Horloge tweakée** : géré par l'event `CLOCK_TAMPER` existant. Au pire, un
  bloc peut être démarré ou skipé d'un cran. Non critique.
- **Plan vide** : si aucune tâche/objectif, plan vide, rien ne se passe. OK.
- **Bug 1 P16 non résolu** : le service ne tourne pas → la couche 3 ne peut
  pas être validée. Bloquant pour le smoke test, pas pour l'implémentation.
