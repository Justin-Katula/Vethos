# Plan d'exécution — Sous-projet 3 : Interface principale

**Spec :** `docs/superpowers/specs/2026-05-05-vethos-interface-design.md`
**Date :** 2026-05-05

15 tâches dans l'ordre.

## T1. Étendre `STORAGE_KEYS` + schémas Zod

`src/shared/schemas.ts` :
- Ajouter `'schedule'` à `STORAGE_KEYS`.
- Ajouter `TimeRuleSchema`, `ScheduleEntrySchema`, `ScheduleStateSchema` + types.

## T2. Module sélecteurs purs (TDD)

`src/renderer/src/lib/schedule-selectors.ts` :
- `getCurrentEntry(state, now)`
- `getNextChange(state, now)`
- `hasOverlap(entries, draft)`
- `snapTo15(minute)`
- `entriesByDay(entries)` (helper tri)

`schedule-selectors.test.ts` : couvre tous les cas (dedans/dehors, wrap semaine, chevauchement, snap).

## T3. Module format-time pur (TDD)

`src/renderer/src/lib/format-time.ts` :
- `minuteToHHMM(m)`
- `durationLabel(minutes)` (`30 min`, `1h`, `1h30`)
- `formatCountdown(ms)` (`MM:SS`)

`format-time.test.ts`.

## T4. Store Zustand `useScheduleStore`

`src/renderer/src/store/schedule.store.ts` :
- État : `loaded`, `rules`, `entries`.
- `load()` : `vethos.storage.read('schedule')`, hydrate.
- `saveRule`, `deleteRule` (cascade), `saveEntry` (validate overlap), `deleteEntry`.
- Persistance : après chaque mutation, `vethos.storage.write('schedule', { rules, entries })`.

## T5. Palette + icônes

`src/renderer/src/lib/rule-palette.ts` :
- `PALETTE: string[]` 12 couleurs hex cohérentes thème.
- `ICON_OPTIONS: Array<{ name: string; Icon: LucideIcon }>` 12 icônes.

## T6. Composant `RuleEditor` (slide-in panel)

`src/renderer/src/components/interface/RuleEditor.tsx` :
- Slide-in droite, structure copiée de `ProfileEditor`.
- Champs : name, color (palette + hex), icon (grille de boutons), linkedProfileId (select).
- Save / Cancel / Delete (avec confirm).

## T7. Composant `RuleTable`

`src/renderer/src/components/interface/RuleTable.tsx` :
- Liste horizontale de cards.
- Card "+ Nouvelle règle" en fin.
- Click → ouvre `RuleEditor`.

## T8. Composant `EntryQuickPicker`

`src/renderer/src/components/interface/EntryQuickPicker.tsx` :
- Popup ancré (position absolue).
- Chips colorées des règles + chip "Nouvelle règle…".
- Click chip → callback `onPick(ruleId)`.
- Esc / clic dehors → `onCancel`.

## T9. Composant `WeekCalendar`

`src/renderer/src/components/interface/WeekCalendar.tsx` :
- Grille SVG-free (HTML/CSS absolu).
- En-têtes Lun-Dim.
- Pour chaque entrée : `<EntryBlock>` positionné absolu.
- `mousedown` cellule vide → ghost + tracking ; `mouseup` → ouvre `EntryQuickPicker`.
- Poignées top/bottom de chaque bloc → resize.
- Click bloc → menu inline (Changer règle, Supprimer).
- Snap 15min.

## T10. Composant `TimeCircle`

`src/renderer/src/components/interface/TimeCircle.tsx` :
- SVG 480×480.
- Anneau extérieur 24 marques.
- Arcs colorés du jour courant (`<path d="...">`, util `polarToCartesian` + `describeArc`).
- Curseur rotatif animé (Framer Motion `rotate`).
- Centre : heure courante, rule.name, countdown.
- Animation montage : balayage 0 → heure courante.

## T11. Logo Vethos dans la sidebar

`src/renderer/src/components/VethosLogo.tsx` : SVG inline (recréation du wordmark "Vethos" avec N stylisé).
Modif `Sidebar.tsx` : insertion logo en haut.

## T12. Page `HomePage` complète

Compose : titre, `TimeCircle` centré, sous-section "Aujourd'hui" listant les blocs du jour ordonnés.

## T13. Page `PlanningPage` complète

Compose : `RuleTable` en haut, `WeekCalendar` en bas. Modal `RuleEditor` géré au niveau page.

## T14. Lint/typecheck/tests/build

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`

## T15. Update `VETHOS_SPEC.md` + commit + tag

- Status sous-projet 3 → `✅ Livré (v0.3.0-interface)`.
- Commit avec message complet.
- `git tag -a v0.3.0-interface`.
