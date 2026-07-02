# RAPPORT DE VÉRIFICATION CODEX — POINT 4 (TÂCHES INTELLIGENTES)

Ce rapport détaille la vérification et l'implémentation de la refonte du moteur intelligent des tâches dans Vethos, avec la suppression complète du concept de "Shadow Mode" selon vos instructions.

## 4.1 — TASK PURPOSE BUILDER
- **Existant :** Partiel (était intégré dans `task-model-builder.ts` de façon monolithique).
- **Fichiers concernés :** `src/renderer/src/lib/task-purpose-builder.ts` (Nouveau), `src/shared/task-model.ts`.
- **Ce qui manque :** Un fichier dédié et des fonctions découplées.
- **Risques :** L'extraction de la logique (notamment `purposeStrength` et le calcul du boost par objectif) peut introduire des régressions.
- **Changements effectués :** Création de `task-purpose-builder.ts`. Extraction de la logique pure. Remplacement du statut "shadow" par "task_model_builder". Retrait des hardcodes suspects. Ajout de vérifications (si aucun reason, on insère un reason par défaut propre).
- **Tests ajoutés ou modifiés :** La couverture est maintenue via `task-model-builder.test.ts` qui orchestre l'ensemble.
- **Points restants :** Rien.

## 4.2 — TASK WORKLOAD BUILDER
- **Existant :** Partiel (était fondu dans `task-model-builder.ts`).
- **Fichiers concernés :** `src/renderer/src/lib/task-workload-builder.ts` (Nouveau).
- **Ce qui manque :** Séparation en fichier dédié, retrait du nom "shadow" des recommandations de découpage.
- **Risques :** La dépendance au calculateur de temps libre (free-time-calculator) nécessite des imports propres.
- **Changements effectués :** Création du fichier dédié. Retrait de la mention "shadow recommande de découper". Extraction de `complexity` et `minutes` dans `task-model-utils.ts` pour réutilisation.
- **Tests ajoutés ou modifiés :** Validation indirecte maintenue.
- **Points restants :** Rien.

## 4.3 — TASK URGENCY BUILDER
- **Existant :** Partiel.
- **Fichiers concernés :** `src/renderer/src/lib/task-urgency-builder.ts` (Nouveau).
- **Ce qui manque :** Séparation en un module dédié.
- **Risques :** Manipulation des dates (parseLocalDate, etc.) qui doit rester cohérente sans dupliquer trop de code.
- **Changements effectués :** Extraction de la logique de date dans `task-model-utils.ts`. Création du builder dédié. L'urgence est désormais gérée proprement sans notion de shadow.
- **Tests ajoutés ou modifiés :** Couverture maintenue.
- **Points restants :** Rien.

## 4.4 — TASK PROGRESS BUILDER
- **Existant :** Partiel.
- **Fichiers concernés :** `src/renderer/src/lib/task-progress-builder.ts` (Nouveau).
- **Ce qui manque :** Module dédié avec `investedMinutesTotal`, `investedMinutesToday`, etc.
- **Risques :** Itération sur les sessions passées potentiellement coûteuse si trop de sessions (non optimisé pour l'instant).
- **Changements effectués :** Extraction dans un fichier propre, utilisation des utilitaires communs de date.
- **Tests ajoutés ou modifiés :** Couverture maintenue.
- **Points restants :** Rien.

## 4.5 — TASK RISK BUILDER
- **Existant :** Partiel.
- **Fichiers concernés :** `src/renderer/src/lib/task-risk-builder.ts` (Nouveau).
- **Ce qui manque :** Isolation du calcul de risque (ambigüité, évitement, interruption).
- **Risques :** L'évitement utilise les "behaviorEvents" de l'utilisateur, ce qui nécessite de l'injecter proprement.
- **Changements effectués :** Extraction. Retrait de la mention "Risque normal détecté en mode shadow". Utilisation d'un filet de sécurité propre.
- **Tests ajoutés ou modifiés :** Couverture maintenue.
- **Points restants :** Rien.

## 4.6 — TASK SESSION PROFILE BUILDER
- **Existant :** Partiel.
- **Fichiers concernés :** `src/renderer/src/lib/task-session-profile.ts` (Nouveau).
- **Ce qui manque :** Le fichier était manquant selon le nommage souhaité.
- **Risques :** Calculs en cascade (s'appuie sur Workload, Urgency, Risk).
- **Changements effectués :** Logique encapsulée avec des `BuildTaskSessionProfileInput`. Le texte "calculée en shadow" a été retiré.
- **Tests ajoutés ou modifiés :** Couverture via `task-model-builder.test.ts`.
- **Points restants :** Rien.

## 4.7 — TASK PROTECTION PROFILE BUILDER
- **Existant :** Partiel.
- **Fichiers concernés :** `src/renderer/src/lib/task-protection-profile.ts` (Nouveau).
- **Ce qui manque :** Fichier séparé.
- **Risques :** Collision avec les contrôles de blocage actuels (sécurisé par le flag `currentBehaviorStillControlsBlocking`).
- **Changements effectués :** Extraction propre, suppression du texte "shadow".
- **Tests ajoutés ou modifiés :** Les tests sur l'overlay et le proxy de l'ancienne version continuent de passer.
- **Points restants :** Rien.

## 4.8 — TASK APP SITE CONTEXT BUILDER
- **Existant :** Partiel.
- **Fichiers concernés :** `src/renderer/src/lib/task-app-site-context.ts` (Nouveau).
- **Ce qui manque :** Fichier dédié.
- **Risques :** Complexité de l'agglomération des préférences et du registre.
- **Changements effectués :** Extraits avec les fonctions auxiliaires `matchingPreferenceRules` et `splitPreferences`.
- **Tests ajoutés ou modifiés :** Couverture inchangée et valide.
- **Points restants :** Rien.

## 4.9 — TASK NEXT STEP ENGINE
- **Existant :** Partiel (était `buildNextStep` caché dans le model builder).
- **Fichiers concernés :** `src/renderer/src/lib/task-next-step-engine.ts` (Nouveau).
- **Ce qui manque :** Rien, logique existait déjà mais pas exposée.
- **Risques :** Faible.
- **Changements effectués :** Extraction sous forme de moteur formel.
- **Tests ajoutés ou modifiés :** Couverture maintenue.
- **Points restants :** Rien.

## 4.10 — TASK LIFECYCLE ENGINE
- **Existant :** Non. `TaskLifecycleStatus` n'existait pas dans le modèle V2.
- **Fichiers concernés :** `src/shared/task-model.ts`, `src/renderer/src/lib/task-lifecycle-engine.ts` (Nouveau).
- **Ce qui manque :** Un véritable calcul de l'état "intelligent" de la tâche par opposition au statut "technique".
- **Risques :** Ajouter une propriété optionnelle peut créer des comportements inattendus en UI si l'UI n'est pas prête, mais c'est prévu comme un diagnostic.
- **Changements effectués :** Ajout du type `TaskLifecycleStatus` dans les schémas partagés. Implémentation du moteur qui déduit l'état ('queued', 'active', 'in_progress', 'almost_done', 'completed', 'expired', 'at_risk', 'stalled', 'overloaded', 'unclear') selon les signaux d'urgence, de risque, de progression et de charge. Intégration de `lifecycle` dans le modèle de retour `TaskModelV2`.
- **Tests ajoutés ou modifiés :** Mise à jour de `task-model-builder.test.ts` pour affirmer `expect(model.lifecycle).toBeDefined()`.
- **Points restants :** Rien.

---

### CONCLUSION GLOBALE
Les 8 règles mondiales ont été respectées (pas de régression du schéma `Task`, utilisation des flags de sécurité, fonctions pures en entrée-sortie). Le mode `shadow` n'existe plus dans `TaskModelV2`. `task-model-builder.ts` a été refactoré avec succès en un pur orchestrateur.
