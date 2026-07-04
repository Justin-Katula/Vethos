# Audit Point 2 — Modèle utilisateur Vethos

## Questions globales

- Existant : partiel avant ce travail, intégré après ce travail. Les données restaient dispersées entre settings, tâches, objectifs, historique de blocage et registre. `UserModel` existait, mais était explicitement inactif et non persisté.
- Fichiers concernés : `src/shared/user-model.ts`, `src/renderer/src/store/user-model.store.ts`, `src/renderer/src/App.tsx`, `src/renderer/src/store/reset.ts`.
- Ce qui manquait : store central, persistance, reconstruction, collecte réelle, explications et diagnostics.
- Risques : le dépôt contient encore des architectures historiques nommées « shadow » hors Point 2. Elles ne sont pas utilisées par le nouveau UserModel, mais leur renommage global serait un chantier distinct et risqué.
- Changements effectués : modèle central local, versionné, borné, reconstruit depuis les vraies sources et rattaché au cycle Clerk. Le handler IPC compare désormais chaque `userId` de stockage à l’utilisateur Clerk actif et refuse tout accès inter-utilisateur; les chargements attendent cette synchronisation.
- Tests : isolation stockage, refus IPC inter-utilisateur, mismatch `userId`, immutabilité, sanitation, limites.
- Points restants : aucun contrôle sensible n’est activé. Le modèle n’influence ni planning ni blocage tant que les flags restent faux.

## 2.0 — Onboarding d’engagement

- Existant : partiel. Les builders d’engagement existaient, mais portaient encore un marqueur d’inactivité et l’ancien onboarding visuel ne collectait pas toutes les douleurs/faiblesses du nouveau contrat.
- Fichiers concernés : `src/shared/onboarding-model.ts`, `src/renderer/src/store/onboarding.store.ts`, `src/shared/user-model.ts`.
- Ce qui manquait : passage du résultat de l’onboarding vers le vrai store UserModel.
- Risques : l’UI actuelle ne demande pas encore chaque dimension du questionnaire cible; les valeurs absentes reçoivent des défauts prudents.
- Changements effectués : suppression des marqueurs parallèles, conversion de l’objectif réel et des heures de sommeil en engagements au moment de `finish()`, persistance dans le UserModel.
- Tests : résultats partiels, défauts, diagnostic et preview existants; conversion UserModel testée.
- Points restants : enrichir l’interface d’onboarding pour demander explicitement douleurs, faiblesses, domaines et style de protection au lieu de se contenter des données actuelles.

## 2.1 — Contrats UserModel

- Existant : oui, mais incomplet.
- Fichiers concernés : `src/shared/user-model.ts`.
- Ce qui manquait : contrat direct sans marqueur parallèle, confiance/raisons du modèle de discipline, domaine `future`, date de mise à jour des préférences app/site et validation du `userId`.
- Risques : les types restent tolérants à la migration au chargement afin de ne pas casser les données locales.
- Changements effectués : contrat central complété, scores bornés, événements et corrections immuables, sanitation des domaines et historique limité.
- Tests : modèle vide, onboarding, merge, immutabilité, limites, sanitation et `userId` obligatoire.
- Points restants : aucun pour le contrat de base.

## 2.2 — Collecteur d’événements

- Existant : partiel; wrappers présents, mais collecte non branchée.
- Fichiers concernés : `src/renderer/src/lib/user-event-collector.ts`, stores tâches/objectifs/blocage.
- Ce qui manquait : écriture dans le vrai UserModel.
- Risques : certaines transitions métier n’existent pas encore dans les stores (skip explicite, recommandation acceptée/rejetée); leurs wrappers existent, mais aucun faux événement n’est inventé.
- Changements effectués : collecte des tâches créées/complétées, objectifs sélectionnés, sessions démarrées/terminées et demandes/décisions d’unlock. Les justifications privées ne sont pas stockées.
- Tests : générique, session, app, site normalisé, date injectée, immutabilité et limite.
- Points restants : brancher skip/expiration/recommandations lorsque ces actions disposeront d’un flux métier explicite.

## 2.3 — Snapshot

- Existant : non.
- Fichiers concernés : `src/renderer/src/lib/user-model-snapshot.ts`, `src/renderer/src/App.tsx`.
- Ce qui manquait : reconstruction complète depuis les données existantes.
- Risques : le snapshot est additif et ne migre ni ne remplace les stores sources.
- Changements effectués : snapshot déterministe à partir de tâches, objectifs, sessions, registre, historique, statistiques cognitives, événements et corrections; reconstruction au boot après chargement des stores.
- Tests : sources manquantes, déterminisme, immutabilité et `userId`.
- Points restants : injecter les settings détaillés et le planning quand ces signaux seront nécessaires aux scores.

## 2.4 — Préférences d’objectifs

- Existant : non.
- Fichiers concernés : `src/renderer/src/lib/objective-preference-builder.ts`.
- Ce qui manquait : importance, engagement, impact, évitement, stagnation, momentum, confiance et raisons.
- Risques : formules heuristiques; elles ne doivent pas piloter le planning sans validation produit.
- Changements effectués : scores bornés, récence, corrections fortes, distinction importance/évitement et prudence sur faible volume.
- Tests : objectif important évité/stagnant, momentum récent, raisons et bornes.
- Points restants : calibrage avec un corpus réel.

## 2.5 — Profil cognitif

- Existant : données d’efficacité disponibles, builder central absent.
- Fichiers concernés : `src/renderer/src/lib/cognitive-profile-builder.ts`.
- Ce qui manquait : agrégation horaire, chronotype détecté séparé, fenêtres et fatigue.
- Risques : une fenêtre forte exige au moins deux signaux; la confiance reste basse avec peu de données.
- Changements effectués : efficacité protégée contre division par zéro, bornes, fatigue et contradiction déclaration/observation conservée.
- Tests : matin efficace, contradiction, faible échantillon et bornes.
- Points restants : mieux répartir les longues sessions sur plusieurs heures.

## 2.6 — Risque de discipline

- Existant : non comme modèle utilisateur central.
- Fichiers concernés : `src/renderer/src/lib/discipline-risk-builder.ts`.
- Ce qui manquait : risque global/contextuel, apps/sites risqués et pattern d’unlock.
- Risques : l’historique actuel ne fournit pas toujours un hash d’excuse; aucun texte privé complet n’est conservé.
- Changements effectués : scoring borné, raisons obligatoires, normalisation des domaines et réduction prudente par corrections fortes hors session.
- Tests : ouvertures répétées, site normalisé, raisons.
- Points restants : enrichir les signaux de crédibilité structurés côté historique d’unlock.

## 2.7 — Modèle contextuel app/site

- Existant : registre global et associations tâche/objectif déjà présents; modèle contextuel absent.
- Fichiers concernés : `src/renderer/src/lib/app-site-context-model.ts`.
- Ce qui manquait : règles spécifiques, priorités de source et résolution de contexte.
- Risques : aucun hardcode d’app/site; le fallback reste à faible confiance.
- Changements effectués : priorité tâche > objectif > domaine > fallback, correction utilisateur dominante, correction en session limitée, domaines normalisés.
- Tests : règle tâche spécifique, fallback et normalisation.
- Points restants : exposer une UI utilisateur complète de correction, distincte du panneau développeur.

## 2.8 — Corrections

- Existant : non.
- Fichiers concernés : `src/renderer/src/lib/user-correction-system.ts`.
- Ce qui manquait : création, poids, suspicion, merge et application immuable.
- Risques : une correction suspecte est conservée mais ne modifie jamais directement le blocage.
- Changements effectués : poids 0,25/0,5/0,8/1, réduction en session stricte, priorité permanente, application aux objectifs/chronotype/apps/sites.
- Tests : correction stricte suspecte, permanent dominant, immutabilité et normalisation.
- Points restants : brancher les futurs contrôles UI sur `applyCorrection`.

## 2.9 — Explications

- Existant : non.
- Fichiers concernés : `src/renderer/src/lib/user-model-explanation.ts`.
- Ce qui manquait : explications réutilisables, raisons et confiance.
- Risques : debug absent par défaut; langage non humiliant.
- Changements effectués : explications modèle, objectif, cognition, discipline, app/site et correction.
- Tests : stagnation, faible confiance, raisons non vides, aucun debug par défaut.
- Points restants : localisation complète des libellés techniques de classification.

## 2.10 — Diagnostics

- Existant : non.
- Fichiers concernés : `src/renderer/src/lib/user-model-diagnostics.ts`.
- Ce qui manquait : santé du modèle et détection des incohérences.
- Risques : diagnostic développeur uniquement.
- Changements effectués : détection `userId`, mismatch, version, scores, surconfiance, raisons absentes, règles absentes, contradictions, URLs et métadonnées sensibles.
- Tests : scores, risque sans raisons, URL complète et état.
- Points restants : aucun majeur.

## 2.11 — Stockage

- Existant : non.
- Fichiers concernés : `src/renderer/src/lib/user-model-storage.ts`, `src/shared/schemas.ts`.
- Ce qui manquait : clé de stockage, load/save/clear/migration/prune.
- Risques : `clearUserModel` remet un modèle vide au lieu de supprimer physiquement le fichier, car l’API de stockage actuelle n’expose pas de suppression. L’isolation reste assurée par le fichier scopé `userId`.
- Changements effectués : migration tolérante, rejet des modèles corrompus/mismatch, événements limités, corrections permanentes préservées, sanitation avant sauvegarde.
- Tests : deux utilisateurs, clear scopé, corruption, migration et prune.
- Points restants : ajouter une primitive IPC de suppression seulement si un besoin produit l’exige.

## 2.12 — Flags

- Existant : non pour UserModel.
- Fichiers concernés : `src/shared/user-model-flags.ts`.
- Ce qui manquait : activation progressive directe.
- Changements effectués : capacités de lecture/calcul activées; affichage utilisateur, recommandations, planning et blocage désactivés par défaut.
- Tests : valeurs sûres, absence du terme interdit et garde planning/blocage.
- Points restants : flags actuellement statiques; les rendre configurables lorsque le rollout commencera.

## 2.13 — Panneau preview/debug

- Existant : non.
- Fichiers concernés : `src/renderer/src/components/user-model/UserModelPanel.tsx`, `src/renderer/src/pages/SettingsPage.tsx`.
- Ce qui manquait : vue réelle des engagements, raisons, confiance et diagnostics.
- Risques : visible uniquement en développement; aucune URL complète n’est affichée par le panneau.
- Changements effectués : panneau alimenté par le vrai store, les explications et diagnostics.
- Tests : logique sous-jacente testée; pas de nouvelle dépendance de test UI ajoutée au dépôt.
- Points restants : tests de rendu lorsque l’environnement React Testing Library du dépôt sera réparé.

## 2.14 — Activation progressive

- Existant : étape A absente avant ce travail.
- Fichiers concernés : store, App, flags et builders précédents.
- Changements effectués : étape A en place; étape B préparée via panneau/explications; C/D/E disposent de contrats lisibles mais restent désactivées.
- Risques : les anciens modules planning/blocage ne lisent pas le UserModel, ce qui est volontaire tant que les flags sont faux.
- Tests : les gardes interdisent planning et blocage par défaut.
- Points restants : validation produit et calibration avant toute activation C/D/E.

## Verdict produit

Le Point 2 n’est plus une collection de types inutilisée : le modèle est créé pour l’utilisateur Clerk actif, alimenté par des actions réelles, reconstruit, persisté, expliqué et diagnostiqué. Il sait déjà représenter un objectif important mais évité, une contradiction cognitive et une app/site utile dans un contexte mais risqué dans un autre. Il ne contrôle pas encore les décisions sensibles — volontairement — car la calibration comportementale et l’UI de correction doivent être validées avant d’activer recommandations, planning ou blocage.
