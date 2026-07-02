# Point 3 — Audit des objectifs vivants

Audit réalisé le 2 juillet 2026 sur le code réellement présent. Le schéma persistant historique `Objective` reste volontairement inchangé : `ObjectiveModelV2` est un modèle dérivé, pur et compatible, construit à partir des données réelles.

## Réponses globales

- Avant ce travail, les objectifs étaient surtout des conteneurs de tâches et de règles de blocage. Un modèle V2 existait, mais il était explicitement isolé et n’alimentait pas la carte objectif.
- Après ce travail, mission, progression, risque, prochaine action, protection recommandée et explication sont calculables depuis les données réelles. La carte et le classement V2 des tâches les consomment.
- Le schéma principal n’a pas été remplacé brutalement. Aucun champ persistant obligatoire n’a été ajouté.
- Le placement et le blocage ne deviennent pas plus agressifs : leurs contrôles Point 3 restent désactivés. Le blocage réel continue d’utiliser les choix explicites `objective.blocking`/`task.blocking` et l’héritage tâche → objectif existant.
- Mission, risque, protection, prochaine action et explication produisent tous des raisons. Les valeurs inconnues comme le coût d’échec et la récompense restent `null` au lieu d’être inventées.
- Le `UserModel` est consulté : préférences d’objectif, engagements de discipline, style de protection, risque global de distraction, fatigue, événements, corrections et préférences apps/sites.

## 3.1 — Contrats `ObjectiveModelV2`

- Existant : **terminé et branché en réel**. Les dix sous-objets sont présents. L’ancien `Objective` coexiste avec le modèle dérivé.
- Fichiers : `src/shared/objective-model.ts`, `src/shared/schemas.ts`.
- Manque : `updatedAt` n’existe pas dans le schéma historique ; le modèle utilise le dernier changement connu ou `createdAt`. `failureCost` et `successReward` restent inconnus tant qu’aucune donnée utilisateur ne les fournit.
- Risques : rendre ces champs obligatoires dans le stockage casserait les données existantes ; ce changement n’a pas été fait.
- Changements : domaines alignés avec Point 2 (`future` inclus, `maintenance` normalisé vers `personal`), six états, champs complets, source `objective_model_builder`, debug optionnel et non affiché.
- Tests : construction des dix sous-objets, immutabilité, absence de propriété d’isolation historique.

## 3.2 — Objective builder

- Existant : **terminé et branché en réel** dans la carte et le classement V2 des tâches.
- Fichiers : `src/renderer/src/lib/objective-model-builder.ts`, `TodoPage.tsx`, `placement-v2-adapter.ts`.
- Manque : les sessions historiques actuelles n’exposent pas toujours un `objectiveId`; le builder sait relier une session par objectif ou tâche lorsque ces identifiants existent.
- Risques : les données incomplètes diminuent la confiance, sans inventer d’activité.
- Changements : les neuf familles d’entrées demandées sont acceptées, alias de transition compris; calcul pur et sans mutation.
- Tests : sans tâche, tâche active, tâches terminées, stagnation, deadline, avec/sans UserModel, sessions liées, immutabilité.

## 3.3 — Mission

- Existant : **partiel et branché**.
- Fichiers : `objective-mission-builder.ts`, `objective-model-builder.ts`.
- Manque : l’UI d’édition ne collecte pas encore explicitement coût d’échec/récompense/résultat désiré. L’onboarding est accepté par le moteur mais la carte ne lui passe pas directement son résultat.
- Risques : rapprocher un texte d’onboarding du mauvais objectif. Le moteur ne devine pas ce rapprochement.
- Changements : priorité correction utilisateur → préférence UserModel → onboarding (100/80/60) → niveau; engagements protégés reliés; mission utilisable sans Coach.
- Tests : préférence UserModel, fallback sans UserModel, raisons et confiance.

## 3.4 — Progression

- Existant : **terminé et branché en réel**.
- Fichiers : `objective-progress-builder.ts`, `objective-model-builder.ts`.
- Manque : aucun pour les champs demandés; la qualité dépend des estimations et des identifiants de session disponibles.
- Risques : une estimation absente doit déclencher le fallback par tâches, jamais une fausse précision.
- Changements : formule temporelle, fallback par nombre de tâches, confiance basse sans tâche, sessions comptées avant complétion, aucune mutation de `remainingMinutes`.
- Tests : zéro tâche, tâches complétées, session récente liée par objectif ou tâche, tâches expirées.

## 3.5 — Risque

- Existant : **terminé comme calcul, branché en affichage/recommandation; pas autoritatif sur planning/blocage**.
- Fichiers : `objective-risk-builder.ts`, `objective-model-builder.ts`.
- Manque : le contexte de capacité du planner est accepté, mais la carte ne dispose pas toujours d’une photographie complète des créneaux libres.
- Risques : sur-priorisation si un signal isolé est faux. Le risque ne modifie donc aucun état.
- Changements : stagnation (seuil principal 7 jours), évitement sur cinq événements, deadline + charge + capacité, surcharge, absence d’action, huit raisons explicites.
- Tests : stagnation, expiration, deadline, absence d’action, raisons non vides.

## 3.6 — Prochaine action

- Existant : **partiel et branché comme recommandation**.
- Fichiers : `objective-next-action-engine.ts`, `objective-model-builder.ts`, `ObjectiveCard.tsx`.
- Manque : `schedule_block` n’est pas encore choisi automatiquement. Il n’existe pas de bouton d’acceptation dédié créant une tâche depuis la carte.
- Risques : activer une tâche sans consentement. Le moteur ne modifie jamais la queue.
- Changements : continuité de tâche active, meilleure queued, création si vide, reprise 25/45 min selon charge, repos en cas fatigue+surcharge.
- Tests : active, queued, vide, stagnant; surcharge couverte par le risque.

## 3.7 — Protection

- Existant : **terminé comme profil, affiché; contrôle réel désactivé**.
- Fichiers : `objective-protection-profile.ts`, `objective-model-builder.ts`, `work-blocking.ts`.
- Manque : classification Coach directe et application automatique au blocage. Les corrections passent déjà via `appSitePreferences`.
- Risques : une classification erronée pourrait bloquer un outil utile. Pour cette raison, le profil recommandé n’écrase pas les choix réels.
- Changements : niveaux par défaut/recommandé distincts, allowlist pour engagements forts, unlock policy graduée, agrégation objectif+tâches+registre+UserModel.
- Tests : objectif fort, préférences utiles/distrayantes, style strict; les tests existants du resolver protègent l’héritage explicite.

## 3.8 — Cycle de vie

- Existant : **partiel et branché comme statut calculé**.
- Fichiers : `objective-lifecycle-engine.ts`, `objective-model-builder.ts`.
- Manque : l’UI et le schéma historique ne proposent pas encore les choix persistants `paused` et `archived`.
- Risques : confondre statut calculé et statut utilisateur. Le calcul n’écrit jamais le statut historique.
- Changements : priorité `archived/paused/completed` puis `stalled`, `at_risk`, `active`; complétion par statut ou toutes tâches à 100 %.
- Tests : complétion et stagnation via les tests du builder.

## 3.9 — Explication

- Existant : **terminé et branché en réel**.
- Fichiers : `objective-explanation-engine.ts`, `ObjectiveCard.tsx`.
- Manque : aucun blocage fonctionnel.
- Risques : ton culpabilisant. Les textes décrivent le contexte et jamais la valeur de la personne.
- Changements : jours, heures restantes, nombre de tâches et momentum injectés dynamiquement; messages positifs et alertes.
- Tests : deadline réelle, raisons toujours présentes.

## 3.10 — UI intelligente

- Existant : **terminé et branché en réel**.
- Fichiers : `ObjectiveCard.tsx`, `TodoPage.tsx`.
- Manque : action directe d’acceptation de recommandation.
- Risques : densité visuelle sur petite carte; l’explication est repliable.
- Changements : mission, progression, prochaine action, risque, temps hebdomadaire, protection et bouton « Pourquoi ? ».
- Tests : logique de données couverte; vérification visuelle automatisée indisponible dans cette session car aucune surface web locale n’était joignable.

## 3.11 — Diagnostics

- Existant : **terminé, réservé au développement**.
- Fichiers : `objective-diagnostics.ts`, `objective-diagnostics.test.ts`.
- Manque : aucun panneau debug utilisateur, volontairement.
- Risques : exposer des détails internes; ils ne sont pas rendus dans l’UI.
- Changements : huit incohérences demandées, seuil de plus de trois tâches actives, résultat healthy/warning/critical, lecture seule.
- Tests : objectif sans tâche/prochaine action, liste saine, immutabilité.

## 3.12 — Flags

- Existant : **terminé**.
- Fichiers : `src/shared/objective-model.ts`.
- Changements : `objectiveModelV2Enabled`, `objectiveRiskEnabled`, `objectiveNextActionEnabled`, `objectiveProtectionEnabled`, `objectiveProgressV2Enabled`, `objectiveExplanationsEnabled`; contrôles display/task queue/planning/blocking.
- État réel : affichage `true`, task queue `true`, planning `false`, blocking `false`. Chaque contrôle sensible possède donc un coupe-circuit immédiat.
- Tests : noms sans ancienne étiquette, contrôles sensibles désactivés.

## 3.13 — Activation réelle

- Existant : **partiel**.
- Affichage : actif avec données V2.
- Queue : le UserModel et le modèle objectif alimentent le score V2 lorsque le moteur de priorité réel est activé; la prochaine action reste une recommandation.
- Planning : le moteur Point 1 possède déjà ses propres flags, mais `ObjectiveRisk` Point 3 n’est pas rendu autoritatif par défaut.
- Blocage : seuls les réglages explicites historiques contrôlent le blocage. Le profil recommandé n’est pas appliqué automatiquement.
- Risques restants : avant d’activer planning/blocage, ajouter des tests d’intégration sur capacité extrême, faux risque critique, app utile contradictoire, registre incomplet et fallback sûr.

## Verdict produit

L’objectif n’est plus une carte décorative : il remplit réellement les rôles de mission, progression, risque, prochaine action, explication et recommandation de protection. Son rôle le plus abouti est désormais l’explication/action; le plus faible reste l’application automatique de protection, volontairement non activée sans preuves de sécurité suffisantes. Vethos le défend dans l’affichage et le classement, mais n’impose pas encore automatiquement son profil au planning ou au blocage.
