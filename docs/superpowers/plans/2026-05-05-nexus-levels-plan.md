# Plan d'exécution — Sous-projet 4 : Niveaux + temps libre

**Spec :** `docs/superpowers/specs/2026-05-05-nexus-levels-design.md`

12 tâches.

## T1. Schémas Zod

`src/shared/schemas.ts` : Objective, FreeTimeEntry, FreeTimeBank, LevelsState. `STORAGE_KEYS` étendu à `'levels'`. `STORAGE_SCHEMAS` complété.

## T2. levels.ts (TDD)

`src/renderer/src/lib/levels.ts` + `.test.ts` : seuils, getLevelInfo. ≥ 6 tests.

## T3. credit-engine.ts (TDD)

`src/renderer/src/lib/credit-engine.ts` + `.test.ts` : computeCredits(history, rules, objectives, cursor) → deltas + freeTime + entries + cursor. Idempotence + multi-objectif + ignored entries. ≥ 6 tests.

## T4. useLevelsStore

`src/renderer/src/store/levels.store.ts` : load, saveObjective, deleteObjective, spendFreeTime (refus si balance < requested), reconcileWithHistory.

## T5. LevelRing atom

`src/renderer/src/components/levels/LevelRing.tsx` : SVG circle + arc + chiffre central. Étoile dorée niveau 10.

## T6. ObjectiveEditor slide-in

`src/renderer/src/components/levels/ObjectiveEditor.tsx` : pattern RuleEditor avec multi-select linkedRuleIds.

## T7. ObjectiveCard

`src/renderer/src/components/levels/ObjectiveCard.tsx` : couleur, icône, nom, description, LevelRing, "X min cette semaine".

## T8. SpendDialog

`src/renderer/src/components/levels/SpendDialog.tsx` : modal centré avec choix rapides + raison.

## T9. FreeTimeWidget

`src/renderer/src/components/levels/FreeTimeWidget.tsx` : compteur grand format + heatmap 7j + bouton dépenser.

## T10. ObjectivesPage

`src/renderer/src/pages/ObjectivesPage.tsx` : grille de cards + éditeur + empty state.

## T11. HomePage intégration FreeTimeWidget

Layout 3 colonnes : cercle | programme | freetime. Aussi ajouter `reconcileWithHistory` au load.

## T12. Vérification + commit + tag v0.4.0

typecheck/lint/test/build → NEXUS_SPEC mise à jour → commit + tag.
