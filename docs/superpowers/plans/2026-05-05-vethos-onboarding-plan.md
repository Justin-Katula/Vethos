# Plan d'exécution — Sous-projet 5 : Onboarding + apps déclarées

**Spec :** `docs/superpowers/specs/2026-05-05-vethos-onboarding-design.md`

11 tâches.

## O1. Schémas Zod

`src/shared/schemas.ts` : DeclaredAppSchema, DeclaredAppsStateSchema. `STORAGE_KEYS` += `'declared_apps'`. `STORAGE_SCHEMAS` complété. `SettingsSchema.onboardingCompleted` ajouté.

## O2. Templates onboarding (TDD)

`src/renderer/src/lib/onboarding-templates.ts` + `.test.ts` : 3 templates Étudiant / Pro hybride / Équilibré. `applyTemplate(template)` retourne `{rules, entries}` avec UUIDs régénérés. ≥ 4 tests : non-chevauchement, count >=, mapping rule↔entry préservé.

## O3. useDeclaredAppsStore (TDD)

`src/renderer/src/store/declared-apps.store.ts` + `.test.ts` (avec mock storage) : load/saveApp/deleteApp. ≥ 4 tests.

## O4. useOnboardingStore

`src/renderer/src/store/onboarding.store.ts` : step machine + skip/finish (persiste `settings.onboardingCompleted=true`).

## O5. OnboardingOverlay (shell)

`src/renderer/src/components/onboarding/OnboardingOverlay.tsx` : plein écran, header progress + skip, footer prev/next. Render conditionnel selon `step`.

## O6. WelcomeStep + UsernameStep

`src/renderer/src/components/onboarding/WelcomeStep.tsx` : logo animé + CTA. `UsernameStep.tsx` : input + bienvenue.

## O7. ScheduleStep

`ScheduleStep.tsx` : 3 cartes templates + preview WeekCalendar read-only. Apply au click → écrit dans `useScheduleStore`.

## O8. ObjectiveStep

`ObjectiveStep.tsx` : nom + description + palette + multi-select rules. Skip-able.

## O9. AppsStep

`AppsStep.tsx` : 6 suggestions (Code, Chrome, Firefox, Notion, Discord, Figma). Pour chaque cochée : objectif lié + ratio. Custom app input.

## O10. DonePage transitoire + Settings ré-ouverture

`DonePage.tsx` : confettis SVG + auto-redir 1.5s. `SettingsPage.tsx` étendue : bouton "Relancer l'onboarding".

## O11. Intégration App + vérif + commit + tag v0.5.0

- Monter `<OnboardingOverlay />` dans `App.tsx` au-dessus des routes, conditionnel sur `settings.onboardingCompleted !== true`.
- Charger settings au boot.
- typecheck/lint/test/build → VETHOS_SPEC.md → commit + tag `v0.5.0-onboarding`.
