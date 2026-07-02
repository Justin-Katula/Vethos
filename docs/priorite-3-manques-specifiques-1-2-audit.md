# Priorité 3 — Manques spécifiques (1/2 et 2/2)

Audit et changements du 2 juillet 2026.

## Fonctionnalité 3 — PriorityResult

- Décision d’architecture : les builders restent purs et ne lisent aucun store. L’historique est préparé dans un point d’intégration unique (`TodoPage`) à partir des vrais événements du `UserModel` puis transmis dans `PriorityEngineContext`.
- Ajout : `selectPrimaryObjectiveId` choisit l’engagement actif principal avec niveau, importance déclarée, engagement observé et impact de vie. Cet identifiant renforce réellement `valueScore` des tâches et objectifs concernés.
- Persistance : les résultats sont écrits comme cache V2 versionné sur `Task`/`Objective`.
- Tests : sélection de l’objectif principal et hausse réelle de `valueScore`.

## Fonctionnalité 4 — UnderstandingResult

- Ajout : description détaillée de tâche, sessions liées et corrections utilisateur.
- Les corrections de catégorie prennent priorité; sessions, description et correction augmentent la confiance et ajoutent des raisons explicites.
- Le builder objectif analyse aussi description et notes des tâches liées.
- Tests : correction réelle, description détaillée, compteurs de preuves historiques.

## Fonctionnalité 6 — SessionPlan

- Ajout : pour un bloc objectif, la tâche active liée la plus forte est fournie sans transformer le bloc en bloc tâche.
- Le `disciplineModel` réel ajuste le niveau de protection et apporte apps/sites risqués.
- Les préférences contextuelles du `UserModel` préservent les apps/sites utiles; une ressource utile gagne toujours sur une classification risquée contradictoire.
- Tests : cible toujours `objective`, tâche active utilisée, app utile conservée, risque de distraction appliqué.

## Fonctionnalité 8 — LearningUpdate

- État réel : les signaux étaient déjà persistés dans `decision_log`, mais pas appliqués.
- Ajout : seuil de **3 signaux cohérents** et plafond cumulatif de **15 points par cible/champ/jour**.
- Application : ajustements d’estimation persistés sur la tâche et ajustements d’importance transmis comme correction faible au `UserModel`.
- Les signaux sous le seuil restent stockés et auditables.
- Tests : seuil de répétition et plafond journalier.

## Fonctionnalité 10 — UI « Pourquoi ? »

- Planning : explication existante conservée; confiance et sévérité brutes remplacées par une phrase humaine.
- Tâches : dimensions priorité, urgence, charge, stagnation et momentum traduites en phrases; raisons repliables via « Pourquoi ? ».
- Objectifs : mêmes dimensions, protection formulée humainement, explication repliable.
- Session active : « Pourquoi cette protection ? » explique le mode et le résultat réellement appliqué.
- Overlay : explique blocage, autorisation et refus; le pourcentage de confiance brut a été retiré.

## Fonctionnalité 16 — Migration des scores

- Ajout : `priorityScoreV2` optionnel sur `Task` et `Objective`, version de schéma `2`, date, sept dimensions et raisons.
- Les stores persistent les résultats réels et évitent les réécritures si le sens du score n’a pas changé.
- Rollback : `rollbackTaskPriorityScore` et `rollbackObjectivePriorityScore` retirent uniquement le cache V2; `level` reste intact.
- Tests : version, persistance et préservation de `level` au rollback.

## Fonctionnalité 17 — Affichage Priority

- Les cartes principales affichent désormais priorité, urgence, charge, stagnation et momentum.
- Aucun score de confiance ou niveau de sévérité brut n’est rendu dans ces surfaces utilisateur.

## Fonctionnalité 19 — Placement Priority

- Tous les fichiers du pipeline de placement et leurs tests sont maintenant absents de la sortie TypeScript ciblée.
- Le typecheck global reste en échec à cause de fixtures obsolètes dans `execution-preview`, `runtime-coordinator`, `session-diagnostics` et quelques autres tests hors placement. Ce reliquat appartient à la correction TypeScript globale de Priorité 1.

## Fonctionnalité 20 — SessionPlan → blocage

- Vérifié : `SessionPlan` produit le payload réel; `use-work-block-automation` l’envoie au store; le service applique les couches; `ProtectionResult` est persisté dans `ActiveSession`, remonté au renderer et journalisé.
- Vérifié automatiquement : démarrage, audit de couches, persistance, hydratation après redémarrage du service et couche `service_recovery` (`session/manager.test.ts`).

### Essais manuels système demandés

| Essai | Résultat | Motif |
|---|---|---|
| Spotify/media pendant protection | Non exécuté | Nécessite une session audio interactive et une classification réelle sur la machine utilisateur. |
| Redémarrage Windows complet | Non exécuté manuellement | Un reboot ne peut pas être déclenché sans interrompre et risquer la session. L’hydratation/recovery est couverte automatiquement. |
| Overlay réel au-dessus d’une app bloquée | Non exécuté manuellement | Nécessite d’ouvrir et bloquer une vraie application dans une session interactive. Les chemins d’explication sont branchés dans l’overlay. |
| Auto-blocage au début d’un bloc | Non exécuté manuellement | Nécessite l’horloge/planning et le service Windows actifs sur un bloc réel. La chaîne de code est branchée, mais cela ne remplace pas la preuve manuelle. |

Ces quatre lignes ne doivent pas être considérées comme validées produit avant exécution sur une machine de recette.

## Fonctionnalité 21 — Coach invisible

- Choix produit explicite : `CoachPrompt` est conservé comme panneau contextuel court de préparation de session, pas comme chat général. Il disparaît quand la tâche devient actionnable.
- Ajout : chaque appel Coach retourne désormais `decision`, `classification`, `confidence`, `reasons`, `safety.status`, `fallbackUsed` et `data`.
- Les fallbacks sont non bloquants et identifiés comme tels. Le registre conserve ses classifications existantes lorsqu’un fallback survient.
- Tests : enveloppe sûre, raisons, fallback et compatibilité registre.

## Fonctionnalité 22 — « Vethos explique tout »

- App bloquée/autorisée : raisons affichées dans l’overlay.
- Justification refusée : raison du service affichée.
- Protection : expliquée dans la session active et dans l’objectif.
- Objectif revenu aujourd’hui : urgence, stagnation, momentum et prochaine action apparaissent dans « Pourquoi ? ».
- Repos : la raison de `nextAction.rest` est maintenant incluse dans l’explication objectif.

## Vérifications

- Suite ciblée métier : priorité, compréhension, session, apprentissage, migration, objectifs, Coach, registre, blocage et service.
- Pipeline placement : aucune erreur TypeScript ciblée.
- Limite restante : typecheck global encore bloqué par des tests obsolètes hors placement, listés plus haut.
