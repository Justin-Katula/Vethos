# Nexus — Spec d'ensemble et état du projet

Application desktop Windows de productivité/focus inspirée d'Opal.
Stack : Electron 30 + React 18 + TypeScript + Tailwind 3.4 + Framer Motion + Zustand.

---

## ⚠️ ÉTAT ACTUEL (lire en premier si tu reprends ce projet)

**Date de la dernière session :** 2026-05-02

**Ce qui est fait :**
- ✅ Brainstorming complet effectué avec l'utilisateur
- ✅ Décomposition en 6 sous-projets validée par l'utilisateur
- ✅ Spec du sous-projet 1 (Fondation) écrite et approuvée
- ✅ Plan d'implémentation détaillé du sous-projet 1 écrit (20 tâches, code complet à chaque step)

**Ce qui n'est PAS fait :**
- ❌ Aucun code écrit. `node_modules/` n'existe pas. Aucun fichier source.

**Prochaine étape immédiate :**
Exécuter le plan `docs/superpowers/plans/2026-05-02-nexus-foundation-plan.md`, tâche par tâche, en utilisant la skill `superpowers:subagent-driven-development` (recommandée par l'utilisateur lors de la session précédente).

**Si l'utilisateur redonne le même prompt initial (la longue description en 5 parties) :**
Ne refais PAS le brainstorming. Réfère-toi à cette page, à la spec, et au plan. Demande simplement : « On reprend là où on s'était arrêté ? J'ai le plan du sous-projet 1 (Fondation) prêt à exécuter — je commence ? »

---

## Décisions clés (verrouillées par l'utilisateur)

| Décision | Valeur | Pourquoi |
|---|---|---|
| Langage | TypeScript strict | Choisi par l'utilisateur (Q1 brainstorming) |
| Stack | electron-vite + electron-builder + React 18 + Tailwind 3.4 + Zustand + Framer Motion + Zod + Vitest | L'utilisateur a délégué les choix techniques |
| Qualité visuelle | **10-11/10** (relevé de 9/10 à 11/10 mid-brainstorming) | Inspiration Opal, design = part de la valeur |
| Ordre des sous-projets | 1. Fondation → 2. Blocage → 3. Interface → 4. Niveaux → 5. Onboarding → 6. Polish | Validé par l'utilisateur |
| Tailwind | v3.4 (pas v4) | Stabilité prioritaire pour ce plan |

## Sous-projets

| # | Sous-projet | Statut | Spec | Plan |
|---|---|---|---|---|
| 1 | Fondation (scaffold + thème + IPC + storage) | 📋 Plan écrit, prêt à exécuter | [spec](docs/superpowers/specs/2026-05-02-nexus-foundation-design.md) | [plan](docs/superpowers/plans/2026-05-02-nexus-foundation-plan.md) |
| 2 | Système de blocage (hosts / process / firewall + détection dérive) | ⬜ À spec après Sous-projet 1 | — | — |
| 3 | Interface principale (cercle 24h, calendrier, tableau couleurs) | ⬜ À spec | — | — |
| 4 | Système de niveaux + distribution du temps libre | ⬜ À spec | — | — |
| 5 | Onboarding (emploi du temps + objectifs + apps déclarées) | ⬜ À spec | — | — |
| 6 | Polish + persistance complète | ⬜ À spec | — | — |

## Sources de référence à NE PAS oublier

- 2 PDFs dans `PDF/` : `Focus_Mode_Blueprint_Scientifique.pdf` et `Focus_Mode_Guide_Complet_Blocage.pdf`. Ce sont les documents sources d'où l'utilisateur a tiré sa demande. À consulter au moment d'attaquer chaque sous-projet pour la nuance.
- Le prompt original de l'utilisateur (long, en français, en 5 parties) couvre toute l'app. Il n'a pas été perdu — il vit dans la spec d'ensemble que les sous-projets implémenteront progressivement.

## Conventions globales

- **Stockage** : JSON dans `app.getPath('userData')`, nommés `nexus_<key>.json`, écriture atomique (.tmp + rename)
- **Sécurité Electron** : `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- **Tests** : Vitest pour les modules main critiques
- **Mise à jour** : ce fichier est mis à jour à la fin de chaque sous-projet
- **Dossiers de travail** : specs dans `docs/superpowers/specs/`, plans dans `docs/superpowers/plans/`

## Comment reprendre l'exécution (instructions pour l'agent IA)

1. Lis ce fichier en entier
2. Lis la spec : `docs/superpowers/specs/2026-05-02-nexus-foundation-design.md`
3. Lis le plan : `docs/superpowers/plans/2026-05-02-nexus-foundation-plan.md`
4. Vérifie quelles tâches sont déjà cochées dans le plan (les `- [x]`)
5. Invoque `superpowers:subagent-driven-development` et reprends à la première tâche non cochée
6. **Ne refais pas le brainstorming**, **ne récris pas la spec**, **ne récris pas le plan**. Tout est validé.
