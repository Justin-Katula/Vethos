# Plan — Sous-projet 6 (Polish + persistance complète)

Spec : [2026-05-05-vethos-polish-design.md](../specs/2026-05-05-vethos-polish-design.md)
Tag visé : `v0.6.0-polish`

Ordre des tâches : on commence par la fondation (schémas + tracker), puis on monte les couches UI (toasts, confirm, error boundary), puis on intègre, puis on polit.

---

## P1 — Schémas DeclaredAppUsage + extension Levels

**Cible :** `src/shared/schemas.ts`

- Ajouter `DeclaredAppUsageEntrySchema` et `DeclaredAppUsageStateSchema`.
- Ajouter `'declared_app_usage'` à `STORAGE_KEYS`.
- Ajouter l'entrée dans `STORAGE_SCHEMAS`.
- Étendre `LevelsStateSchema` avec `lastProcessedAppUsageByApp: z.record(z.string(), z.string().nullable()).optional()` (default `{}`).

**Vérification :** typecheck OK.

---

## P2 — App usage tracker (main, TDD)

**Cibles :** `src/main/tracking/app-usage-tracker.ts` + `.test.ts`

Tests :
- Tick avec 0 app déclarée = no-op
- Tick avec 1 app déclarée + match = entrée +1 min sur date d'aujourd'hui
- Tick avec 1 app déclarée + 0 match = pas d'entrée créée
- Tick consécutifs accumulent sur la même entrée
- Flush écrit le buffer sur disk
- Flush forcé au changement de jour

Implémentation :
- Module avec `start(intervalMs?)`, `stop()`, `tick()` (exposé pour tests), `flushNow()`
- Buffer Map<string, number> keyed `appId|date` → minutes
- Mock `listProcesses` et le storage dans les tests

**Vérification :** tests verts.

---

## P3 — IPC handlers + preload pour app usage

**Cibles :**
- `src/main/tracking/handlers.ts`
- `src/main/index.ts` (start tracker au boot)
- `src/preload/index.ts` + `index.d.ts`

- Handler `app-usage:get` → renvoie `{ entries, lastTickAt }`
- Event `app-usage:tick` broadcasté à chaque flush
- Preload : `vethos.appUsage.get()`, `vethos.appUsage.onTick(cb)` returns unsubscribe

**Vérification :** typecheck OK, tracker démarre au boot du main.

---

## P4 — useAppUsageStore (renderer, TDD)

**Cibles :** `src/renderer/src/store/app-usage.store.ts` + `.test.ts`

Tests :
- `load()` hydrate depuis IPC
- Sélecteur `getMinutesToday(appId)` somme les minutes de la date courante
- Subscription au tick met à jour le state

Implémentation Zustand standard.

**Vérification :** tests verts.

---

## P5 — Credit engine v2 (fold app usage, TDD)

**Cibles :** `src/renderer/src/lib/credit-engine.ts` (extension) + tests

Tests :
- `computeCreditsFromAppUsage` avec 1 app + 60 min × ratio 0.5 = 30 min XP vers objectif lié
- Idempotent via cursor `lastProcessedDate` par app
- Si app non liée à objectif, les minutes vont au free time
- Multi-app indépendant (cursors séparés)

**Vérification :** tests verts.

---

## P6 — useLevelsStore.reconcileFully + integration

**Cibles :** `src/renderer/src/store/levels.store.ts`

- Ajouter méthode `reconcileFully()` qui appelle `reconcileWithHistory` + `reconcileWithAppUsage`
- `reconcileWithAppUsage(apps, appUsage)` utilise `computeCreditsFromAppUsage`
- Persiste `lastProcessedAppUsageByApp` dans `LevelsState`
- Émet event "+X min" si freeTimeDelta > 0 ou objectiveDeltas non-vide (pour FloatingCredit)

**Vérification :** typecheck OK, tests existants passent toujours.

---

## P7 — Toast system

**Cibles :**
- `src/renderer/src/components/ui/Toast.tsx` (provider + composant)
- `src/renderer/src/store/toast.store.ts` (Zustand pour la file)
- `src/renderer/src/lib/use-toast.ts` (hook)

- Provider monté à la racine
- Stack haut-droit, max 4
- Slide-in droite, fade-out, 4s auto-dismiss
- Variants `success | info | error`
- Migration : remplacer les `errorToast` ad-hoc dans PlanningPage, ObjectivesPage, BlockingPage

**Vérification :** typecheck OK, lint OK.

---

## P8 — ConfirmDialog

**Cibles :** `src/renderer/src/components/ui/ConfirmDialog.tsx`

- Modal centrée, backdrop, scale-up
- Props : open/title/description/confirmLabel/confirmVariant/onConfirm/onCancel
- Esc + clic backdrop = cancel
- Migration :
  - `ProfileEditor` delete
  - `RuleEditor` delete (PlanningPage)
  - `ObjectiveEditor` delete
- Sur confirmation : appelle l'action ; toast success après

**Vérification :** typecheck + lint OK.

---

## P9 — ErrorBoundary

**Cibles :**
- `src/renderer/src/components/ui/ErrorBoundary.tsx`
- Wrapping dans `App.tsx`

- Class component standard
- Fallback : icône AlertOctagon, titre "Quelque chose a planté", message d'erreur, bouton "Recharger"
- Click reload = `window.location.reload()`

**Vérification :** typecheck OK ; test manuel (throw dans une page → fallback affiché).

---

## P10 — Skeletons

**Cibles :**
- `src/renderer/src/components/ui/Skeleton.tsx`
- Mise à jour des pages : HomePage, ObjectivesPage, BlockingPage, PlanningPage

- Composant générique `<Skeleton className=... />` avec animate-pulse + bg-bg-card
- Variants pour card / list row / ring (cercle)
- Remplace les "Chargement…" centrés

**Vérification :** lint OK.

---

## P11 — useShortcut + intégrations

**Cibles :**
- `src/renderer/src/lib/use-shortcut.ts` + `.test.tsx`
- Intégrations dans : ProfileEditor, RuleEditor, ObjectiveEditor, SpendDialog, ConfirmDialog (Esc)
- SettingsPage : Cmd/Ctrl+S → save

Tests :
- Hook s'enregistre + cleanup
- Mod = Cmd sur mac, Ctrl sinon (mock platform)
- Esc déclenche le handler

**Vérification :** tests verts.

---

## P12 — FloatingCredit + animations événementielles

**Cibles :**
- `src/renderer/src/components/levels/FloatingCredit.tsx`
- Mount global + écoute event store
- Animation toast success "Session terminée — X min" quand `blocking_active` passe à null avec completedNormally
- Animation banner "Session démarrée" 2s au start

**Vérification :** lint OK, tests existants verts.

---

## P13 — Boot reconciliation + integration

**Cibles :** `src/renderer/src/App.tsx`

- Après load settings, déclencher load + reconcile sur tous les stores
- Wrap routes dans ErrorBoundary
- Mount ToastProvider à la racine
- Mount FloatingCredit global

**Vérification :** typecheck + lint + build + tests OK.

---

## P14 — Visual consistency pass

**Cibles :** scan global

- Standardiser couleurs d'erreur (`text-red-300 border-red-500/40 bg-red-500/10`)
- Hover states cohérents
- Focus visible sur tous les inputs/buttons

**Vérification :** revue visuelle ; lint OK.

---

## P15 — Vérifier + commit + tag

- `npx vitest run` (tous verts)
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- Update `VETHOS_SPEC.md` (sous-projet 6 → ✅ Livré)
- Update mémoire `vethos_resume_state.md`
- `git add -A && git commit -m "feat(polish): sub-project 6 — ..."`
- `git tag -a v0.6.0-polish -m "..."`
