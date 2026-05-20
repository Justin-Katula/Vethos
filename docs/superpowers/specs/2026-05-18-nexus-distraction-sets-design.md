# Nexus — Registre des sites/apps et classification (« Calendrier vivant », couche 2)

## Contexte
Partie A + Partie B livrent le calendrier vivant. Cette couche 2 définit
**comment Nexus sait quoi bloquer** quand un bloc de tâche/objectif s'active.
La couche 3 (suivante) fera le déclenchement automatique côté service.

## Statut de la conception
Brainstormé en session avec l'utilisateur. Toutes les décisions ci-dessous ont
été validées explicitement.

## Vision

Plutôt que l'utilisateur saisisse à la main une liste de sites et apps à
bloquer pour chaque objectif, **Nexus apprend en regardant** : il scanne les
apps installées, observe les sites visités, classe par usage, et demande à
l'utilisateur de classifier chaque nouveau site/app (« utile pour quoi ? »).
La liste de blocage est ensuite **déduite** à partir de cette classification :
pendant un bloc d'objectif O, tout ce qui n'est pas marqué utile pour O est
bloqué.

## Décisions de design

### D1 — Granularité de classification
- Classification au niveau **objectif** (case à cocher).
- Pour les **tâches autonomes** (non liées à un objectif), classification au
  niveau de la tâche elle-même (les tâches autonomes sont des items à part
  entière dans le calendrier vivant).
- Les **tâches liées à un objectif** héritent de l'objectif — pas de
  classification site-par-site séparée pour elles. Si une tâche liée a besoin
  d'un site bloqué différemment, soit l'utilisateur le marque utile pour
  l'objectif parent (et toutes ses tâches y accèdent), soit il ne le fait pas
  (et personne n'y accède pendant cet objectif).

### D2 — Ce qu'on peut bloquer
- Sites web (domaines).
- Applications (processus .exe).
- Apps réseau (chemin complet .exe pour blocage firewall).
- Politique de déverrouillage : cooldown / justification / les deux / aucun.

### D3 — Le registre
Nouvelle entité centrale, `RegistryItem` :
```
RegistryItem {
  id              // uuid
  kind            // 'site' | 'app'
  identifier      // domaine ('youtube.com') ou .exe ('discord.exe')
  displayName     // libellé lisible
  usageCount      // visites (site) ou minutes d'usage cumulé (app)
  lastSeenAt      // ISO datetime
  classified      // true ssi l'utilisateur a répondu au moins une fois
  demoted         // true ssi l'item a été démontré « utile » → « distraction »
                  // (one-way, jamais réversible — cf. D11)
  usefulFor: {
    objectives: ObjectiveId[]
    standaloneTasks: TaskId[]
  }
}
```

États logiques :
- `classified: false` → **inconnu** → bloqué par défaut pendant tout bloc +
  listé dans « non classifiés » de la BlockingPage.
- `classified: true` + `usefulFor` vide partout → **distraction explicite** →
  bloqué pendant tout bloc.
- `classified: true` + `usefulFor.objectives` contient O → autorisé pendant
  les blocs de O ; bloqué ailleurs.

### D4 — Politique de déverrouillage
- Chaque `Objective` gagne un champ `unlockPolicy` (la politique qui s'applique
  pendant ses blocs).
- Chaque `Task` autonome (`linkedObjectiveId === null`) gagne aussi
  `unlockPolicy`.
- Les tâches liées héritent de l'objectif (pas de champ propre).
- Forme : même union discriminée que l'actuelle `BlockingProfileSchema`
  (`none | cooldown | justification | both`).

### D5 — `BlockingProfile` autonome → supprimé
- L'utilisateur ne crée plus de profils.
- Le **schéma Zod `BlockingProfileSchema` reste** comme format de **payload
  de session** envoyé au service (Partie A P16) : à chaque session, le renderer
  construit un profile éphémère à partir du résultat du resolver +
  `unlockPolicy` de l'objectif/tâche.
- La storage key `blocking` et son contenu `profiles[]` deviennent inutiles
  (mais on les laisse en place pour ne pas casser les fichiers existants ;
  l'UI ne les lit plus).

### D6 — Détection automatique
- **Apps** : scanner périodique du registre Windows (au démarrage + 1×/jour).
  Réutilise/répare `app-discovery.ts`. Le tracker existant
  `app-usage-tracker.ts` continue à alimenter `usageCount`.
- **Sites** : tracker basé sur l'historique navigateur existant
  (`browser-history.ts` + `site-tracker.ts`). Chaque nouveau domaine visité
  devient un `RegistryItem { kind: 'site', classified: false }`.
- Préreq : les bugs 2 et 3 (scan apps + historique) doivent être réparés
  (cf. `docs/superpowers/specs/2026-05-18-nexus-known-bugs-diagnostics.md`).
  Sans ça, le registre reste vide en pratique.

### D7 — Prompts de classification
- **Mode par défaut** : popup immédiat dès qu'un nouveau site/app est détecté.
  Le popup propose : multi-select objectifs/tâches-autonomes + bouton
  « C'est une distraction » (= classified avec usefulFor vide) + bouton
  « Plus tard » (laisse l'item dans la liste « non classifiés »).
- **Mode batch (configurable)** : dans SettingsPage, un réglage choisit
  l'intervalle d'accumulation : *immédiat* (par défaut), *3 h*, *1 jour*,
  *1 semaine*. En mode batch, pas de popup ; les items s'accumulent dans la
  BlockingPage avec un badge `« 3 nouveaux »` dans la sidebar.
- **Garantie** : un item déjà `classified: true` n'est **jamais** re-prompté
  automatiquement. L'utilisateur peut toujours rééditer manuellement via la
  BlockingPage.

### D8 — Comportement pendant un bloc
- Pendant un bloc d'**objectif O** : items du registre où `demoted` OU
  `!classified` OU (`classified && O ∉ usefulFor.objectives`) → **bloqués**.
- Pendant un bloc de **tâche autonome T** : items où `demoted` OU
  `!classified` OU (`classified && T ∉ usefulFor.standaloneTasks`) → **bloqués**.
- Les IDs de tâches dans `usefulFor.standaloneTasks` qui pointent vers des
  tâches en `history` (échéance passée) sont **ignorés** par le resolver —
  ce qui implémente naturellement l'expiration des classifications par tâche.
- Le service applique le payload résolu via le mécanisme `START_SESSION`
  existant (P16) — pas de changement service pour cette couche.

### D9 — Nouvelle BlockingPage
Sections, du haut vers le bas :
1. Bannière statut du service (existante, P16).
2. Session active si en cours (existante).
3. **Non classifiés** (n items) — visible dans la sidebar via un badge.
   Chaque ligne : nom + boutons rapides « Utile pour ▾ » (multi-select) /
   « Distraction » / « Plus tard ».
4. **Apps installées** — triées par `usageCount` desc. Pour chaque app :
   sa classification courante, modifiable en ligne.
5. **Sites suivis** — triés par `usageCount` desc. Pareil.
6. Historique des sessions (existant).

L'utilisateur ne crée plus de profils, ne lance plus de session manuellement
depuis cette page (le blocage est piloté par le calendrier → couche 3).

### D10 — Réglages additionnels
Dans `SettingsPage`, nouveau réglage :
- **Mode de classification** : *immédiat* (défaut) / *batch 3 h* / *batch 1 j* /
  *batch 1 sem*. Stocké dans `SettingsSchema.classificationMode`.

### D11 — Règles d'anti-sabotage (verrouillage)

L'utilisateur a explicitement demandé un modèle très strict d'anti-sabotage,
cohérent avec le calendrier verrouillé de la Partie B (§7) et le cooldown
2 jours du niveau des objectifs/tâches (Partie A).

**Sur les classifications de sites/apps :**
- Aucune modification une fois définie. Une association `(site, objectif)` ou
  `(site, tâche)` ne peut **jamais** être supprimée individuellement par
  l'utilisateur.
- **Seule exception autorisée** : la **dégradation one-way** d'« utile » vers
  « distraction ». Concrètement : l'utilisateur peut basculer `demoted = true`
  sur un item ; cela le bloque partout, en court-circuitant tout
  `usefulFor`. Cette bascule est **irréversible** — `demoted` ne peut jamais
  redevenir `false`.
- **Avertissement avant création** : avant qu'une classification soit
  enregistrée (popup ou édition manuelle dans la BlockingPage), l'app affiche
  un message clair « Une fois validé, tu ne pourras plus revenir en arrière.
  Es-tu sûr ? ». Confirmation requise.

**Sur les tâches :**
- Une fois créée, une tâche **ne peut pas être supprimée** ni marquée
  « terminée » manuellement tant que son échéance n'est pas atteinte.
- **Seule modification autorisée** : le niveau (avec cooldown 2 jours, règle
  Partie A existante).
- À l'échéance, la tâche bascule automatiquement en `status: 'history'`
  (mécanisme existant). À ce moment seulement, ses associations de
  classification se « libèrent » (résolveur les ignore — cf. D8).

**Sur les objectifs :**
- Pas de deadline obligatoire (déjà optionnelle). Les associations restent
  actives tant que l'objectif n'est pas supprimé.
- La suppression manuelle d'un objectif suit la même logique stricte que les
  tâches (à clarifier en design d'objectifs ; non couvert par cette spec).

**Sur les sessions en cours :**
- Une session déclenchée par un bloc va jusqu'à sa fin prévue, quoi qu'il
  arrive. Aucun mécanisme d'interruption.
- Pour accéder à un site bloqué pendant une session, le seul recours est
  l'`unlockPolicy` de l'objectif/tâche (cooldown ou justification).

## Périmètre

**Dans :**
- `RegistryItem` schema + storage key (nouveau).
- `Objective.unlockPolicy`, `Task.unlockPolicy` (champs additifs).
- Resolver pur `resolveBlockingForBlock(block, registry, objectives, tasks)`.
- BlockingPage refonte (sections « non classifiés », « apps installées »,
  « sites suivis »).
- Popup de classification (immédiat) + indicateur de mode batch.
- Réglage `classificationMode`.
- Retrait de l'UI de profils autonomes.

**Hors :**
- **Déclenchement automatique** (couche 3, spec séparée).
- **Fix des bugs 2 et 3** (sans eux, le registre reste vide en pratique, mais
  l'architecture est valide ; corrigés dans un chantier parallèle).
- Le format `BlockingProfileSchema` reste pour la sérialisation des sessions
  (pas de changement service).

## Architecture & fichiers

**Schéma** (`src/shared/schemas.ts`) :
- Ajouter `RegistryItemSchema` + `RegistryStateSchema` (+ storage key
  `'registry'`).
- Ajouter `UnlockPolicySchema` (extrait de `BlockingProfileSchema`) +
  `unlockPolicy` optionnel sur `Objective` et `Task`.
- Ajouter `classificationMode` à `SettingsSchema`.

**Store** (renderer) :
- Nouveau `registry.store.ts` (Zustand) : CRUD du registre + actions de
  classification.

**Pure logic** :
- `src/renderer/src/lib/blocking-resolver.ts` (nouveau, TDD) :
  `resolveBlockingForBlock(block, registry, objectives, tasks) → SessionPayload`.

**UI** :
- `src/renderer/src/pages/BlockingPage.tsx` — refonte complète.
- `src/renderer/src/components/blocking/ClassificationDialog.tsx` (nouveau) —
  popup immédiat (mode par défaut).
- `src/renderer/src/components/blocking/UnclassifiedList.tsx` (nouveau) —
  section « non classifiés ».
- `src/renderer/src/components/blocking/RegistryList.tsx` (nouveau) — sections
  « apps installées » / « sites suivis » (un seul composant paramétré par
  `kind`).
- Éditeur d'objectif (à localiser) — ajouter section `unlockPolicy`.
- Éditeur de tâche autonome — ajouter section `unlockPolicy`.
- `SettingsPage.tsx` — ajouter le toggle `classificationMode`.

**Trackers** (existant à réparer/adapter) :
- `app-discovery.ts` — réparer (bug 2) puis brancher pour alimenter le registre.
- `app-usage-tracker.ts` — câbler les `usageCount` vers le registre.
- `browser-history.ts` + `site-tracker.ts` — réparer (bug 3) puis alimenter
  le registre.

## Risques

- **Dépendance forte aux bugs 2 et 3** : sans eux, le registre n'a aucune
  donnée et l'app n'a rien à classifier. L'UI fonctionne (saisie manuelle
  possible) mais le bénéfice principal est perdu.
- **Mode immédiat intrusif** : un popup pendant qu'on tape sur un nouveau
  site coupe le flow. Atténué par la possibilité de passer en batch.
- **Scalabilité du registre — connue, différée** : un utilisateur visite
  facilement 50–200 domaines uniques par semaine. Avec les règles
  anti-sabotage de D11 (no modifications), le registre grandit
  monotoniquement. Pour un utilisateur prudent qui ne classifie que ce qui
  compte vraiment, c'est gérable ; pour un utilisateur curieux, ça devient
  une charge cognitive importante.
  - **Mitigation prévue** : intégration future d'IA (planifiée par
    l'utilisateur) pour pré-classer automatiquement les nouveaux sites.
    L'utilisateur valide ou ajuste, mais le travail brut est automatisé.
  - **Pour v1** : assumer la limitation. Encourager la classification
    parcimonieuse via le mode batch et la possibilité de laisser indéfiniment
    des items en « non classifiés » (= bloqués par défaut, sans engagement).
- **Anti-sabotage strict** : l'utilisateur a fait des choix très contraints
  (D11). Le warning avant chaque action est critique — l'expérience UX dépend
  fortement de ce dialogue (clair, non ambigu, jamais sauté par défaut).
- **Tâches expirées dans `usefulFor`** : les associations vers des tâches
  archivées (en `history`) sont ignorées par le resolver mais persistent en
  données. À long terme, le registre peut accumuler des références mortes ;
  garbage collection optionnelle (hors v1).
