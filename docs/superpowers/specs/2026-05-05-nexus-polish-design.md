# Sous-projet 6 — Polish + persistance complète

**Date :** 2026-05-05
**Statut :** Spec
**Tag visé :** `v0.6.0-polish`

---

## Contexte

Les 5 sous-projets précédents ont posé l'architecture (foundation, blocking, interface, levels, onboarding). Le 6e et dernier sous-projet livre l'app à une qualité production : on connecte les apps déclarées au runtime, on systématise la persistance, et on polit l'UX (toasts, confirmations, skeletons, raccourcis, error boundary).

L'audit identifie 4 gaps majeurs :

1. **Apps déclarées non trackées** — déclarées mais jamais consommées au runtime (xpRatio inutilisé, aucun hook process → crédit).
2. **Pas de système de notifications/toasts** — uniquement des erreurs inline ad-hoc par page.
3. **Pas de confirmations destructives** — delete profile/rule/objective sans confirm.
4. **Pas d'error boundary** — un crash React = écran blanc.

À ces gaps s'ajoutent des polishs UI : skeletons de chargement, raccourcis clavier, animations sur événements clés (session démarrée/terminée, XP gagné), reconciliation auto au boot.

## Objectifs

1. **Tracker les apps déclarées au runtime** : enumeration process → minutes accumulées → crédit XP via xpRatio.
2. **Système de toasts global** : provider + hook + 3 niveaux (success/info/error).
3. **Dialog de confirmation** : composant générique réutilisé pour delete profile/rule/objective.
4. **Error boundary** : capture les erreurs React + UI de fallback élégante.
5. **Skeletons de chargement** : remplacer les "Chargement…" texte par des skeletons animés.
6. **Raccourcis clavier** : Esc (close modals), Cmd/Ctrl+S (save form), Cmd/Ctrl+K (palette future).
7. **Animations événementielles** : "+ X min" qui flotte quand on gagne du temps libre, démarrage/fin de session.
8. **Reconciliation auto au boot** : déclencher reconcileWithHistory au montage de App.tsx.

## Hors-scope

- Command palette (Cmd+K) — préparer le raccourci mais l'implémentation ouvre une placeholder.
- Tests unitaires des composants de page (gros chantier, reporté).
- Statistiques avancées (graphes de progression dans le temps).
- Auto-update Electron.

## Modèle de données

### Nouvelle clé de stockage : `declared_app_usage`

Trace l'usage des apps déclarées par jour. Permet à credit-engine de fold ces minutes dans le free time / XP.

```ts
const DeclaredAppUsageEntrySchema = z.object({
  appId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD local
  minutes: z.number().int().min(0).max(1440),
})

const DeclaredAppUsageStateSchema = z.object({
  /** Une entrée par (appId, date). Limité à 90 jours d'historique. */
  entries: z.array(DeclaredAppUsageEntrySchema).max(10000),
  /** Dernière fois que le tracker a fait un pass. ISO datetime. */
  lastTickAt: z.string().datetime().nullable(),
})
```

Ajouté à `STORAGE_KEYS` et `STORAGE_SCHEMAS`.

## Architecture runtime — Tracker apps déclarées

### Vue d'ensemble

```
[Main]                              [Renderer]
┌─────────────────────┐             ┌──────────────────────┐
│ AppUsageTracker     │             │ useDeclaredAppsStore │
│ - tick toutes 60s   │             │ (déclaratif, déjà OK)│
│ - listProcesses()   │             └──────────────────────┘
│ - match exeName     │             ┌──────────────────────┐
│ - += 1 min/match    │  IPC event  │ useAppUsageStore     │
│ - debounce write    │ ─────────►  │ (entries du jour +   │
│   30s               │             │  ratio, hydraté boot)│
└─────────────────────┘             └──────────────────────┘
         ▲                                    │
         │                                    ▼
         │                          ┌──────────────────────┐
         └──────── nexus.appUsage ── │ credit-engine v2     │
                  read/sub event    │ fold app minutes via │
                                    │ xpRatio dans XP +    │
                                    │ free time            │
                                    └──────────────────────┘
```

### Composants (main process)

**`src/main/tracking/app-usage-tracker.ts`**
- Boucle 60s : `setInterval(tick, 60_000)`
- `tick()` :
  1. Lit la liste des apps déclarées (via storage)
  2. Lit la liste des process en cours (via existing `listProcesses()`)
  3. Pour chaque match (case-insensitive sur `exeName`), incrémente l'entrée `(appId, todayLocal)` de 1 min
  4. Garde un buffer en mémoire ; flush sur disk toutes les 30s OU lors d'un changement de date
- `start()` / `stop()` exposés via IPC
- Démarre automatiquement au lancement de l'app

**`src/main/tracking/handlers.ts`** (IPC handlers)
- `app-usage:get` → renvoie l'état actuel (en-mémoire + disk merge)
- `app-usage:on-tick` (event) → broadcast aux renderers à chaque flush

**`src/preload/index.ts`** : ajouter `nexus.appUsage = { get, onTick }`

**`src/main/blocking/processes/enumerator.ts`** (existant) : déjà capable de lister les process, on le réutilise.

### Composants (renderer)

**`src/renderer/src/store/app-usage.store.ts`**
- `entries: DeclaredAppUsageEntry[]`
- `load()` : appelle `nexus.appUsage.get()`
- `subscribeToTick()` : s'abonne aux events main et met à jour le state
- Sélecteurs : `getMinutesToday(appId)`, `getMinutesThisWeek(appId)`, `totalMinutesToday()`

**Credit engine v2** (`src/renderer/src/lib/credit-engine.ts`) : ajouter une signature optionnelle pour fold les apps usage :

```ts
type AppUsageInput = {
  app: DeclaredApp
  minutesByDay: Map<string, number> // YYYY-MM-DD → minutes
  lastProcessedDate: string | null   // cursor pour idempotence
}

computeCreditsFromAppUsage(input: AppUsageInput[]): {
  objectiveDeltas: Map<string, number>
  freeTimeDelta: number
  freeTimeEntries: FreeTimeEntry[]
  newCursorByApp: Map<string, string>
}
```

Idempotent via cursor par app (`lastProcessedDate`). Stocké dans `LevelsState.lastProcessedAppUsageByApp: Record<string, string | null>`.

## Composants UI

### `<ToastProvider>` + `useToast()`

`src/renderer/src/components/ui/Toast.tsx` :
- Provider monté à la racine de l'app
- `useToast()` retourne `{ success, info, error }` qui prennent un message + optionnel description
- Stack en haut-droit, max 4 toasts, auto-dismiss 4s
- Animations Framer Motion (slide-in droite + fade-out)
- Clic pour dismiss
- Couleurs : success=emerald, info=accent, error=red-400

**Migration :** remplacer `errorToast` ad-hoc dans PlanningPage, ObjectivesPage, BlockingPage par `toast.error(...)`.

### `<ConfirmDialog>`

`src/renderer/src/components/ui/ConfirmDialog.tsx` :
- Modal centrée, icône `AlertTriangle` rouge
- Props : `open`, `title`, `description`, `confirmLabel`, `confirmVariant: 'danger' | 'default'`, `onConfirm`, `onCancel`
- Animation : scale-up + backdrop fade

**Utilisé pour** :
- Delete profile dans `ProfileEditor`
- Delete rule dans `RuleEditor`
- Delete objective dans `ObjectiveEditor`
- Delete declared app dans `AppsStep` / `SettingsPage` (futur)

### `<ErrorBoundary>` + `<ErrorFallback>`

`src/renderer/src/components/ui/ErrorBoundary.tsx` :
- Class component (React standard)
- `componentDidCatch` log l'erreur (console pour l'instant)
- Fallback UI : icône `AlertOctagon`, message + bouton "Recharger l'app"
- Monté autour de `<Routes>` dans `App.tsx`

### Skeletons

`src/renderer/src/components/ui/Skeleton.tsx` :
- Composant générique avec animation pulse
- Variants : `<SkeletonCard>`, `<SkeletonList>`, `<SkeletonRing>`
- Remplace les "Chargement…" texte dans HomePage, ObjectivesPage, BlockingPage, PlanningPage

### Raccourcis clavier

`src/renderer/src/lib/use-shortcut.ts` :
- Hook `useShortcut(combo: string, handler: () => void, opts?)`
- Combo : `"Escape"`, `"Mod+S"`, `"Mod+K"` (Mod = Cmd sur Mac, Ctrl sinon)
- Application :
  - Esc dans tous les modals (ProfileEditor, RuleEditor, ObjectiveEditor, SpendDialog, ConfirmDialog)
  - Cmd/Ctrl+S dans SettingsPage pour sauvegarder le username

### Animation "+X min" flottante

`src/renderer/src/components/levels/FloatingCredit.tsx` :
- Affiché brièvement (1.5s) quand un crédit est appliqué
- "+ 12 min" qui apparaît, monte de 30px en fade-out
- Couleur emerald

Déclenché dans `useLevelsStore.reconcileWithHistory` quand `freeTimeDelta > 0` ; émet un event que le composant écoute.

## Flux de bout en bout — User Story

1. User a déclaré "VS Code" comme app avec ratio 0.5 (objective: "Devenir senior dev")
2. User ouvre VS Code et code 30 min hors session de blocage
3. Le tracker main process accumule 30 entrées de 1 min sur la date du jour
4. Au prochain tick (ou navigation sur HomePage), le credit-engine fold ces 30 min × 0.5 ratio = 15 min XP vers "Devenir senior dev"
5. Le cursor `lastProcessedAppUsageByApp[vscode-id]` avance à la date du jour pour idempotence
6. Toast "+ 15 min vers Devenir senior dev" apparaît + l'objective ring se met à jour avec animation

## Persistance — Récap

| Clé                 | Schéma                  | Statut    |
|---------------------|-------------------------|-----------|
| settings            | SettingsSchema          | ✅ existant |
| blocking            | BlockingStateSchema     | ✅ existant |
| blocking_active     | ActiveSessionSchema     | ✅ existant |
| schedule            | ScheduleStateSchema     | ✅ existant |
| levels              | LevelsStateSchema       | 🔧 étendu (lastProcessedAppUsageByApp) |
| declared_apps       | DeclaredAppsStateSchema | ✅ existant |
| **declared_app_usage** | **DeclaredAppUsageStateSchema** | 🆕 **nouveau** |

## Reconciliation au boot

Dans `App.tsx`, après `settings.load()` :
```ts
useEffect(() => {
  if (!loaded) return
  void Promise.all([
    useScheduleStore.getState().load(),
    useBlockingStore.getState().load(),
    useLevelsStore.getState().load(),
    useDeclaredAppsStore.getState().load(),
    useAppUsageStore.getState().load(),
  ]).then(() => {
    // Une seule reconciliation au boot
    void useLevelsStore.getState().reconcileFully()
  })
}, [loaded])
```

`reconcileFully()` fait both : `reconcileWithHistory(blockingState.history, rules)` + `reconcileWithAppUsage(apps, appUsage)`.

## Visual polish

1. **Standardisation des couleurs d'erreur** : toujours `text-red-300 border-red-500/40 bg-red-500/10` pour erreurs inline ; toast utilise `text-red-200` sur `bg-red-500/15`.
2. **Animation session start** : quand `blocking_active` passe de null → existing, fade-in d'une bannière haut écran "Session démarrée" 2s.
3. **Animation session end** : quand `blocking_active` passe de existing → null avec `completedNormally === true`, toast success "+ session terminée, X min crédités".
4. **Hover states uniformes** : tous les boutons ghost ont `hover:bg-bg-card hover:text-text-primary`.
5. **Focus visible** : tous les inputs/buttons ont un ring accent au focus.

## Tests

### Pure logic
- `tracking/app-usage-tracker.test.ts` (mock `listProcesses`, vérifier accumulation + flush)
- `credit-engine.test.ts` : ajouter cas `computeCreditsFromAppUsage` (idempotence, multi-app, ratio)

### Stores
- `app-usage.store.test.ts` : load + tick subscription + sélecteurs

### Hooks
- `use-shortcut.test.tsx` : Esc, Cmd+S, lifecycle cleanup

## Performances

- Tracker tick = 60s (acceptable, pas de polling rapide)
- Flush 30s = max 1 write/30s
- Buffer en mémoire pour éviter writes inutiles
- Limite 90 jours d'historique = ~10 apps × 90 jours = 900 entrées max (taille négligeable)

## Risques

1. **Performance enumeration process** — déjà utilisé par blocking, déjà OK.
2. **Décalage horaire / changement de jour** — flush forcé au passage minuit (compare `now.toLocaleDateString()` vs lastFlush).
3. **App qui crash en plein tick** — flush atomique via `writeAtomic` existant.

## Critères d'acceptation

- [ ] App déclarée trackée : ouverte 5 min, visible dans le store renderer
- [ ] Crédit XP appliqué automatiquement après fold (ratio respecté)
- [ ] Toast success affiché à la fin d'une session de blocage
- [ ] Confirmation requise pour delete profile/rule/objective
- [ ] Esc ferme tout modal ouvert
- [ ] Skeletons remplacent les "Chargement…" texte
- [ ] ErrorBoundary catch un crash et affiche le fallback
- [ ] Reconcile auto au boot
- [ ] 7e clé `declared_app_usage` persistée et hydratée
- [ ] Build OK, typecheck OK, lint OK, tous les tests verts
