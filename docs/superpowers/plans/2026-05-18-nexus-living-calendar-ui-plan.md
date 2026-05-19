# Calendrier vivant — Plan d'implémentation (Partie B : intégration UI)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Câbler le moteur d'auto-placement (Partie A, déjà mergée) dans l'UI : calendrier deux couches en lecture seule, fenêtre horaire réveil→coucher, vue Mois en carte de charge, Accueil unifié, et réglage du niveau de temps libre.

**Architecture:** Trois petits utilitaires purs (viewport horaire, couleur de charge, hook `usePlacement` qui dérive le plan par `useMemo`) + intégration dans 4 pages (`SettingsPage`, `WeekCalendar`, `PlanningPage` avec sa `MonthView`, `HomePage`). Le placement reste un état dérivé — aucune persistance. Convention du dépôt : la logique pure est TDD ; les composants React ne sont pas unit-testés (manuel + portes).

**Tech Stack:** TypeScript, React 18, Zustand, Tailwind, Framer Motion, Vitest (pour les helpers purs).

**Référence spec :** `docs/superpowers/specs/2026-05-18-nexus-auto-placement-engine-design.md`. Partie A : `docs/superpowers/plans/2026-05-18-nexus-placement-engine-plan.md`.

---

## Fichiers

**Créer :**
- `src/renderer/src/lib/calendar-viewport.ts` — fenêtre horaire visible + helpers de layout (pure).
- `src/renderer/src/lib/calendar-viewport.test.ts` — tests Vitest.
- `src/renderer/src/lib/load-heatmap.ts` — couleur relative de la charge (pure).
- `src/renderer/src/lib/load-heatmap.test.ts` — tests Vitest.
- `src/renderer/src/lib/use-placement.ts` — hook React qui dérive le plan.

**Modifier :**
- `src/renderer/src/pages/SettingsPage.tsx` — contrôle du niveau de temps libre.
- `src/renderer/src/components/interface/WeekCalendar.tsx` — fenêtre horaire + blocs de travail en lecture seule.
- `src/renderer/src/pages/PlanningPage.tsx` — câblage de `usePlacement` + vue Mois en carte de charge.
- `src/renderer/src/pages/HomePage.tsx` — passage au moteur unifié.
- `src/renderer/src/lib/free-time-calculator.ts` — retrait des fonctions de distribution remplacées.

Tous les `git add` ciblent les fichiers explicites. Aucun `git add -A`.

---

## Task 1 : Helpers de fenêtre horaire (`calendar-viewport.ts`)

Pure logique : la fenêtre visible du calendrier (réveil → coucher) + 3 helpers de layout que `WeekCalendar` utilisera. TDD.

**Files:**
- Create: `src/renderer/src/lib/calendar-viewport.ts`
- Create: `src/renderer/src/lib/calendar-viewport.test.ts`

- [ ] **Step 1 : Écrire les tests qui échouent.** Créer `src/renderer/src/lib/calendar-viewport.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import {
  viewportFromSettings,
  viewportHeightPx,
  minuteToYPx,
  yPxToMinute,
  visibleHoursOfViewport,
} from './calendar-viewport'

describe('viewportFromSettings', () => {
  it('renvoie [réveil, coucher] pour un sommeil typique de nuit', () => {
    // sleepStart = coucher 23:30, sleepEnd = réveil 07:00
    expect(viewportFromSettings('23:30', '07:00')).toEqual({ startMinute: 420, endMinute: 1410 })
  })

  it('renvoie 00–24 si une heure est manquante', () => {
    expect(viewportFromSettings(undefined, '07:00')).toEqual({ startMinute: 0, endMinute: 1440 })
    expect(viewportFromSettings('23:00', undefined)).toEqual({ startMinute: 0, endMinute: 1440 })
  })

  it('renvoie 00–24 si une heure est invalide', () => {
    expect(viewportFromSettings('25:99', '07:00')).toEqual({ startMinute: 0, endMinute: 1440 })
  })

  it('renvoie 00–24 si le sommeil n est pas contigu sur la nuit (wake >= bed)', () => {
    // cas anormal : réveil à 22h, coucher à 7h → wake 1320 >= bed 420 → repli
    expect(viewportFromSettings('07:00', '22:00')).toEqual({ startMinute: 0, endMinute: 1440 })
  })
})

describe('viewportHeightPx', () => {
  it('hauteur = nombre d heures visibles × hourHeightPx', () => {
    expect(viewportHeightPx({ startMinute: 420, endMinute: 1410 }, 40)).toBe(660) // 16.5h × 40
  })
})

describe('minuteToYPx / yPxToMinute', () => {
  const vp = { startMinute: 420, endMinute: 1410 } // 7h → 23h30

  it('mappe le réveil au pixel 0', () => {
    expect(minuteToYPx(vp, 420, 40)).toBe(0)
  })

  it('mappe le coucher à la hauteur totale', () => {
    expect(minuteToYPx(vp, 1410, 40)).toBe(660)
  })

  it('mappe le milieu au pixel central', () => {
    expect(minuteToYPx(vp, 915, 40)).toBe(330)
  })

  it('yPxToMinute est l inverse', () => {
    expect(yPxToMinute(vp, 0, 40)).toBe(420)
    expect(yPxToMinute(vp, 660, 40)).toBe(1410)
  })
})

describe('visibleHoursOfViewport', () => {
  it('liste les heures rondes visibles (réveil à coucher inclus)', () => {
    expect(visibleHoursOfViewport({ startMinute: 420, endMinute: 1410 })).toEqual([
      7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
    ])
  })

  it('inclut l heure du coucher si elle est ronde', () => {
    expect(visibleHoursOfViewport({ startMinute: 480, endMinute: 1320 })).toEqual([
      8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
    ])
  })
})
```

- [ ] **Step 2 : Lancer le test pour vérifier l'échec.**

Run: `npx vitest run src/renderer/src/lib/calendar-viewport.test.ts`
Expected: FAIL — `Failed to resolve import "./calendar-viewport"`.

- [ ] **Step 3 : Implémenter le module.** Créer `src/renderer/src/lib/calendar-viewport.ts` :

```ts
/**
 * calendar-viewport.ts
 *
 * Fenêtre horaire visible du calendrier (réveil → coucher) et helpers de layout
 * pour la convertir en pixels. Pur, sans React. Réf. spec §8.2.
 */

export type CalendarViewport = {
  /** Minute de réveil (premier instant visible). */
  startMinute: number
  /** Minute de coucher (dernier instant visible). */
  endMinute: number
}

const FULL_DAY: CalendarViewport = { startMinute: 0, endMinute: 1440 }

function parseTimeString(value: string | undefined): number | null {
  if (!value) return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null
  if (h < 0 || h > 23 || min < 0 || min > 59) return null
  return h * 60 + min
}

/**
 * Dérive la fenêtre visible du calendrier à partir des réglages de sommeil.
 * `sleepStart` = heure de coucher ("HH:MM"). `sleepEnd` = heure de réveil ("HH:MM").
 * Repli journée complète (00–24) si la config est manquante, invalide, ou si le
 * sommeil n'est pas contigu sur la nuit (réveil ≥ coucher).
 */
export function viewportFromSettings(
  sleepStart: string | undefined,
  sleepEnd: string | undefined,
): CalendarViewport {
  const bedMinute = parseTimeString(sleepStart)
  const wakeMinute = parseTimeString(sleepEnd)
  if (bedMinute === null || wakeMinute === null) return FULL_DAY
  if (wakeMinute >= bedMinute) return FULL_DAY
  return { startMinute: wakeMinute, endMinute: bedMinute }
}

/** Hauteur totale de la fenêtre en pixels. */
export function viewportHeightPx(viewport: CalendarViewport, hourHeightPx: number): number {
  const minutes = viewport.endMinute - viewport.startMinute
  return (minutes / 60) * hourHeightPx
}

/** Convertit une minute du jour (0–1439) en y (px) dans la fenêtre. */
export function minuteToYPx(viewport: CalendarViewport, minute: number, hourHeightPx: number): number {
  return ((minute - viewport.startMinute) / 60) * hourHeightPx
}

/** Convertit un y (px) dans la fenêtre en minute du jour. */
export function yPxToMinute(viewport: CalendarViewport, y: number, hourHeightPx: number): number {
  return viewport.startMinute + (y / hourHeightPx) * 60
}

/** Liste des heures rondes visibles (utile pour l'axe horaire). */
export function visibleHoursOfViewport(viewport: CalendarViewport): number[] {
  const startHour = Math.ceil(viewport.startMinute / 60)
  const endHour = Math.floor(viewport.endMinute / 60)
  const out: number[] = []
  for (let h = startHour; h <= endHour; h++) out.push(h)
  return out
}
```

- [ ] **Step 4 : Lancer le test pour vérifier le succès.**

Run: `npx vitest run src/renderer/src/lib/calendar-viewport.test.ts`
Expected: PASS — 11 tests.

- [ ] **Step 5 : Commit.**

```bash
git add src/renderer/src/lib/calendar-viewport.ts src/renderer/src/lib/calendar-viewport.test.ts
git commit -m "feat(calendar): fenêtre horaire visible et helpers de layout"
```

---

## Task 2 : Couleur relative de la carte de charge (`load-heatmap.ts`)

Pure logique : convertir le temps libre restant d'un jour en couleur sur l'échelle vert→rouge (spec §8.3). TDD.

**Files:**
- Create: `src/renderer/src/lib/load-heatmap.ts`
- Create: `src/renderer/src/lib/load-heatmap.test.ts`

- [ ] **Step 1 : Écrire les tests qui échouent.** Créer `src/renderer/src/lib/load-heatmap.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { loadColor } from './load-heatmap'

describe('loadColor', () => {
  it('jour le plus libre (max) → vert', () => {
    expect(loadColor(600, 100, 600)).toBe('#22c55e')
  })

  it('jour le plus chargé (min) → rouge', () => {
    expect(loadColor(100, 100, 600)).toBe('#ef4444')
  })

  it('milieu de l échelle → jaune', () => {
    expect(loadColor(350, 100, 600)).toBe('#eab308')
  })

  it('tous les jours identiques (min === max) → vert', () => {
    expect(loadColor(300, 300, 300)).toBe('#22c55e')
  })

  it('clampe sous le min → rouge', () => {
    expect(loadColor(50, 100, 600)).toBe('#ef4444')
  })

  it('clampe au-dessus du max → vert', () => {
    expect(loadColor(700, 100, 600)).toBe('#22c55e')
  })
})
```

- [ ] **Step 2 : Lancer le test pour vérifier l'échec.**

Run: `npx vitest run src/renderer/src/lib/load-heatmap.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3 : Implémenter le module.** Créer `src/renderer/src/lib/load-heatmap.ts` :

```ts
/**
 * load-heatmap.ts
 *
 * Couleur d'un jour dans la carte de charge (vue Mois). Échelle relative sur
 * les jours rendus : le jour avec le plus de temps libre restant = vert, le
 * moins = rouge ; dégradé vert → lime → jaune → orange → rouge. Réf. spec §8.3.
 */

const GREEN = '#22c55e' // emerald-500
const RED = '#ef4444' // red-500

const GRADIENT: Array<{ stop: number; color: string }> = [
  { stop: 0.0, color: GREEN }, // peu chargé
  { stop: 0.25, color: '#84cc16' }, // lime-500
  { stop: 0.5, color: '#eab308' }, // yellow-500
  { stop: 0.75, color: '#f97316' }, // orange-500
  { stop: 1.0, color: RED }, // très chargé
]

/**
 * Couleur d'un jour selon son temps libre restant, relatif au min/max des
 * jours rendus. `freeMinutes` = ce jour ; `minFree`/`maxFree` = bornes des
 * autres jours rendus. Plus de temps libre → plus vert ; moins → plus rouge.
 */
export function loadColor(freeMinutes: number, minFree: number, maxFree: number): string {
  if (maxFree <= minFree) return GREEN
  const ratio = (freeMinutes - minFree) / (maxFree - minFree)
  const t = Math.max(0, Math.min(1, 1 - ratio)) // 0 = max free (vert), 1 = min free (rouge)
  return interpolateGradient(t)
}

function interpolateGradient(t: number): string {
  for (let i = 0; i < GRADIENT.length - 1; i++) {
    const a = GRADIENT[i]!
    const b = GRADIENT[i + 1]!
    if (t >= a.stop && t <= b.stop) {
      const localT = b.stop === a.stop ? 0 : (t - a.stop) / (b.stop - a.stop)
      return interpolateHex(a.color, b.color, localT)
    }
  }
  return GRADIENT[GRADIENT.length - 1]!.color
}

function interpolateHex(c1: string, c2: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(c1)
  const [r2, g2, b2] = hexToRgb(c2)
  const r = Math.round(r1 + (r2 - r1) * t)
  const g = Math.round(g1 + (g2 - g1) * t)
  const b = Math.round(b1 + (b2 - b1) * t)
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

function toHex(n: number): string {
  return n.toString(16).padStart(2, '0')
}
```

- [ ] **Step 4 : Lancer le test pour vérifier le succès.**

Run: `npx vitest run src/renderer/src/lib/load-heatmap.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5 : Commit.**

```bash
git add src/renderer/src/lib/load-heatmap.ts src/renderer/src/lib/load-heatmap.test.ts
git commit -m "feat(calendar): couleur relative de la carte de charge"
```

---

## Task 3 : Hook `usePlacement`

Wrapper React `useMemo` qui dérive le plan à partir des stores. Pas de test unitaire (le moteur sous-jacent est déjà testé ; les hooks React ne sont pas testés dans ce dépôt).

**Files:**
- Create: `src/renderer/src/lib/use-placement.ts`

- [ ] **Step 1 : Créer le hook.**

Créer `src/renderer/src/lib/use-placement.ts` :

```ts
import { useMemo } from 'react'
import { useScheduleStore } from '@/store/schedule.store'
import { useLevelsStore } from '@/store/levels.store'
import { useTasksStore } from '@/store/tasks.store'
import { useSettingsStore } from '@/store/settings.store'
import {
  computePlacement,
  enumerateDates,
  summarizeDailyLoad,
  type DailyLoad,
  type PlacedBlock,
} from './placement-engine'

export function localDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Dérive le plan (`PlacedBlock[]`) et la charge quotidienne (`DailyLoad[]`)
 * sur la plage [today, rangeEndStr], à partir des stores Nexus. Recalculé via
 * `useMemo` dès qu'une entrée change (tâches, objectifs, planning, niveau de
 * temps libre, date du jour, plage demandée). Réf. spec §9, §10.
 *
 * Le composant appelant passe `now` (typiquement un `useState(new Date())` avec
 * `setInterval` 60s) pour faire glisser la fenêtre au passage d'un jour.
 */
export function usePlacement(
  now: Date,
  rangeEndStr: string,
): {
  blocks: PlacedBlock[]
  dailyLoad: DailyLoad[]
  todayStr: string
  dates: string[]
} {
  const tasks = useTasksStore((s) => s.tasks)
  const objectives = useLevelsStore((s) => s.objectives)
  const rules = useScheduleStore((s) => s.rules)
  const entries = useScheduleStore((s) => s.entries)
  const freeTimeLevel = useSettingsStore((s) => s.freeTimeLevel)
  const todayStr = localDateKey(now)

  return useMemo(() => {
    const blocks = computePlacement({
      tasks,
      objectives,
      rules,
      entries,
      freeTimeLevel,
      todayStr,
      rangeEndStr,
    })
    const dates = enumerateDates(todayStr, rangeEndStr)
    const dailyLoad = summarizeDailyLoad(blocks, dates, entries, rules)
    return { blocks, dailyLoad, todayStr, dates }
  }, [tasks, objectives, rules, entries, freeTimeLevel, todayStr, rangeEndStr])
}
```

- [ ] **Step 2 : Vérifier les portes.**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: typecheck node+web PASS, lint PASS, tests verts (193 + 17 nouveaux helpers = 210).

- [ ] **Step 3 : Commit.**

```bash
git add src/renderer/src/lib/use-placement.ts
git commit -m "feat(calendar): hook usePlacement"
```

---

## Task 4 : Réglage du niveau de temps libre (SettingsPage)

Ajoute une section « Niveau de temps libre » dans `SettingsPage` avec 4 boutons (4, 5, 6, 7), verrouillage tant que le cooldown de 2 semaines n'est pas écoulé, et compte à rebours.

**Files:**
- Modify: `src/renderer/src/pages/SettingsPage.tsx`

- [ ] **Step 1 : Étendre les imports.** Dans `SettingsPage.tsx`, étendre l'import `lucide-react` (ajouter `Sparkles`) et ajouter deux imports en bas du bloc d'imports :

```ts
import {
  Save,
  RefreshCw,
  Moon,
  Clock,
  FileText,
  History,
  Sparkles,
  type LucideProps,
} from 'lucide-react'
```

Et juste après l'import de `nexus` :

```ts
import {
  canChangeFreeTimeLevel,
  daysUntilFreeTimeLevelChange,
} from '@/lib/placement-engine'
```

- [ ] **Step 2 : Exposer les nouveaux champs du store.** Dans le `useSettingsStore()` de `SettingsPage`, ajouter `freeTimeLevel` et `freeTimeLevelChangedAt` à la déstructuration :

```ts
  const {
    username,
    savedAt,
    sleepStart,
    sleepEnd,
    sessionRulesEnabled,
    browserHistoryScanEnabled,
    freeTimeLevel,
    freeTimeLevelChangedAt,
    loaded,
    load,
    save,
    updateSettings,
  } = useSettingsStore()
```

- [ ] **Step 3 : Calculer l'état du cooldown.** Juste après la ligne `const dirty = draft !== username`, ajouter :

```ts
  const now = new Date()
  const canChangeLevel = canChangeFreeTimeLevel(freeTimeLevelChangedAt ?? undefined, now)
  const daysLeft = daysUntilFreeTimeLevelChange(freeTimeLevelChangedAt ?? undefined, now)
```

- [ ] **Step 4 : Insérer la section UI.** Juste après la section `{/* --- Heures de sommeil --- */}` (la balise `</section>` qui la ferme) et avant `{/* --- Toggles --- */}`, insérer :

```tsx
        {/* --- Niveau de temps libre --- */}
        <section className="max-w-lg space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted">
            Niveau de temps libre
          </h2>
          <div className="rounded-lg border border-border-subtle bg-bg-card px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <Sparkles size={18} />
              </div>
              <p className="text-xs text-text-muted">
                Détermine la part de temps qui te reste vraiment libre, en concurrence avec tes tâches et objectifs. Plus haut = plus de repos. Modifiable une fois toutes les 2 semaines.
              </p>
            </div>
            <div className="mt-4 flex items-center gap-2">
              {([4, 5, 6, 7] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  disabled={!canChangeLevel}
                  onClick={() =>
                    void updateSettings({
                      freeTimeLevel: lvl,
                      freeTimeLevelChangedAt: new Date().toISOString(),
                    })
                  }
                  className={cn(
                    'h-10 w-10 rounded-lg border text-sm font-semibold transition-colors',
                    freeTimeLevel === lvl
                      ? 'border-accent bg-accent text-white'
                      : 'border-border-subtle bg-bg-base text-text-secondary hover:border-border-strong',
                    !canChangeLevel && 'cursor-not-allowed opacity-50',
                  )}
                >
                  {lvl}
                </button>
              ))}
            </div>
            {!canChangeLevel && (
              <p className="mt-3 text-[10px] text-text-muted">
                Verrouillé. Modifiable dans {daysLeft} jour{daysLeft > 1 ? 's' : ''}.
              </p>
            )}
          </div>
        </section>
```

- [ ] **Step 5 : Vérifier les portes.**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: PASS — 210 tests verts.

- [ ] **Step 6 : Commit.**

```bash
git add src/renderer/src/pages/SettingsPage.tsx
git commit -m "feat(settings): contrôle du niveau de temps libre avec cooldown"
```

---

## Task 5 : `WeekCalendar` — fenêtre horaire réveil→coucher

Remplace le layout 0–1440 du `WeekCalendar` par la fenêtre `viewport` (props). Les entrées existantes (catégories) restent éditables ; seul leur positionnement change. Réf. spec §8.2.

**Files:**
- Modify: `src/renderer/src/components/interface/WeekCalendar.tsx`

- [ ] **Step 1 : Étendre les imports.** En haut de `WeekCalendar.tsx`, après l'import `cn`, ajouter :

```ts
import {
  minuteToYPx,
  yPxToMinute,
  viewportHeightPx,
  visibleHoursOfViewport,
  type CalendarViewport,
} from '@/lib/calendar-viewport'
```

- [ ] **Step 2 : Ajouter `viewport` au type `Props`.** Étendre le type `Props` en ajoutant le champ `viewport` :

```ts
type Props = {
  rules: TimeRule[]
  entries: ScheduleEntry[]
  viewport: CalendarViewport
  onCreateEntry: (draft: {
    ruleId: string
    dayOfWeek: number
    startMinute: number
    endMinute: number
  }) => Promise<void>
  onUpdateEntry: (
    id: string,
    patch: { startMinute: number; endMinute: number },
  ) => Promise<void>
  onChangeRule: (id: string, ruleId: string) => Promise<void>
  onDeleteEntry: (id: string) => Promise<void>
  onCreateRule: () => void
}
```

- [ ] **Step 3 : Remplacer les constantes de hauteur.** Supprimer la ligne `const TOTAL_HEIGHT = 24 * HOUR_HEIGHT` et utiliser la fenêtre. Juste après `const GUTTER_WIDTH = 48`, ajouter rien — remplacer plutôt à l'intérieur du composant. Dans la fonction `WeekCalendar`, juste après `const [activeMenu, setActiveMenu] = useState<string | null>(null)`, ajouter :

```ts
  const totalHeight = viewportHeightPx(viewport, HOUR_HEIGHT)
  const visibleHours = useMemo(() => visibleHoursOfViewport(viewport), [viewport])
```

Et au-dessus, remplacer la déclaration de paramètres pour inclure `viewport` :

```ts
export function WeekCalendar({
  rules,
  entries,
  viewport,
  onCreateEntry,
  onUpdateEntry,
  onChangeRule,
  onDeleteEntry,
  onCreateRule,
}: Props) {
```

- [ ] **Step 4 : Remplacer la conversion `minuteFromY`.** Remplacer :

```ts
  const minuteFromY = (clientY: number): number => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return 0
    const y = clientY - rect.top - HEADER_HEIGHT
    const m = Math.round((y / TOTAL_HEIGHT) * 1440)
    return Math.max(0, Math.min(1440, m))
  }
```

par :

```ts
  const minuteFromY = (clientY: number): number => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return viewport.startMinute
    const y = clientY - rect.top - HEADER_HEIGHT
    const m = Math.round(yPxToMinute(viewport, y, HOUR_HEIGHT))
    return Math.max(viewport.startMinute, Math.min(viewport.endMinute, m))
  }
```

- [ ] **Step 5 : Remplacer le positionnement des entrées.** Dans `renderEntryBlock`, remplacer :

```ts
    const liveTop = HEADER_HEIGHT + (eff.startMinute / 1440) * TOTAL_HEIGHT
    const liveHeight = ((eff.endMinute - eff.startMinute) / 1440) * TOTAL_HEIGHT
```

par :

```ts
    // Clip aux bornes de la fenêtre visible.
    const clippedStart = Math.max(eff.startMinute, viewport.startMinute)
    const clippedEnd = Math.min(eff.endMinute, viewport.endMinute)
    if (clippedEnd <= clippedStart) return null
    const liveTop = HEADER_HEIGHT + minuteToYPx(viewport, clippedStart, HOUR_HEIGHT)
    const liveHeight = minuteToYPx(viewport, clippedEnd, HOUR_HEIGHT) - minuteToYPx(viewport, clippedStart, HOUR_HEIGHT)
```

- [ ] **Step 6 : Remplacer le positionnement du ghost.** Dans `renderGhost`, remplacer :

```ts
    const top = HEADER_HEIGHT + (drag.startMinute / 1440) * TOTAL_HEIGHT
    const height = ((drag.endMinute - drag.startMinute) / 1440) * TOTAL_HEIGHT
```

par :

```ts
    const top = HEADER_HEIGHT + minuteToYPx(viewport, drag.startMinute, HOUR_HEIGHT)
    const height =
      minuteToYPx(viewport, drag.endMinute, HOUR_HEIGHT) -
      minuteToYPx(viewport, drag.startMinute, HOUR_HEIGHT)
```

- [ ] **Step 7 : Remplacer l'axe des heures (gutter).** Remplacer la div de la gutter (`{Array.from({ length: 24 }, (_, h) => (...)`) par une boucle sur `visibleHours` :

```tsx
      {/* Gutter heures */}
      <div
        className="absolute left-0 top-0 z-0 border-r border-border-subtle"
        style={{ width: GUTTER_WIDTH, top: HEADER_HEIGHT, height: totalHeight }}
      >
        {visibleHours.map((h) => (
          <div
            key={h}
            className="absolute left-0 right-1 text-right text-[10px] font-mono text-text-muted"
            style={{ top: minuteToYPx(viewport, h * 60, HOUR_HEIGHT) - 6 }}
          >
            {`${String(h).padStart(2, '0')}h`}
          </div>
        ))}
      </div>
```

- [ ] **Step 8 : Remplacer les lignes d'arrière-plan dans les colonnes.** À l'intérieur de chaque colonne (`{DAYS_FR.map((_, dayOfWeek) => (...)` ), remplacer les deux `Array.from({ length: 24 }, ...)` par des boucles basées sur `visibleHours` :

```tsx
            {/* lignes horaires */}
            {visibleHours.map((h) => (
              <div
                key={`hr-${h}`}
                className="absolute inset-x-0 border-t border-border-subtle/40"
                style={{ top: minuteToYPx(viewport, h * 60, HOUR_HEIGHT) }}
              />
            ))}
            {/* lignes demi-heure */}
            {visibleHours.map((h) => (
              <div
                key={`half-${h}`}
                className="absolute inset-x-0 border-t border-border-subtle/15"
                style={{ top: minuteToYPx(viewport, h * 60 + 30, HOUR_HEIGHT) }}
              />
            ))}
```

- [ ] **Step 9 : Remplacer les références à `TOTAL_HEIGHT`.** Il reste 3 occurrences à corriger :

(a) Le conteneur racine `style={{ height: TOTAL_HEIGHT + HEADER_HEIGHT }}` → `style={{ height: totalHeight + HEADER_HEIGHT }}`.

(b) La div des colonnes `style={{ left: GUTTER_WIDTH, top: HEADER_HEIGHT, height: TOTAL_HEIGHT }}` → `style={{ left: GUTTER_WIDTH, top: HEADER_HEIGHT, height: totalHeight }}`.

(c) Le wrapper du ghost `<div style={{ position: 'relative', height: TOTAL_HEIGHT + HEADER_HEIGHT }}>` → `<div style={{ position: 'relative', height: totalHeight + HEADER_HEIGHT }}>`.

- [ ] **Step 10 : Vérifier les portes.**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: typecheck node+web PASS, lint PASS, 210 tests verts. (Le code de `PlanningPage` qui appelle `WeekCalendar` ne lui passe pas encore `viewport` — le typecheck va échouer si on s'arrête là. Ce câblage est fait dans la Task 7 ; pour cette task, on commit après avoir vérifié que le composant compile en isolation via un câblage temporaire.)

**Câblage temporaire pour faire passer la porte** : ouvrir `PlanningPage.tsx` et, juste avant le rendu `<WeekCalendar`, ajouter `viewport={{ startMinute: 0, endMinute: 1440 }}` :

```tsx
            <WeekCalendar
              rules={rules}
              entries={entries}
              viewport={{ startMinute: 0, endMinute: 1440 }}
              onCreateEntry={handleCreateEntry}
              onUpdateEntry={handleUpdateEntry}
              onChangeRule={handleChangeRule}
              onDeleteEntry={deleteEntry}
              onCreateRule={() => openEditor(null)}
            />
```

Re-run `npm run typecheck && npm run lint && npm run test` → PASS.

- [ ] **Step 11 : Commit.**

```bash
git add src/renderer/src/components/interface/WeekCalendar.tsx src/renderer/src/pages/PlanningPage.tsx
git commit -m "feat(calendar): fenêtre horaire réveil→coucher dans WeekCalendar"
```

---

## Task 6 : `WeekCalendar` — blocs de travail en lecture seule

Ajoute le rendu des blocs auto-placés en lecture seule, par-dessus la grille. Marquage « terminé » pour les blocs d'aujourd'hui dont l'heure est passée. Réf. spec §6, §7, §8.1.

**Files:**
- Modify: `src/renderer/src/components/interface/WeekCalendar.tsx`

- [ ] **Step 1 : Étendre les imports.** Ajouter en haut, après les imports existants :

```ts
import type { PlacedBlock, Task, Objective } from '@shared/schemas'
```

(En réalité `PlacedBlock` n'est pas dans `@shared/schemas` mais dans `placement-engine.ts`. Corrigeons :)

Remplacer l'ajout par :

```ts
import type { PlacedBlock } from '@/lib/placement-engine'
import type { Task, Objective } from '@shared/schemas'
import { localDateKey } from '@/lib/use-placement'
```

- [ ] **Step 2 : Étendre `Props`.** Ajouter trois nouveaux champs au type `Props` (après `viewport`) :

```ts
  /** Dates ISO YYYY-MM-DD des 7 colonnes (Lundi à Dimanche). */
  weekDates: string[]
  /** Blocs auto-placés à afficher en lecture seule. */
  workBlocks: PlacedBlock[]
  /** Date courante (pour marquer les blocs d'aujourd'hui dont l'heure est passée). */
  now: Date
  /** Index pour résoudre l'affichage d'un bloc (nom + couleur + tâche liée). */
  taskById: Map<string, Task>
  objectiveById: Map<string, Objective>
```

Et destructurer dans la signature de la fonction :

```ts
export function WeekCalendar({
  rules,
  entries,
  viewport,
  weekDates,
  workBlocks,
  now,
  taskById,
  objectiveById,
  onCreateEntry,
  onUpdateEntry,
  onChangeRule,
  onDeleteEntry,
  onCreateRule,
}: Props) {
```

- [ ] **Step 3 : Ajouter la fonction de rendu d'un bloc de travail.** Juste après la fonction `renderGhost`, ajouter :

```tsx
  // Couleurs de neutre pour les tâches autonomes (sans objectif).
  const STANDALONE_TASK_COLOR = '#64748b' // slate-500

  const renderWorkBlock = (block: PlacedBlock, dayOfWeek: number) => {
    const clippedStart = Math.max(block.startMinute, viewport.startMinute)
    const clippedEnd = Math.min(block.endMinute, viewport.endMinute)
    if (clippedEnd <= clippedStart) return null

    const top = HEADER_HEIGHT + minuteToYPx(viewport, clippedStart, HOUR_HEIGHT)
    const height =
      minuteToYPx(viewport, clippedEnd, HOUR_HEIGHT) -
      minuteToYPx(viewport, clippedStart, HOUR_HEIGHT)

    // Couleur, libellé principal, et tâche en sous-titre.
    let color = STANDALONE_TASK_COLOR
    let title = '…'
    let subtitle: string | null = null

    if (block.kind === 'task' && block.refId) {
      const task = taskById.get(block.refId)
      if (task) title = task.title
    } else if (block.kind === 'objective' && block.refId) {
      const obj = objectiveById.get(block.refId)
      if (obj) {
        title = obj.name
        color = obj.color
      }
      if (block.linkedTaskId) {
        const linked = taskById.get(block.linkedTaskId)
        if (linked) subtitle = linked.title
      }
    }

    // « Terminé » : bloc d'aujourd'hui dont l'heure de fin est passée.
    const todayStr = localDateKey(now)
    const nowMinute = now.getHours() * 60 + now.getMinutes()
    const isToday = block.date === todayStr
    const isFinished = isToday && block.endMinute <= nowMinute

    void dayOfWeek // (utilisé via le placement côté parent — pas besoin ici)

    return (
      <div
        key={block.id}
        className={cn(
          'pointer-events-none absolute left-1 right-1 overflow-hidden rounded-md ring-1 ring-white/10',
          isFinished && 'opacity-40',
        )}
        style={{
          top,
          height,
          backgroundColor: color,
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
        <div className="relative flex h-full flex-col p-1.5 text-white drop-shadow-sm">
          <div className="flex items-center gap-1 text-[11px] font-semibold leading-tight">
            <span className="truncate">{title}</span>
            {isFinished && <span className="ml-auto text-[9px] uppercase opacity-80">Terminé</span>}
          </div>
          {height > 28 && subtitle && (
            <div className="truncate text-[10px] leading-tight opacity-80">{subtitle}</div>
          )}
          {height > 50 && (
            <div className="text-[10px] leading-tight opacity-70">
              {minuteToClockLabel(block.startMinute)} — {minuteToClockLabel(block.endMinute)}
            </div>
          )}
        </div>
      </div>
    )
  }
```

- [ ] **Step 4 : Rendre les blocs dans chaque colonne.** Dans la boucle `{DAYS_FR.map((_, dayOfWeek) => (...))}`, juste **après** la ligne qui filtre les entrées de catégorie (`{entries.filter(...).map(renderEntryBlock)}`), ajouter :

```tsx
            {/* Blocs de travail (lecture seule, par-dessus la grille) */}
            {workBlocks
              .filter((b) => b.date === weekDates[dayOfWeek])
              .map((b) => renderWorkBlock(b, dayOfWeek))}
```

- [ ] **Step 5 : Vérifier les portes — câblage temporaire.** Le code de `PlanningPage` ne passe pas encore les nouvelles props ; pour faire passer le typecheck, étendre le câblage temporaire de la Task 5 dans `PlanningPage.tsx` :

```tsx
            <WeekCalendar
              rules={rules}
              entries={entries}
              viewport={{ startMinute: 0, endMinute: 1440 }}
              weekDates={['2026-05-18', '2026-05-19', '2026-05-20', '2026-05-21', '2026-05-22', '2026-05-23', '2026-05-24']}
              workBlocks={[]}
              now={new Date()}
              taskById={new Map()}
              objectiveById={new Map()}
              onCreateEntry={handleCreateEntry}
              onUpdateEntry={handleUpdateEntry}
              onChangeRule={handleChangeRule}
              onDeleteEntry={deleteEntry}
              onCreateRule={() => openEditor(null)}
            />
```

Run: `npm run typecheck && npm run lint && npm run test`
Expected: PASS — 210 tests verts.

- [ ] **Step 6 : Commit.**

```bash
git add src/renderer/src/components/interface/WeekCalendar.tsx src/renderer/src/pages/PlanningPage.tsx
git commit -m "feat(calendar): rendu des blocs de travail en lecture seule"
```

---

## Task 7 : `PlanningPage` — câblage de `usePlacement` (vue Semaine)

Remplace le câblage temporaire des Tasks 5–6 par le vrai pipeline : `now` (avec interval 60s), `weekDates` calculés à partir de `now`, `usePlacement(now, weekDates[6])`, `viewport` depuis les réglages, indices `taskById` / `objectiveById`.

**Files:**
- Modify: `src/renderer/src/pages/PlanningPage.tsx`

- [ ] **Step 1 : Étendre les imports.** En haut de `PlanningPage.tsx`, ajouter (après les imports existants) :

```ts
import { usePlacement, localDateKey } from '@/lib/use-placement'
import { viewportFromSettings } from '@/lib/calendar-viewport'
import { useSettingsStore } from '@/store/settings.store'
import { useLevelsStore } from '@/store/levels.store'
import { useTasksStore } from '@/store/tasks.store'
```

Et étendre l'import React :

```ts
import { useEffect, useMemo, useState } from 'react'
```

- [ ] **Step 2 : Lire les données nécessaires.** Au début du composant `PlanningPage` (après les hooks existants `useScheduleStore`, `useBlockingStore`), ajouter :

```ts
  const sleepStart = useSettingsStore((s) => s.sleepStart)
  const sleepEnd = useSettingsStore((s) => s.sleepEnd)
  const tasks = useTasksStore((s) => s.tasks)
  const objectives = useLevelsStore((s) => s.objectives)
  const loadTasks = useTasksStore((s) => s.load)
  const loadLevels = useLevelsStore((s) => s.load)
  const tasksLoaded = useTasksStore((s) => s.loaded)
  const levelsLoaded = useLevelsStore((s) => s.loaded)
```

Et dans le `useEffect` initial, ajouter les chargements :

```ts
  useEffect(() => {
    void load()
    if (!blockingLoaded) void loadBlocking()
    if (!tasksLoaded) void loadTasks()
    if (!levelsLoaded) void loadLevels()
  }, [load, loadBlocking, loadTasks, loadLevels, blockingLoaded, tasksLoaded, levelsLoaded])
```

- [ ] **Step 3 : `now` avec interval 60s.** Juste après les `useEffect`, ajouter :

```ts
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
```

- [ ] **Step 4 : Calculer `weekDates` et `viewport`.** Juste après `now`, ajouter :

```ts
  const weekDates = useMemo(() => {
    // Lundi 0…Dimanche 6, semaine contenant `now`.
    const dow = (now.getDay() + 6) % 7
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)
      return localDateKey(d)
    })
  }, [now])

  const viewport = useMemo(() => viewportFromSettings(sleepStart, sleepEnd), [sleepStart, sleepEnd])

  // Plan opérationnel : aujourd'hui → aujourd'hui + 6.
  const todayStr = localDateKey(now)
  const rangeEnd = useMemo(() => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 6)
    return localDateKey(d)
  }, [now])

  const { blocks: workBlocks } = usePlacement(now, rangeEnd)

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])
  const objectiveById = useMemo(() => new Map(objectives.map((o) => [o.id, o])), [objectives])
  void todayStr // utilisé par WeekCalendar via la prop `now`
```

- [ ] **Step 5 : Câbler `WeekCalendar`.** Remplacer le câblage temporaire `viewport={{...}}, weekDates={['2026-...']}, ...` par les vraies valeurs :

```tsx
            <WeekCalendar
              rules={rules}
              entries={entries}
              viewport={viewport}
              weekDates={weekDates}
              workBlocks={workBlocks}
              now={now}
              taskById={taskById}
              objectiveById={objectiveById}
              onCreateEntry={handleCreateEntry}
              onUpdateEntry={handleUpdateEntry}
              onChangeRule={handleChangeRule}
              onDeleteEntry={deleteEntry}
              onCreateRule={() => openEditor(null)}
            />
```

- [ ] **Step 6 : Vérifier les portes.**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: PASS — 210 tests verts.

- [ ] **Step 7 : Commit.**

```bash
git add src/renderer/src/pages/PlanningPage.tsx
git commit -m "feat(calendar): câblage usePlacement dans la vue Semaine"
```

---

## Task 8 : `PlanningPage.MonthView` — carte de charge

Réécrit `MonthView` (à la fin de `PlanningPage.tsx`) pour calculer le placement sur tout le mois à la demande et colorer chaque jour selon la charge relative. Réf. spec §8.3.

**Files:**
- Modify: `src/renderer/src/pages/PlanningPage.tsx`

- [ ] **Step 1 : Étendre les imports.** Ajouter en haut :

```ts
import { loadColor } from '@/lib/load-heatmap'
```

- [ ] **Step 2 : Passer `now` à `MonthView`.** Dans le JSX de `PlanningPage`, remplacer le rendu de la vue Mois :

```tsx
          ) : (
            <MonthView now={now} />
          )}
```

- [ ] **Step 3 : Réécrire `MonthView`.** Remplacer toute la fonction `MonthView` (à la fin du fichier) par :

```tsx
function MonthView({ now }: { now: Date }) {
  const year = now.getFullYear()
  const month = now.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const daysInMonth = lastDay.getDate()

  // Calcul à la demande : tout le mois à partir d'aujourd'hui.
  const rangeEndStr = localDateKey(lastDay)
  const { dailyLoad } = usePlacement(now, rangeEndStr)

  const todayStr = localDateKey(now)
  const todayDayOfMonth = now.getMonth() === month ? now.getDate() : -1
  const loadByDate = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of dailyLoad) m.set(l.date, l.freeMinutes)
    return m
  }, [dailyLoad])

  // Échelle relative sur les jours rendus avec une charge calculée.
  const futureLoads = dailyLoad.filter((l) => l.date >= todayStr).map((l) => l.freeMinutes)
  const minFree = futureLoads.length ? Math.min(...futureLoads) : 0
  const maxFree = futureLoads.length ? Math.max(...futureLoads) : 0

  // Décalage pour commencer un lundi (0 = lundi).
  const firstDayOfWeek = (firstDay.getDay() + 6) % 7

  const DAYS_HEADER = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
  const MONTH_NAMES = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
  ]

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  function dateStrFor(day: number): string {
    const d = new Date(year, month, day)
    return localDateKey(d)
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-bg-card p-5">
      <div className="mb-4 text-center text-sm font-semibold text-text-primary">
        {MONTH_NAMES[month]} {year}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {DAYS_HEADER.map((d, i) => (
          <div key={i} className="py-2 text-center text-[10px] font-medium uppercase tracking-widest text-text-muted">
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={i} className="h-12" />
          }
          const isToday = day === todayDayOfMonth
          const dStr = dateStrFor(day)
          const isPast = dStr < todayStr
          const freeMinutes = loadByDate.get(dStr)
          const colored = !isPast && freeMinutes !== undefined && futureLoads.length > 0
          const bgColor = colored ? loadColor(freeMinutes!, minFree, maxFree) + '4D' : undefined // ~30% alpha
          const textColor = colored ? loadColor(freeMinutes!, minFree, maxFree) : undefined
          return (
            <motion.div
              key={i}
              whileHover={{ scale: 1.05 }}
              className={cn(
                'flex h-12 items-center justify-center rounded-lg text-sm font-medium transition-colors',
                !colored && 'text-text-muted',
                isToday && 'ring-2 ring-accent ring-offset-1 ring-offset-bg-card',
              )}
              style={colored ? { backgroundColor: bgColor, color: textColor } : undefined}
            >
              {day}
            </motion.div>
          )
        })}
      </div>

      <div className="mt-4 flex items-center justify-center gap-4 text-[10px] text-text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-2xl" style={{ backgroundColor: '#22c55e80' }} /> Peu chargé
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-2xl" style={{ backgroundColor: '#eab30880' }} /> Moyen
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-2xl" style={{ backgroundColor: '#f9731680' }} /> Chargé
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-2xl" style={{ backgroundColor: '#ef444480' }} /> Très chargé
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 4 : Vérifier les portes.**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: PASS — 210 tests verts.

- [ ] **Step 5 : Commit.**

```bash
git add src/renderer/src/pages/PlanningPage.tsx
git commit -m "feat(calendar): vue Mois en carte de charge relative"
```

---

## Task 9 : `HomePage` — passage au moteur unifié

Remplace `computeDailyFreeTime` / `distributeTimeToObjectives` (qui double-comptent le temps libre) par `usePlacement(now, today+6)` ; agrège les blocs d'aujourd'hui par tâche et par objectif pour les cartes existantes. Réf. spec §10.

**Files:**
- Modify: `src/renderer/src/pages/HomePage.tsx`

- [ ] **Step 1 : Mettre à jour les imports.** Remplacer le bloc d'imports `from '@/lib/free-time-calculator'` par :

```ts
import { formatAllocatedTime, computeFreeTimeSlots } from '@/lib/free-time-calculator'
import { usePlacement, localDateKey } from '@/lib/use-placement'
```

(et supprimer les imports devenus inutiles : `computeDailyFreeTime`, `distributeTimeToObjectives`, `ObjectiveTimeDistribution`, `TimeDistribution`).

- [ ] **Step 2 : Calculer le plan unifié.** Remplacer le bloc « CORE: Time distribution calculation » (les deux `useMemo` `dailyResult` et `objectiveDistributions`) par :

```ts
  // ─── CORE: Time distribution via le moteur unifié ───
  const rangeEnd = useMemo(() => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 6)
    return localDateKey(d)
  }, [now])
  const { blocks } = usePlacement(now, rangeEnd)

  const todayStr = localDateKey(now)
  const todayMinutesByTask = useMemo(() => {
    const m = new Map<string, number>()
    for (const b of blocks) {
      if (b.date !== todayStr || b.kind !== 'task' || !b.refId) continue
      m.set(b.refId, (m.get(b.refId) ?? 0) + (b.endMinute - b.startMinute))
    }
    return m
  }, [blocks, todayStr])
  const todayMinutesByObjective = useMemo(() => {
    const m = new Map<string, number>()
    for (const b of blocks) {
      if (b.date !== todayStr || b.kind !== 'objective' || !b.refId) continue
      m.set(b.refId, (m.get(b.refId) ?? 0) + (b.endMinute - b.startMinute))
    }
    return m
  }, [blocks, todayStr])

  const totalTodayWorkMinutes = useMemo(
    () =>
      blocks
        .filter((b) => b.date === todayStr && b.kind !== 'free')
        .reduce((s, b) => s + (b.endMinute - b.startMinute), 0),
    [blocks, todayStr],
  )

  // Pour la persistance de stats : temps libre brut d'aujourd'hui (somme des
  // créneaux non-préparation), indépendant du nouveau moteur.
  const todayDow = (now.getDay() + 6) % 7
  const todayFreeMinutes = useMemo(() => {
    const slots = computeFreeTimeSlots(todayDow, entries, rules)
    return slots.filter((s) => !s.isPreparation).reduce((sum, s) => sum + s.durationMinutes, 0)
  }, [todayDow, entries, rules])
```

- [ ] **Step 3 : Adapter le panneau « Temps libre ».** Remplacer le bloc « Temps libre disponible » qui utilisait `dailyResult.totalFreeMinutes` et `dailyResult.distributions.length` :

```tsx
            <div className="rounded-xl border border-border-subtle bg-bg-card p-5">
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-yellow" />
                <h3 className="text-xs font-medium uppercase tracking-wider text-text-muted">
                  Temps de travail aujourd&apos;hui
                </h3>
              </div>
              <div className="mt-3 text-3xl font-bold tabular-nums text-text-primary">
                {formatAllocatedTime(totalTodayWorkMinutes)}
              </div>
              <div className="mt-1 text-xs text-text-muted">
                Réparti entre {todayMinutesByTask.size + todayMinutesByObjective.size} item
                {todayMinutesByTask.size + todayMinutesByObjective.size !== 1 ? 's' : ''}
              </div>
            </div>
```

- [ ] **Step 4 : Adapter « Répartition par objectif ».** Remplacer la boucle qui consommait `objectiveDistributions.map((dist) => <ObjectiveDistributionCard …)` par :

```tsx
            {todayMinutesByObjective.size > 0 && (
              <div className="mt-8">
                <h2 className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-text-muted">
                  <Target size={14} />
                  Répartition par objectif (aujourd&apos;hui)
                </h2>
                <div className="flex flex-col gap-2">
                  {[...todayMinutesByObjective.entries()].map(([objectiveId, minutes]) => {
                    const obj = objectives.find((o) => o.id === objectiveId)
                    if (!obj) return null
                    return (
                      <div
                        key={objectiveId}
                        className="flex items-center justify-between gap-4 rounded-xl border border-border-subtle bg-bg-card p-4"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <span className="h-9 w-1.5 shrink-0 rounded-2xl" style={{ backgroundColor: obj.color }} />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-text-primary">{obj.name}</div>
                            <div className="mt-0.5 text-[10px] text-text-muted">Niveau {obj.level.toFixed(1)}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold tabular-nums text-text-primary">
                            {formatAllocatedTime(minutes)}
                          </div>
                          <div className="text-[10px] text-text-muted">alloué</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
```

- [ ] **Step 5 : Adapter « Ce que tu dois faire aujourd'hui ».** Remplacer la boucle `dailyResult.distributions.map((dist) => <DistributionCard …)` par :

```tsx
            {todayMinutesByTask.size > 0 && (
              <div className="mt-8">
                <h2 className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-text-muted">
                  <Target size={14} />
                  Ce que tu dois faire aujourd&apos;hui
                </h2>
                <div className="flex flex-col gap-2">
                  {[...todayMinutesByTask.entries()].map(([taskId, minutes]) => {
                    const task = tasks.find((t) => t.id === taskId)
                    if (!task) return null
                    return (
                      <div
                        key={taskId}
                        className="flex items-center justify-between gap-4 rounded-xl border border-border-subtle bg-bg-card p-4"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-text-primary">{task.title}</div>
                          <div className="mt-0.5 text-[10px] text-text-muted">Niveau {task.level} · échéance {task.deadline}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold tabular-nums text-text-primary">
                            {formatAllocatedTime(minutes)}
                          </div>
                          <div className="text-[10px] text-text-muted">à travailler</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
```

- [ ] **Step 6 : Adapter « Stats rapides ».** Le `StatCard "Temps libre"` utilisait `dailyResult.totalFreeMinutes` — le remplacer par `totalTodayWorkMinutes` (étiquette « Temps de travail ») :

```tsx
                <StatCard
                  icon={<Clock size={14} className="text-yellow" />}
                  label="Temps de travail"
                  value={formatAllocatedTime(totalTodayWorkMinutes)}
                />
```

- [ ] **Step 7 : Supprimer les composants devenus inutiles.** Supprimer entièrement les définitions `DistributionCard` et `ObjectiveDistributionCard` à la fin du fichier (et leurs imports de types `TimeDistribution` / `ObjectiveTimeDistribution` s'ils restent).

- [ ] **Step 8 : Adapter l'effet `setCalculatedFreeTime`.** Remplacer l'argument `dailyResult.totalFreeMinutes` par `todayFreeMinutes` (calculé à l'étape 2) — la persistance des minutes libres calculées reste identique en sémantique :

```tsx
  useEffect(() => {
    if (!loaded || !tasksLoaded) return
    void setCalculatedFreeTime(todayFreeMinutes, todayStr)
  }, [loaded, tasksLoaded, todayFreeMinutes, todayStr, setCalculatedFreeTime])
```

- [ ] **Step 9 : Vérifier les portes.**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: PASS — 210 tests verts. **Smoke test manuel recommandé** : `npm run dev`, ouvrir l'app, vérifier que la page Accueil affiche les blocs d'aujourd'hui sans erreur console.

- [ ] **Step 10 : Commit.**

```bash
git add src/renderer/src/pages/HomePage.tsx
git commit -m "feat(home): Accueil consomme le moteur unifié"
```

---

## Task 10 : Nettoyage de `free-time-calculator.ts`

Retire les fonctions `distributeTimeToTasks` / `distributeTimeToObjectives` (remplacées par le moteur unifié) et leurs types associés ; conserve `computeFreeTimeSlots`, `getDeadlineMultiplier`, les helpers de niveaux et de réconciliation (toujours utilisés). Vérifie qu'aucun appelant n'est laissé.

**Files:**
- Modify: `src/renderer/src/lib/free-time-calculator.ts`

- [ ] **Step 1 : Repérer les appelants restants.**

Run: `grep -rn "distributeTimeToTasks\|distributeTimeToObjectives\|computeDailyFreeTime\|TimeDistribution\|ObjectiveTimeDistribution\|DailyFreeTimeResult" src/`
Expected: aucune occurrence en dehors du fichier `free-time-calculator.ts` lui-même et de son fichier de tests.

Si un appelant subsiste, le résoudre avant de continuer.

- [ ] **Step 2 : Supprimer les exports inutilisés.** Dans `src/renderer/src/lib/free-time-calculator.ts`, supprimer :

- le type `TimeDistribution`
- le type `ObjectiveTimeDistribution`
- le type `DailyFreeTimeResult`
- la fonction `distributeTimeToTasks`
- la fonction `distributeTimeToObjectives`
- la fonction `computeDailyFreeTime`

Conserver intacts : `computeFreeTimeSlots`, `computeDayFreeMinutes`, `getDeadlineMultiplier`, `getMinimumLevel`, `applyAutomaticDegradation`, `clampManualLevelChange`, `canChangeLevel`, `daysUntilLevelChange`, `formatAllocatedTime`, `LevelZeroEvent`, `LevelZeroReconciliation`, `reconcileLevelZeroTasks`, et le type `FreeTimeSlot`.

- [ ] **Step 3 : Adapter les tests de `free-time-calculator`.** Si `free-time-calculator.test.ts` couvre les fonctions supprimées, retirer les `describe` correspondants (les autres tests doivent rester verts).

- [ ] **Step 4 : Vérifier les portes.**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: typecheck node+web PASS, lint PASS, tous les tests verts (le total descend selon le nombre de tests retirés).

- [ ] **Step 5 : Commit.**

```bash
git add src/renderer/src/lib/free-time-calculator.ts src/renderer/src/lib/free-time-calculator.test.ts
git commit -m "refactor: retire les distributions remplacées par le moteur d'auto-placement"
```

---

## Auto-revue (référence)

Couverture de la spec par ce plan (Partie B) :
- §6 blocs passés (« terminé » du jour, jours révolus naturellement absents) → Task 6 (état visuel `isFinished`).
- §7 verrou — blocs en lecture seule → Task 6 (`pointer-events-none`, pas de drag/menu).
- §8.1 deux couches (catégories + blocs de travail) → Task 6.
- §8.2 fenêtre horaire réveil→coucher → Task 1 + Task 5.
- §8.3 vue Mois — carte de charge relative → Task 2 + Task 8.
- §9 recalcul via `useMemo` derived state → Task 3 (`usePlacement`).
- §2 réglage du niveau de temps libre 4–7 + cooldown 2 semaines → Task 4.
- §10 renderer — distribution unifiée → Task 9 (HomePage), Task 7 (PlanningPage).
- §12 retrait des fonctions remplacées → Task 10.

Hors Partie B (sous-projets ultérieurs) : couches 2 (jeux de distractions) et 3 (blocage piloté par le bloc actif) ; 3 bugs connus (service Windows, scan apps, historique navigateur).
