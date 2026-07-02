# Vethos — Moteur d'auto-placement (« Calendrier vivant », couche 1)

## Contexte

Aujourd'hui, le blocage de Vethos est une île : il bloque des sites/apps sans
aucun lien avec les tâches et les objectifs, qui sont pourtant le cœur de l'app.
La cible décidée avec l'utilisateur : **tâches et objectifs sont le centre ; le
planning et le blocage ne sont que des conséquences**.

Le chantier complet — « Calendrier vivant » — se découpe en 3 couches empilées :

1. **Moteur d'auto-placement** *(ce document)* — l'app place elle-même les
   tâches/objectifs sous forme de blocs concrets dans le calendrier.
2. **Jeux de distractions** — chaque objectif définit ce qui le distrait ; une
   tâche peut surcharger.
3. **Blocage piloté par le bloc actif** — quand l'heure d'un bloc arrive, le
   service bloque le bon jeu de distractions.

Les couches 2 et 3 dépendent de la couche 1 ; elles feront l'objet de specs
séparées. Les bugs en cours (service Windows qui ne s'installe pas, scan d'apps,
historique navigateur) sont un chantier indépendant, traité en dernier.

## État actuel du code (constat)

`src/renderer/src/lib/free-time-calculator.ts` calcule déjà :
- les **créneaux libres** d'un jour (`computeFreeTimeSlots`) — les trous entre
  les activités fixes du planning ;
- un **budget en minutes** par tâche (`distributeTimeToTasks`) et par objectif
  (`distributeTimeToObjectives`), via la formule
  `part = score / Σ scores × temps_libre_total`.

Mais l'app **n'a jamais placé** ces minutes sur le calendrier : elle dit
« Maths : 90 min aujourd'hui » sans dire *quand*. Le calendrier (`PlanningPage`,
`WeekCalendar`) n'affiche que les catégories récurrentes (École, Travail…).

> ⚠️ `distributeTimeToTasks` et `distributeTimeToObjectives` consomment chacune
> 100 % du temps libre, en parallèle : c'est un double-comptage. Le nouveau
> moteur **remplace les deux** par une distribution unifiée (cf. §4).

## Périmètre

**Dans le périmètre :** le moteur d'auto-placement, son affichage sur le
calendrier (semaine + mois), la fenêtre horaire visible, le niveau de temps
libre.

**Hors périmètre (specs ultérieures) :** les jeux de distractions (couche 2),
le déclenchement du blocage (couche 3), les bugs du service Windows.

## Vocabulaire

- **Item** : une unité qui concourt pour le temps libre — une tâche autonome, un
  objectif, ou le temps libre lui-même.
- **Tâche autonome** : tâche dont `linkedObjectiveId` est `null`.
- **Tâche liée** : tâche dont `linkedObjectiveId` pointe vers un objectif. Une
  tâche peut pointer vers un objectif ; un objectif ne connaît jamais ses tâches.
- **Bloc** : un segment de temps daté et placé sur le calendrier.
- **Multiplicateur d'échéance** `M(date)` : fonction existante
  `getDeadlineMultiplier` — `1.0` (échéance > 7 j ou passée), `1.3` (4–7 j),
  `1.6` (2–3 j), `2.0` (≤ 1 j).

## 1. Modèle de score

Le moteur fait concourir des **items** pour le temps libre de la fenêtre de
planification. Chaque item reçoit un **score** :

| Item | Score |
|---|---|
| **Tâche autonome** (active, niveau > 0) | `niveau × M(échéance)` |
| **Objectif** (niveau > 0) | `( niveau_objectif + Σ scores des tâches liées ) / 1,5` |
| **Temps libre** | `niveau_temps_libre` (4–7), **jamais multiplié** |

Détails de l'objectif :
- Le score de **chaque tâche liée** est calculé d'abord, individuellement :
  `niveau_tâche × M(échéance_tâche)`.
- Ces scores sont **additionnés** au `niveau_objectif` brut (l'objectif n'a pas
  d'échéance et n'est **jamais** multiplié).
- La somme est **divisée par 1,5**.
- Un objectif sans tâche liée active → score = `niveau_objectif / 1,5`.
- Les tâches liées **ne sont pas** des items distincts : elles sont absorbées
  dans le score de leur objectif.

**Exemple (chiffres de l'utilisateur)** : objectif niveau 5, tâche A niveau 7
(échéance demain → ×2), tâche B niveau 7 (échéance lointaine → ×1) :

```
score_objectif = ( 5 + (7 × 2) + (7 × 1) ) / 1,5 = ( 5 + 14 + 7 ) / 1,5 = 17,33
```

## 2. Niveau de temps libre

Le temps libre devient un **item concurrent** : il a son propre niveau, ce qui
garantit qu'une part du temps reste vraiment libre (repos) plutôt qu'avalée à
100 % par le travail.

- Nouveau réglage `freeTimeLevel`, entier, **borné 4–7** (jamais en dehors),
  défaut `5`.
- Modifiable **une fois toutes les 2 semaines** : un horodatage
  `freeTimeLevelChangedAt` verrouille le réglage tant que 14 jours ne se sont
  pas écoulés (même esprit que le cooldown de niveau des tâches).
- Le score du temps libre **n'est jamais multiplié** (pas d'échéance).

## 3. Fenêtre de planification

- Le moteur place les blocs sur une **plage de dates** paramétrable
  (`aujourd'hui → date_fin`). Deux plages sont utilisées :
  - **Plan opérationnel** — fenêtre glissante de **7 jours** (aujourd'hui + 6) ;
    alimente la vue Semaine et l'Accueil.
  - **Aperçu mensuel** — du jour courant à la fin du mois affiché ; alimente la
    vue Mois (§8.3).
- Une tâche dont l'échéance dépasse la plage est tout de même prise en compte
  (multiplicateur `1.0`) ; elle reçoit peu de temps, puis de plus en plus à
  mesure que l'échéance approche.

## 4. Distribution du budget

1. Calculer le **temps libre total** `T` de la plage = somme des créneaux libres
   de tous ses jours (réutilise `computeFreeTimeSlots`, hors créneaux de
   préparation).
2. Calculer le score de chaque item (§1).
3. Chaque item reçoit `budget = score_item / Σ scores × T`, **arrondi à 5 min**.
4. Le **reliquat d'arrondi** est versé à l'item au score le plus élevé (logique
   déjà présente dans `free-time-calculator`).
5. Le budget de l'item « temps libre » n'est pas placé : il correspond aux
   créneaux laissés vides après placement du travail (§5).

## 5. Placement des blocs

Transformer chaque budget-minutes en blocs concrets posés dans les créneaux
libres de la fenêtre :

1. **Découpage.** Le budget d'un item est coupé en blocs de **30 min minimum,
   120 min maximum** (2 h max = digeste et compatible « max 4 h même item »).
2. **Ordre.** Les items au score le plus élevé choisissent leurs créneaux en
   premier.
3. **Étalement.** Les blocs d'un même item sont répartis sur plusieurs jours
   plutôt qu'entassés ; les jours plus proches sont légèrement préférés pour les
   items les plus urgents. Les blocs d'une tâche ne sont **jamais placés après
   son échéance**.
4. **Règles de session** (déjà existantes) respectées : jamais plus de 4 h du
   même item d'affilée, ni plus de 6 h de travail cumulé d'affilée.
5. **Créneaux trop courts** (< 30 min) ou de **préparation** : non utilisés pour
   le travail — ils restent du temps libre.
6. **Le temps libre est ce qui reste** : les créneaux non remplis après
   placement du travail sont le temps vraiment libre. Si le travail ne peut pas
   être entièrement placé (fragmentation), le moteur place ce qu'il peut ; le
   surplus non plaçable est reporté au recalcul du lendemain.

## 6. Blocs passés

- Un bloc passé **n'a aucune incidence sur les calculs** (score, distribution,
  placement) : le moteur ne rejoue jamais le temps non fait.
- Un bloc d'**aujourd'hui** dont l'heure de fin est dépassée est affiché comme
  **« terminé »** (état visuel : grisé / coché).
- Un bloc d'un **jour révolu disparaît entièrement** : le moteur ne planifie
  qu'à partir du jour courant, donc un jour passé n'a plus aucun bloc. Exemple :
  un bloc du lundi 23 n'apparaît plus le mardi 24.
- L'auto-correction se fait par le recalcul (§9) : une tâche non avancée voit
  son échéance se rapprocher → multiplicateur ↑ → plus de temps au prochain
  recalcul. Pas de suivi « fait / pas fait ».

## 7. Verrouillage — aucune pose manuelle

- L'utilisateur **ne pose, ne déplace, ne redimensionne, ne supprime aucun
  bloc**. Le calendrier de travail est **entièrement verrouillé** en lecture
  seule.
- Choix délibéré (anti-sabotage) : l'utilisateur ne doit pas pouvoir « pousser »
  ses blocs pour ne rien faire.
- Le **seul levier** sur le calendrier est indirect : créer / modifier /
  terminer une tâche ou un objectif (niveau, échéance), ou changer le niveau de
  temps libre. Le calendrier se réorganise alors tout seul.
- Les **catégories** du planning (École, Travail, Sommeil…) restent, elles,
  éditables par l'utilisateur — ce sont des entrées de planning, pas des blocs
  de travail.

## 8. Le calendrier

### 8.1 Deux couches

Le calendrier superpose deux couches :

- **Catégories** (`TimeRule` + `ScheduleEntry`) : récurrentes chaque semaine,
  posées par l'utilisateur. Le squelette fixe — *quand l'utilisateur n'est pas
  libre* (sommeil, école, travail, engagements).
- **Blocs de travail** (nouveau) : **datés** (jour calendaire précis), posés
  automatiquement par le moteur dans les trous laissés par les catégories.

### 8.2 Fenêtre horaire visible (réveil → coucher)

- Le calendrier n'affiche **que les heures d'éveil**.
- L'axe horaire est gradué avec les **heures réelles de l'horloge**. La première
  graduation (en haut) est l'heure de réveil ; la dernière (en bas) est l'heure
  de coucher.
- Exemples : réveil à 7h → l'axe commence à `7h`, puis `8h`, `9h`… ; réveil à 8h
  → l'axe commence à `8h`. Même logique pour la dernière heure. **Aucune
  numérotation relative** (pas de « 1h, 2h… »).
- Le sommeil n'est jamais affiché.
- Source : heure de réveil/coucher dérivée de la catégorie « sommeil » du
  planning, ou à défaut de `sleepStart` / `sleepEnd` des réglages.
- **Repli** : si aucun sommeil n'est défini, afficher la journée complète
  (00h–24h).

### 8.3 Vue Mois — carte de charge

- À l'ouverture de la vue Mois, le moteur calcule le placement sur **tout le
  mois** (du jour courant à la fin du mois) — pas seulement les 7 jours du plan
  opérationnel. Calcul fait **à la demande**, quand la vue Mois est affichée.
- Chaque jour est coloré selon sa **charge** = le **temps libre restant** ce
  jour-là (temps non occupé par des blocs de tâches/objectifs). Beaucoup de
  temps libre restant → jour peu chargé ; peu → jour très chargé.
- Échelle **relative** sur les jours calculés : le jour avec le plus de temps
  libre restant → **vert** ; le moins → **rouge** ; dégradé continu entre les
  deux (vert → lime → jaune → orange → rouge).
- Les jours déjà passés ne portent pas de charge (cohérent avec §6) : cellule
  neutre.

## 9. Recalcul

Le plan étant un état dérivé (§10), il est recalculé automatiquement dès que
l'une de ses entrées change :

- la **date du jour** (la fenêtre glisse à chaque nouveau jour local) ;
- une **tâche** créée, modifiée (niveau, échéance, lien objectif), terminée ou
  supprimée ;
- un **objectif** créé, modifié ou supprimé ;
- le **niveau de temps libre** ;
- le **planning** (catégories).

Le recalcul vaut pour les **deux plages** (§3) : le plan opérationnel de 7 jours
(toujours), et l'aperçu mensuel **lorsque la vue Mois est affichée** (calculé à
la demande, recalculé tant qu'elle reste ouverte).

## 10. Architecture & données

### Moteur — fonction pure

- Nouveau module `src/renderer/src/lib/placement-engine.ts`.
- Fonction **pure et déterministe** :
  `computePlacement({ tasks, objectives, rules, entries, freeTimeLevel, todayStr, rangeEndStr }) → PlacedBlock[]`.
  `todayStr` fixe le multiplicateur d'échéance et le premier jour planifié ;
  `rangeEndStr` est le dernier jour planifié (`todayStr + 6` pour le plan
  opérationnel, fin du mois pour l'aperçu mensuel).
- Déterministe = mêmes entrées ⇒ même plan (aucun `Math.random`, aucun
  `Date.now()` interne ; la date est passée en paramètre). C'est ce qui garantit
  la stabilité du plan : tant que les tâches/objectifs/planning ne changent pas,
  le plan affiché ne bouge pas.
- Type de sortie `PlacedBlock` :
  ```
  {
    id: string,
    date: 'YYYY-MM-DD',
    startMinute: 0..1439,
    endMinute: 1..1440,
    kind: 'task' | 'objective' | 'free',
    refId: string | null,        // id de la tâche/objectif ; null si 'free'
    linkedTaskId: string | null  // si kind='objective' : tâche liée mise en avant
  }
  ```
- Réutilise `computeFreeTimeSlots` et `getDeadlineMultiplier` de
  `free-time-calculator.ts`.

### Pas de persistance pour cette couche

Le plan est un **état dérivé** : recalculé à la volée (`useMemo`) à partir des
tâches, objectifs, planning et de la date du jour. Aucun fichier
`vethos_placement.json`, aucune nouvelle clé de stockage. La fonction pure étant
déterministe, le plan reste stable sans avoir à le persister.

(La couche 3 — blocage piloté par le bloc actif — devra rendre le plan
accessible au service Windows ; elle introduira à ce moment-là le transport ou
la persistance nécessaires, en réutilisant la même fonction `computePlacement`.)

### Réglages

- `SettingsSchema` : ajouter `freeTimeLevel` (entier 4–7, défaut 5) et
  `freeTimeLevelChangedAt` (ISO datetime, optionnel).

### Renderer

- `PlanningPage` / `WeekCalendar` : afficher les blocs de travail en lecture
  seule, appliquer la fenêtre horaire réveil→coucher. Le plan provient d'un
  `useMemo` sur `computePlacement`.
- `MonthView` : recolorer selon la charge réelle (§8.3) au lieu de la charge par
  jour-de-semaine actuelle.
- `HomePage` : remplacer la double distribution actuelle par les données du
  moteur unifié.

## 11. Couches suivantes (rappel, hors périmètre)

- **Couche 2** — jeux de distractions par objectif, surcharge par tâche.
- **Couche 3** — le service accède au plan (transport ou persistance à définir
  dans sa propre spec), détecte le bloc actif, applique le blocage correspondant.
- **Bugs** — service Windows, scan d'apps, historique navigateur.

## 12. Risques & questions ouvertes

- **Fragmentation des créneaux** : des trous trop courts (< 30 min) peuvent
  empêcher de placer tout le budget. Le moteur dégrade proprement (§5.6) ; à
  surveiller à l'implémentation.
- **Refonte de `free-time-calculator`** : `distributeTimeToTasks` /
  `distributeTimeToObjectives` et leurs usages dans `HomePage` sont remplacés
  par le moteur unifié. Les fonctions de créneaux (`computeFreeTimeSlots`) et de
  multiplicateur sont conservées.
- **Plan 7 jours vs aperçu mensuel** : les deux plages (§3) produisent une
  distribution différente, donc la charge d'un jour dans la vue Mois peut
  différer légèrement du plan de la vue Semaine. Assumé : le Mois est un aperçu,
  la Semaine est le plan opérationnel.
- **Sommeil non contigu** : la fenêtre réveil→coucher suppose un sommeil
  d'un seul tenant. Cas multi-segments à confirmer (repli : journée complète).
