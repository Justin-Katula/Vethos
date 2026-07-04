# Vethos — Sous-projet 5 : Onboarding + apps déclarées

**Date :** 2026-05-05
**Sous-projet :** 5 / 6
**Dépend de :** sous-projets 1, 2, 3, 4 ✅

## 1. Objectif

Transformer le premier lancement en **expérience guidée** : l'utilisateur arrive sur une app vide, on l'aide à poser **son emploi du temps**, **son premier objectif**, et **ses apps déclarées** en moins de 5 minutes. À la fin, la HomePage est déjà peuplée — pas une coquille vide.

Ajout d'une nouvelle entité : **DeclaredApp** = application qu'on suit hors blocage. Une session de focus sur une app déclarée (à venir : tracking en arrière-plan, ici on pose juste le modèle + UI de gestion) crédite l'objectif lié avec un ratio plus faible.

## 2. Principes

- **Onboarding skippable mais avantageux.** Bouton "Passer" toujours visible. Mais à chaque étape on **fait pour** l'utilisateur (présélections intelligentes).
- **Pas de cassure.** L'app reste fonctionnelle si l'onboarding est skippé — il devient ré-ouvrable depuis Paramètres.
- **Persistance immédiate.** Chaque étape sauvegarde au "Suivant" : si l'app crashe à mi-parcours, l'utilisateur reprend où il en était.
- **Visuel 11/10.** Pleine fenêtre, transitions Framer Motion, illustrations SVG inline, palette de couleurs préchargée.
- **Apps déclarées = entité minimale.** name + exeName + linkedObjectiveId + xpRatio (défaut 0.25). Pas de tracking ici, juste CRUD + UI.

## 3. Architecture

### 3.1 Nouveau modèle (`src/shared/schemas.ts`)

```ts
export const DeclaredAppSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(60),
  exeName: z.string().regex(EXE_NAME_REGEX),
  linkedObjectiveId: z.string().uuid().nullable(),
  /** Ratio XP par minute d'usage déclarée. 0..1, défaut 0.25. */
  xpRatio: z.number().min(0).max(1),
  createdAt: z.string().datetime(),
})

export const DeclaredAppsStateSchema = z.object({
  apps: z.array(DeclaredAppSchema),
})
```

`STORAGE_KEYS` étendu à `'declared_apps'`.

### 3.2 Drapeau onboarding (`SettingsSchema` étendu)

```ts
export const SettingsSchema = z.object({
  username: z.string().max(100).optional(),
  savedAt: z.string().datetime().optional(),
  /** True une fois l'onboarding terminé OU explicitement skippé. */
  onboardingCompleted: z.boolean().optional(),
})
```

### 3.3 Store (`useDeclaredAppsStore`)

```ts
type DeclaredAppsStore = {
  loaded: boolean
  apps: DeclaredApp[]
  load: () => Promise<void>
  saveApp: (draft: SaveDraft) => Promise<DeclaredApp>
  deleteApp: (id: string) => Promise<void>
}
```

Persisté sous `vethos_declared_apps.json`.

### 3.4 Flux onboarding

`useOnboardingStore` (Zustand, mémoire seulement) :

```ts
type Step = 'welcome' | 'username' | 'schedule' | 'objective' | 'apps' | 'done'
type OnboardingStore = {
  step: Step
  next: () => void
  prev: () => void
  jumpTo: (s: Step) => void
  skip: () => Promise<void>   // marque onboardingCompleted=true et ferme
  finish: () => Promise<void> // idem + flag de succès
}
```

L'onboarding est rendu par un overlay plein écran `<OnboardingOverlay />` au-dessus du Sidebar+Routes. Visible si `settings.onboardingCompleted !== true`.

### 3.5 Présélections intelligentes (étape Schedule)

- **3 templates proposés** : "Étudiant", "Pro hybride", "Vie équilibrée".
- Chaque template = un set de `TimeRule` (3-4 règles) + un set d'`ScheduleEntry` (typiquement 8-12 blocs sur la semaine).
- Sélectionner un template = appliquer le set en remplaçant le contenu existant si vide.
- Personnalisation immédiate possible via la mini-grid hebdo intégrée à l'étape.

Templates dans `src/renderer/src/lib/onboarding-templates.ts` (constantes purement déterministes côté renderer, mais on remplace les `id` par `crypto.randomUUID()` à l'application).

### 3.6 Création du premier objectif

- Présélection de couleur dérivée de la première règle.
- Multi-select `linkedRuleIds` pré-coché sur toutes les règles du template choisi.
- Champ name + description optionnels.
- "Skip" autorisé : on peut finir sans objectif.

### 3.7 Apps déclarées (étape finale)

- Suggestion de 6 apps fréquentes : `Code.exe` (VS Code), `chrome.exe`, `firefox.exe`, `notion.exe`, `discord.exe`, `figma.exe`.
- Pour chaque suggestion : checkbox + dropdown objectif lié + slider ratio (0–1, défaut 0.25).
- Possibilité d'ajouter une app custom (name + exeName).

### 3.8 Réouvrir l'onboarding

- `SettingsPage` : bouton "Relancer l'onboarding" qui `set onboardingCompleted=false` et redirige.
- Utile pour les tests + utilisateurs qui veulent recommencer.

## 4. Composants UI

### 4.1 `OnboardingOverlay`

Plein écran, fond `bg-bg-base/95 backdrop-blur-md`. Header : barre de progression des 5 étapes (welcome inclus), bouton "Passer" à droite. Footer : "Précédent" / "Suivant" (ou "Terminer" à la dernière étape).

### 4.2 `WelcomeStep`

- Logo Vethos animé (gradient ring qui pulse).
- Titre + sous-titre marketing.
- Bouton "Commencer".

### 4.3 `UsernameStep`

- Input prénom (optionnel).
- Anim sur change → "Bienvenue, {prénom}" en sous-titre.

### 4.4 `ScheduleStep`

- 3 cartes templates (Étudiant / Pro / Équilibré) en haut.
- Mini-aperçu hebdo (`WeekCalendar` en mode read-only) en bas qui se peuple au choix.
- Bouton "Personnaliser maintenant" → ferme l'overlay et ouvre PlanningPage (avec flag pour reprendre l'onboarding au retour). Hors scope strict de cette première version : on se contente du template-only, l'utilisateur ajustera après.

### 4.5 `ObjectiveStep`

- Carte avec champ Nom + textarea description + palette couleur + multi-select règles (dérivé du template).
- "Skip cette étape".

### 4.6 `AppsStep`

- Liste de checkboxes pour les 6 suggestions.
- Pour chaque sélectionnée : sélecteur objectif lié + slider ratio.
- Section "Ajouter une app custom".

### 4.7 `DonePage` (interne, transitoire 1.5s)

- Confettis SVG simples + "Tout est prêt !".
- Auto-fermeture, push vers `/` (HomePage).

### 4.8 `SettingsPage` étendue

- Champ Username (existant) + Bouton "Relancer l'onboarding".

## 5. Tests Vitest

- `src/renderer/src/lib/onboarding-templates.test.ts` :
  - Chaque template a ≥ 3 rules, ≥ 6 entries, pas de chevauchement
  - `applyTemplate` remplace les ids et préserve le mapping rule↔entry
- `src/renderer/src/store/declared-apps.store.test.ts` (avec mock `vethos.storage`) :
  - load/saveApp/deleteApp respectent le schéma
  - update préserve `createdAt`

## 6. Démo bout-en-bout (acceptance)

1. Démarrer Vethos pour la première fois (suppr `vethos_settings.json` et `vethos_declared_apps.json`).
2. Overlay welcome plein écran ✅.
3. Welcome → Continuer.
4. Username "Alex" → progress bar +20%.
5. Schedule : choisir "Pro hybride" → 3 règles + 9 blocs préchargés.
6. Objective : nom "Devenir senior dev", couleur héritée de la règle "Travail deep" → linkedRuleIds pré-coché.
7. Apps : cocher VS Code (lié à "Devenir senior dev", ratio 0.5), Notion (ratio 0.25).
8. "Terminer" → confettis 1.5s → HomePage avec cercle peuplé + free time = 0 + objectif visible avec niveau 1.
9. Reload app → l'overlay ne réapparaît pas.
10. Settings → "Relancer" → l'overlay réapparaît.

## 7. Critères d'acceptation

1. ✅ typecheck / lint / test / build verts
2. ✅ ≥ 6 tests sur templates + store apps
3. ✅ Persistance complète après chaque étape (résilience au crash)
4. ✅ Skip global possible à tout moment
5. ✅ Réouverture depuis Settings
6. ✅ HomePage peuplée immédiatement après onboarding
7. ✅ VETHOS_SPEC.md mis à jour, tag `v0.5.0-onboarding`

## 8. Hors scope

- Tracking actif des apps déclarées (process polling) → sous-projet 6
- Crédits XP réels depuis usage d'apps déclarées → sous-projet 6
- Onboarding multi-langue → polish
- Détection automatique des apps installées → polish
