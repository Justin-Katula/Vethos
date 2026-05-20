# Nexus — Jeux de distractions (« Calendrier vivant », couche 2)

## Contexte
Partie A + Partie B ont câblé le moteur d'auto-placement dans le calendrier.
Reste à ce que les blocs déclenchent un vrai blocage. Cette couche (couche 2)
définit OÙ vit la liste des distractions ; la couche 3 fera le déclenchement
automatique côté service.

## ⚠️ Spec non brainstormée avec l'utilisateur
Les choix de cette spec n'ont **pas** été validés en brainstorming. Ils
s'appuient sur les décisions prises pour les Parties A et B (notamment la
granularité « par objectif avec exceptions par tâche »). À relire avant
implémentation si les hypothèses ne collent pas.

## Décisions de design

### D1 — Où vit le jeu de distractions ?
Sur l'`Objective` (champ optionnel `distractions`) ET sur la `Task` (champ
optionnel `distractionsOverride`). Cohérent avec le choix utilisateur de
brainstorming. Une tâche autonome peut elle aussi avoir un override.

### D2 — Forme du `DistractionSet`
Mêmes champs que l'actuelle `BlockingProfile`, **sans** {`id`, `name`,
`createdAt`} (qui ne s'appliquent pas) :
- `blockedSites: string[]` (domaines, regex validation)
- `blockedProcesses: string[]` (.exe, regex validation)
- `blockedNetworkApps: string[]` (chemins absolus .exe)
- `unlockPolicy` (union discriminée actuelle inchangée)

### D3 — Garder `BlockingProfileSchema` ?
**Oui** — c'est le format du payload de session envoyé au service (Partie A
P16). À chaque session démarrée, on **construit un `BlockingProfile` éphémère**
à partir du `DistractionSet` du bloc. Le concept de « profil persistant »
disparaît de l'UI, mais le schéma reste pour la sérialisation de session.

### D4 — Résolution des distractions d'un bloc
Fonction pure `resolveDistractions(block, tasks, objectives)` :
- bloc `'free'` → `null` (le temps libre ne bloque rien).
- bloc `'task'` (autonome) → `task.distractionsOverride ?? null`.
- bloc `'objective'` →
  - si `block.linkedTaskId` ET sa tâche a un `distractionsOverride` → l'override.
  - sinon → `objective.distractions ?? null`.

(Note : le moteur d'auto-placement ne produit pas de blocs `'task'` pour les
tâches **liées** à un objectif — elles sont absorbées dans le score de leur
objectif et ne reçoivent pas leur propre bloc. C'est documenté dans la spec
de la couche 1.)

### D5 — UI : où l'utilisateur édite les distractions ?
- **Éditeur d'objectif** : section « Distractions » utilisant un composant
  `DistractionSetForm` extrait du `ProfileEditor` actuel.
- **Éditeur de tâche** : toggle « Surcharger les distractions ». Si on, afficher
  `DistractionSetForm`. Le libellé du toggle s'adapte : « Surcharger celles de
  l'objectif » (tâche liée) ou « Ajouter des distractions spécifiques » (tâche
  autonome).
- **`BlockingPage`** : retire le bouton « Nouveau profile » et l'éditeur de
  profils. Garde la bannière de statut du service, la session active, l'historique.
  La page devient passive (information).

### D6 — Migration des données existantes
**Aucune.** L'utilisateur n'a pas pu créer de profils en pratique (bug du
service). Les éventuels `BlockingProfile` existants dans `nexus_blocking.json`
restent mais ne sont plus exposés par l'UI. Pas de migration automatique.

## Périmètre

**Dans le périmètre :**
- Schéma : `DistractionSetSchema`, champs sur Objective et Task.
- Resolver pur.
- UI de saisie sur Objective et Task.
- Retrait de l'UI de profil dans BlockingPage.

**Hors périmètre :**
- Déclenchement automatique (couche 3, spec séparée).
- Bugs (scan d'apps, historique navigateur — leur fix améliore l'UX de saisie
  des distractions mais ne bloque pas la couche 2).

## Risques

- L'éditeur de distractions dépend du scan d'apps installées et de la
  suggestion de sites (bugs 2 et 3). Si non corrigés, l'utilisateur tape les
  noms à la main. Acceptable pour livrer la couche 2 ; à fixer en parallèle.
- Le couplage UI-objectif/tâche grandit. Si les éditeurs deviennent trop gros,
  envisager de les éclater — mais pas dans cette couche.
- Si l'utilisateur revient et veut un modèle de distractions différent (par ex.
  une liste globale partagée par tous les objectifs), tout ce travail sera
  partiellement réécrit. C'est le risque inhérent à une spec non brainstormée.
