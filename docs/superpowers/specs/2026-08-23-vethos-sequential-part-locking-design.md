# Vethos — Ordre séquentiel des parties et complétion décidée par l'application

**Auteur :** Obed (avec Claude)
**Date :** 2026-08-23
**Statut :** Implémenté
**Périmètre :** Extension de B.5 (découpage automatique). Trois changements liés : les parties d'une tâche découpée se font strictement dans l'ordre, les suivantes s'affichent en aperçu, et c'est l'application — plus l'utilisateur — qui décide qu'une tâche est terminée.

---

## 0. Le défaut de départ, mesuré

Capture réelle du 2026-08-23 : les parties d'une même tâche apparaissaient sur le calendrier dans l'ordre **1, 4, 2, 5, 3**, plusieurs le même jour, entrecoupées.

Cause exacte, trouvée dans le code : `sortTasksByCascade` (`placement.ts`) départage par deadline → importance → travail restant → date de création. Les parties d'un découpage ont **les quatre valeurs identiques** — `createdAt` compris, calculé une seule fois pour tout le lot dans `addTask`. Le comparateur renvoyait donc `0` pour toutes les paires, et l'ordre final était celui, arbitraire, du tri de la plateforme. Ce n'était pas « mal trié », c'était **pas trié du tout**.

`autoSplit` calculait déjà un rang (`SplitPart.order`) — il était jeté à la création, seuls `label` et `minutes` étaient repris.

## 1. Objectif

1. Une seule partie est travaillable à la fois, dans l'ordre du découpage.
2. Les parties suivantes s'affichent quand même, en aperçu, pour montrer où elles tomberont.
3. Une tâche se termine quand son temps planifié a été **réellement fait** — l'utilisateur ne le déclare plus.

## 2. Décisions structurantes

### 2.1 `partOrder` persisté, verrouillage dérivé

`Task.partOrder: number | null` (`schemas.ts`), rempli depuis le `order` qu'`autoSplit` produisait déjà.

Le verrouillage est un **fait dérivé** (`isPartLocked`, `estimation.ts`), recalculé à chaque plan — jamais un drapeau stocké. Un drapeau se désynchroniserait au premier cas non prévu : supprimer la Partie 1 au lieu de la terminer laisserait la Partie 2 verrouillée pour toujours. Le prédicat la libère tout seul.

Écarté : un statut `'locked'` séparé. Il aurait obligé à faire circuler deux listes de tâches dans le moteur — une pour la faisabilité (qui doit inclure le travail verrouillé), une pour le placement (qui doit l'exclure). C'est exactement la double-comptabilité qui a produit le défaut D.2 corrigé plus tôt le même jour.

### 2.2 Deux prédicats, pas un — et c'est volontaire

| Fonction | Regarde | Décide |
|---|---|---|
| `isPartLocked` (`estimation.ts`) | le **statut stocké** des sœurs | l'aperçu : cette partie est-elle actionnable ? |
| `waitsForEarlierSibling` (`engine.ts`) | le **besoin restant de la passe en cours** | le séquencement : cette partie peut-elle recevoir un créneau maintenant ? |

Le second est ce qui force la Partie 1 à se remplir sur **tout l'horizon** avant que la Partie 2 n'obtienne son premier créneau. Sans lui, la boucle par jour servait un peu de chaque partie chaque jour.

### 2.3 L'aperçu occupe vraiment la place

`PlacedBlock.preview` marque une partie verrouillée. Le bloc est placé normalement et consomme la capacité — sinon la position affichée serait un mensonge : autre chose viendrait s'y poser. Il ne déclenche ni l'overlay « Je commence », ni le blocage d'applications, ni le crédit de travail (`plan-runner` les filtre en un seul endroit, à la lecture du plan).

### 2.4 Complétion automatique : le jumeau du crédit de retard

Nouveau compteur `workedMinutesByRef` (`learning`). Un bloc **confirmé** dont la fenêtre s'écoule crédite son temps de travail — jumeau exact d'`applyLapsedCredit`, qui faisait déjà ça pour les blocs *non* confirmés, avec la même protection anti-double-comptage par recouvrement d'intervalles (`workCreditedRanges`).

`closedObservedBlock` renvoyait `null` sur un bloc confirmé : le temps réellement travaillé disparaissait sans jamais être compté. Cette ligne est tombée ; l'appelant tranche désormais entre crédit de retard et crédit de travail.

Effet de bord : `DurationRealSource` (`types.ts`), déclaré depuis l'origine du moteur (B.2) mais **jamais branché** — il renvoyait `null` partout dans le code réel — est enfin alimenté. La boucle d'apprentissage G tournait à vide.

Le crédit part de la **confirmation**, pas de l'heure prévue (confirmer 30 min en retard, c'est 30 min de travail en moins) et s'arrête à la fin de la part de travail, pause exclue (E.1).

### 2.5 Une seule définition de la cible

`plannedTotalFor(task) = remainingMinutes + extraMinutes`. `remainingMinutes` porte le total planifié figé **à la création** — c'est là que le facteur de correction s'applique, et nulle part ailleurs.

Le placement (`remainingWorkFor`) et la complétion (`tasksToAutoComplete`) utilisent la **même** fonction. Une première version mesurait la complétion contre une durée recalculée avec le facteur du jour : la ligne d'arrivée bougeait sous les pieds de l'utilisateur, et le moteur visait une cible que la complétion n'atteignait jamais. Le test bout-en-bout l'a attrapé.

### 2.6 « Il m'en faut plus » : `extraMinutes`, jamais `estimatedMinutes`

Le temps accordé s'ajoute à un champ séparé. Gonfler l'estimation d'origine effacerait la seule trace exploitable par le facteur de correction, qui compare réel ÷ estimé.

`remainingMinutes` n'est **pas** remis à zéro à la complétion : l'écraser ferait retomber la cible aux seules minutes ajoutées, déjà dépassées par le travail fait, et la tâche se reterminerait dans la seconde.

### 2.7 L'absorption des miettes (défaut trouvé dans le navigateur)

Une partie de 280 minutes recevait 3 blocs de 90 (= 270) et gardait **10 minutes increvables** : sous le bloc minimum de 25 (A.2), elles ne sont plus jamais plaçables. Son besoin ne retombant jamais à zéro, le verrouillage séquentiel condamnait les parties suivantes **pour toujours**.

`absorbCrumb` : si poser ce bloc laisserait un reste positif mais sous le bloc minimum, le bloc l'avale. C'est le garde-fou que B.5 impose déjà au découpage (« aucune sous-partie sous le seuil du fragment minimum »), appliqué au découpage en blocs. Dépassement borné à 24 minutes, et toujours soumis au budget du jour.

Soupape de sécurité complémentaire dans `waitsForEarlierSibling` : un reste sous le bloc minimum ne bloque jamais la partie suivante. Un blocage définitif serait bien pire que le chevauchement de moins de 25 minutes ainsi autorisé, qui ne survient que dans une journée déjà saturée.

## 3. Limite connue, assumée

Le facteur de correction ne peut plus **jamais** descendre. Sans fin anticipée possible, le temps réel vaut toujours au moins le temps planifié : le ratio reste stable quand tout se passe comme prévu, et monte quand « il m'en faut plus » est utilisé. Il ne redescendra pas même si les estimations de l'utilisateur s'améliorent. Choix explicite du 2026-08-23, documenté plutôt que corrigé.

Contredit **B.2.1** du document du moteur, qui posait que l'utilisateur déclare « cette tâche est terminée ». Amendement assumé, acté en B.5.2.

## 4. Fichiers

```
src/shared/schemas.ts                       partOrder, extraMinutes, workedMinutesByRef,
                                            workCreditedRanges, observedPending.workMinutes
src/shared/planning/estimation.ts           isPartLocked ; extraMinutes dans estimateTask
src/shared/planning/placement.ts            rang en tête de la cascade
src/shared/planning/engine.ts               séquencement, aperçu, absorbCrumb,
                                            remainingWorkFor / plannedTotalFor
src/shared/planning/types.ts                PlacedBlock.preview
src/main/planning/plan-clock.ts             applyWorkCredit, tasksToAutoComplete,
                                            closedObservedBlock rendu neutre
src/main/planning/plan-runner.ts            crédit de travail, complétion auto, durationSource
src/renderer/src/store/planning.store.ts    partOrder câblé, addMoreTime, completeTask retiré
src/renderer/src/pages/HomePage.tsx         plus de clic « terminer », bouton +25 min
src/renderer/src/pages/CommitmentsPage.tsx  idem (pastille de complétion retirée)
src/renderer/src/components/week/WeekCalendar.tsx  aperçu éteint + contour tireté
```

## 5. Vérification

- `npx vitest run` → **658 tests, 39 fichiers, tous verts** (620 avant travaux).
- `npm run typecheck` (node + web) → **0 erreur**, avant comme après.
- Vérification navigateur réelle : une tâche de 600 min découpée en 3 parties de 280 produit 9 blocs, strictement ordonnés 1→1→1→2→2→2→3→3→3, dont un bloc final de 100 min (miette absorbée). Seule la Partie 1 est actionnable ; les Parties 2 et 3 portent `opacity-40` et un contour tireté.
