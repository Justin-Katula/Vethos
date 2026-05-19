# Moteur d'auto-placement — Plan d'implémentation (Partie A : le moteur)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire le moteur d'auto-placement (couche 1 du « Calendrier vivant ») — une bibliothèque pure qui transforme tâches/objectifs en blocs datés — plus les deux champs de réglage du niveau de temps libre.

**Architecture:** Tout le moteur est une **fonction pure déterministe** dans un seul module `placement-engine.ts`, sans état ni I/O. Il réutilise `computeFreeTimeSlots` et `getDeadlineMultiplier` de `free-time-calculator.ts`. Aucune persistance : le plan sera un état dérivé côté UI (Partie B). Le niveau de temps libre vit dans les réglages.

**Tech Stack:** TypeScript, Zod (schémas), Vitest (tests). Renderer Electron/React (mais cette partie n'a aucun composant React).

**Référence spec:** `docs/superpowers/specs/2026-05-18-nexus-auto-placement-engine-design.md`.

**Portée:** Ce plan est la **Partie A** (le moteur, testable unitairement, sans UI). La **Partie B** (intégration calendrier : `WeekCalendar`, `MonthView`, `HomePage`, réglage UI) sera planifiée séparément, une fois la Partie A implémentée et vérifiée.

---

## Fichiers

- **Créer** `src/renderer/src/lib/placement-engine.ts` — le moteur (fonctions pures).
- **Créer** `src/renderer/src/lib/placement-engine.test.ts` — tests unitaires Vitest.
- **Modifier** `src/shared/schemas.ts` — `SettingsSchema` : 2 nouveaux champs.
- **Modifier** `src/renderer/src/store/settings.store.ts` — 2 nouveaux champs d'état.

Tous les `git add` ciblent ces fichiers explicitement (jamais `git add -A`).

---

## Task 1 : Champs de réglage du niveau de temps libre (schéma)

**Files:**
- Modify: `src/shared/schemas.ts` (dans `SettingsSchema`)

- [ ] **Step 1 : Ajouter les deux champs**

Dans `src/shared/schemas.ts`, dans `SettingsSchema`, juste après la ligne `firstLaunchDate: z.string().datetime().optional(),` et avant le `})` qui ferme l'objet, insérer :

```ts
  /** Niveau du temps libre (4–7) : concourt avec les tâches/objectifs pour le temps. */
  freeTimeLevel: z.number().int().min(4).max(7).optional(),
  /** Date du dernier changement du niveau de temps libre (cooldown 2 semaines). */
  freeTimeLevelChangedAt: z.string().datetime().optional(),
```

> Le champ est `.optional()` — comme **tous** les autres réglages de `SettingsSchema` (`username`, `sleepStart`…). La valeur par défaut (5) est fournie par le store (Task 2), pas par le schéma. Un `.default(5)` rendrait le champ *requis* dans le type inféré et casserait les fixtures de `storage.test.ts` ; `.optional()` l'évite.

- [ ] **Step 2 : Vérifier le typecheck**

Run: `npm run typecheck`
Expected: PASS (node + web), aucune erreur.

- [ ] **Step 3 : Vérifier les tests**

Run: `npm run test`
Expected: PASS — 169 tests (le champ `.optional()` est rétro-compatible : les fichiers `settings` existants sans le champ restent valides, et aucun défaut n'est injecté à la lecture).

- [ ] **Step 4 : Commit**

```bash
git add src/shared/schemas.ts
git commit -m "feat(placement): champs freeTimeLevel et freeTimeLevelChangedAt dans SettingsSchema"
```

---

## Task 2 : Champs de réglage dans le store des réglages

**Files:**
- Modify: `src/renderer/src/store/settings.store.ts`

- [ ] **Step 1 : Ajouter les champs au type `SettingsState`**

Dans `SettingsState`, après `firstLaunchDate: string | null`, ajouter :

```ts
  freeTimeLevel: number
  freeTimeLevelChangedAt: string | null
```

- [ ] **Step 2 : Ajouter les champs à `buildPayload`**

Dans `buildPayload`, dans l'objet retourné, après `firstLaunchDate: state.firstLaunchDate ?? undefined,` ajouter :

```ts
    freeTimeLevel: state.freeTimeLevel,
    freeTimeLevelChangedAt: state.freeTimeLevelChangedAt ?? undefined,
```

- [ ] **Step 3 : Ajouter les valeurs initiales du store**

Dans l'objet passé à `create<SettingsState>(...)`, après `firstLaunchDate: null,` ajouter :

```ts
  freeTimeLevel: 5,
  freeTimeLevelChangedAt: null,
```

- [ ] **Step 4 : Hydrater les champs dans `load()`**

Dans `load()`, dans l'objet passé au `set({ ... })`, après `firstLaunchDate: firstLaunch,` ajouter :

```ts
      freeTimeLevel: data?.freeTimeLevel ?? 5,
      freeTimeLevelChangedAt: data?.freeTimeLevelChangedAt ?? null,
```

- [ ] **Step 5 : Vérifier typecheck + tests**

Run: `npm run typecheck && npm run test`
Expected: PASS — typecheck node+web sans erreur, 169 tests verts.

- [ ] **Step 6 : Commit**

```bash
git add src/renderer/src/store/settings.store.ts
git commit -m "feat(placement): expose freeTimeLevel dans le store des réglages"
```

---

## Task 3 : Moteur — types, dates, `buildItems`

Crée le module du moteur avec les types, les utilitaires de date, `itemKey` et `buildItems` (construction + score des items, spec §1).

**Files:**
- Create: `src/renderer/src/lib/placement-engine.ts`
- Create: `src/renderer/src/lib/placement-engine.test.ts`

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `src/renderer/src/lib/placement-engine.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import type { Objective, Task } from '@shared/schemas'
import { buildItems, enumerateDates } from './placement-engine'

export function makeTask(over: Partial<Task> & { id: string }): Task {
  return {
    id: over.id,
    title: over.title ?? 'Tâche',
    linkedObjectiveId: over.linkedObjectiveId ?? null,
    deadline: over.deadline ?? '2026-12-31',
    level: over.level ?? 5,
    degradationPool: over.degradationPool ?? 0,
    totalDegradation: over.totalDegradation ?? 0,
    status: over.status ?? 'active',
    createdAt: over.createdAt ?? '2026-01-01T00:00:00.000Z',
  }
}

export function makeObjective(over: Partial<Objective> & { id: string }): Objective {
  return {
    id: over.id,
    name: over.name ?? 'Objectif',
    color: over.color ?? '#3BA3FF',
    linkedRuleIds: over.linkedRuleIds ?? [],
    level: over.level ?? 5,
    createdAt: over.createdAt ?? '2026-01-01T00:00:00.000Z',
  }
}

describe('enumerateDates', () => {
  it('liste les dates incluses entre début et fin', () => {
    expect(enumerateDates('2026-05-18', '2026-05-20')).toEqual([
      '2026-05-18',
      '2026-05-19',
      '2026-05-20',
    ])
  })

  it('renvoie un seul jour si début === fin', () => {
    expect(enumerateDates('2026-05-18', '2026-05-18')).toEqual(['2026-05-18'])
  })
})

describe('buildItems', () => {
  it('score une tâche autonome par niveau × multiplicateur', () => {
    const items = buildItems(
      [makeTask({ id: 't1', level: 6, deadline: '2026-12-31', linkedObjectiveId: null })],
      [],
      5,
      '2026-05-18',
    )
    // échéance lointaine → multiplicateur 1 → score = niveau
    expect(items.find((i) => i.kind === 'task' && i.refId === 't1')?.score).toBe(6)
  })

  it('combine objectif + tâches liées puis divise par 1,5', () => {
    const items = buildItems(
      [
        makeTask({ id: 'a', level: 7, deadline: '2026-12-31', linkedObjectiveId: 'o1' }),
        makeTask({ id: 'b', level: 7, deadline: '2026-12-31', linkedObjectiveId: 'o1' }),
      ],
      [makeObjective({ id: 'o1', level: 5 })],
      5,
      '2026-05-18',
    )
    expect(items.find((i) => i.kind === 'objective')?.score).toBeCloseTo((5 + 7 + 7) / 1.5)
  })

  it('ajoute un item temps libre dont le score = niveau de temps libre', () => {
    const items = buildItems([], [], 6, '2026-05-18')
    expect(items.find((i) => i.kind === 'free')?.score).toBe(6)
  })

  it('exclut les tâches de niveau 0 et les tâches non actives', () => {
    const items = buildItems(
      [
        makeTask({ id: 'z', level: 0, linkedObjectiveId: null }),
        makeTask({ id: 'h', level: 5, status: 'history', linkedObjectiveId: null }),
      ],
      [],
      5,
      '2026-05-18',
    )
    expect(items.some((i) => i.kind === 'task')).toBe(false)
  })
})
```

- [ ] **Step 2 : Lancer les tests pour vérifier l'échec**

Run: `npx vitest run src/renderer/src/lib/placement-engine.test.ts`
Expected: FAIL — `Failed to resolve import "./placement-engine"`.

- [ ] **Step 3 : Créer le module avec types, dates, `itemKey`, `buildItems`**

Créer `src/renderer/src/lib/placement-engine.ts` :

```ts
/**
 * placement-engine.ts
 *
 * Moteur d'auto-placement (« Calendrier vivant », couche 1). Fonctions pures et
 * déterministes : transforment tâches/objectifs en blocs datés.
 * Réf. spec : docs/superpowers/specs/2026-05-18-nexus-auto-placement-engine-design.md
 */
import type { Objective, ScheduleEntry, Task, TimeRule } from '@shared/schemas'
import { computeFreeTimeSlots, getDeadlineMultiplier } from './free-time-calculator'

// ─── Types ──────────────────────────────────────────────────────────────────

/** Un bloc concret posé sur le calendrier. */
export type PlacedBlock = {
  id: string
  date: string // YYYY-MM-DD
  startMinute: number // 0..1439
  endMinute: number // 1..1440
  kind: 'task' | 'objective' | 'free'
  refId: string | null // id de la tâche/objectif ; null si 'free'
  linkedTaskId: string | null // pour un objectif : tâche liée mise en avant
}

/** Un item qui concourt pour le temps libre (interne au moteur). */
export type PlacementItem = {
  kind: 'task' | 'objective' | 'free'
  refId: string | null
  score: number
  /** Échéance de la tâche (contrainte de placement) ; null pour objectif/temps libre. */
  deadline: string | null
  /** Pour un objectif : tâche liée la plus urgente, mise en avant dans le bloc. */
  linkedTaskId: string | null
}

// ─── Utilitaires de date ────────────────────────────────────────────────────

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d)
}

function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Liste des dates YYYY-MM-DD de `startStr` à `endStr` inclus. */
export function enumerateDates(startStr: string, endStr: string): string[] {
  const end = parseLocalDate(endStr)
  const out: string[] = []
  let cursor = parseLocalDate(startStr)
  while (cursor <= end) {
    out.push(toDateStr(cursor))
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1)
  }
  return out
}

/** 0 = lundi … 6 = dimanche (cohérent avec le reste de l'app). */
function dayOfWeekOf(dateStr: string): number {
  return (parseLocalDate(dateStr).getDay() + 6) % 7
}

// ─── Items & score (spec §1) ────────────────────────────────────────────────

/** Clé stable d'un item. */
export function itemKey(item: PlacementItem): string {
  return item.kind === 'free' ? 'free' : `${item.kind}:${item.refId}`
}

/**
 * Construit les items en concurrence pour le temps libre :
 *  - chaque tâche autonome active de niveau > 0 ;
 *  - chaque objectif de niveau > 0 (score combiné des tâches liées / 1,5) ;
 *  - le temps libre (score = son niveau).
 */
export function buildItems(
  tasks: Task[],
  objectives: Objective[],
  freeTimeLevel: number,
  todayStr: string,
): PlacementItem[] {
  const activeTasks = tasks.filter((t) => t.status === 'active' && t.level > 0)
  const items: PlacementItem[] = []

  // Tâches autonomes (non liées à un objectif).
  for (const task of activeTasks) {
    if (task.linkedObjectiveId !== null) continue
    items.push({
      kind: 'task',
      refId: task.id,
      score: task.level * getDeadlineMultiplier(task.deadline, todayStr),
      deadline: task.deadline,
      linkedTaskId: null,
    })
  }

  // Objectifs : score = (niveau_objectif + Σ scores des tâches liées) / 1,5.
  for (const objective of objectives) {
    if (objective.level <= 0) continue
    const linked = activeTasks.filter((t) => t.linkedObjectiveId === objective.id)
    const sumLinked = linked.reduce(
      (sum, t) => sum + t.level * getDeadlineMultiplier(t.deadline, todayStr),
      0,
    )
    const mostUrgent = linked.slice().sort((a, b) => a.deadline.localeCompare(b.deadline))[0]
    items.push({
      kind: 'objective',
      refId: objective.id,
      score: (objective.level + sumLinked) / 1.5,
      deadline: null,
      linkedTaskId: mostUrgent ? mostUrgent.id : null,
    })
  }

  // Temps libre : item concurrent, score = son niveau, jamais multiplié.
  items.push({ kind: 'free', refId: null, score: freeTimeLevel, deadline: null, linkedTaskId: null })

  return items.filter((i) => i.score > 0)
}
```

- [ ] **Step 4 : Lancer les tests pour vérifier le succès**

Run: `npx vitest run src/renderer/src/lib/placement-engine.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5 : Commit**

```bash
git add src/renderer/src/lib/placement-engine.ts src/renderer/src/lib/placement-engine.test.ts
git commit -m "feat(placement): types, utilitaires de date et buildItems"
```

---

## Task 4 : Moteur — `distributeBudget`

Distribue le temps libre total entre les items proportionnellement au score (spec §4).

**Files:**
- Modify: `src/renderer/src/lib/placement-engine.ts`
- Modify: `src/renderer/src/lib/placement-engine.test.ts`

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter à la fin de `placement-engine.test.ts`, et ajouter `distributeBudget` à l'`import` existant `from './placement-engine'` :

```ts
describe('distributeBudget', () => {
  const item = (refId: string, score: number) => ({
    kind: 'task' as const,
    refId,
    score,
    deadline: null,
    linkedTaskId: null,
  })

  it('répartit proportionnellement au score, arrondi à 5 min', () => {
    const budgets = distributeBudget([item('t1', 3), item('t2', 1)], 400)
    expect(budgets.get('task:t1')).toBe(300)
    expect(budgets.get('task:t2')).toBe(100)
  })

  it('verse le reliquat d arrondi pour que le total = T', () => {
    const budgets = distributeBudget([item('a', 1), item('b', 1), item('c', 1)], 80)
    const total = [...budgets.values()].reduce((s, v) => s + v, 0)
    expect(total).toBe(80)
  })

  it('renvoie une map vide si le temps libre total est nul', () => {
    expect(distributeBudget([item('t1', 3)], 0).size).toBe(0)
  })
})
```

- [ ] **Step 2 : Lancer le test pour vérifier l'échec**

Run: `npx vitest run src/renderer/src/lib/placement-engine.test.ts`
Expected: FAIL — `distributeBudget is not exported` / `is not a function`.

- [ ] **Step 3 : Implémenter `distributeBudget`**

Ajouter à la fin de `placement-engine.ts` :

```ts
// ─── Distribution du budget (spec §4) ───────────────────────────────────────

/**
 * Répartit `totalFreeMinutes` entre les items : chacun reçoit
 * `score / Σ scores × T`, arrondi à 5 min. Le reliquat d'arrondi va à l'item au
 * score le plus élevé. Clé de map = `itemKey`.
 */
export function distributeBudget(
  items: PlacementItem[],
  totalFreeMinutes: number,
): Map<string, number> {
  const budgets = new Map<string, number>()
  if (totalFreeMinutes <= 0 || items.length === 0) return budgets

  const totalScore = items.reduce((sum, i) => sum + i.score, 0)
  if (totalScore <= 0) return budgets

  for (const item of items) {
    const raw = (item.score / totalScore) * totalFreeMinutes
    budgets.set(itemKey(item), Math.round(raw / 5) * 5)
  }

  // Reliquat d'arrondi → item au score le plus élevé.
  const allocated = [...budgets.values()].reduce((s, v) => s + v, 0)
  const diff = totalFreeMinutes - allocated
  if (diff !== 0) {
    const top = items.slice().sort((a, b) => b.score - a.score)[0]!
    const key = itemKey(top)
    budgets.set(key, Math.max(0, (budgets.get(key) ?? 0) + diff))
  }

  return budgets
}
```

- [ ] **Step 4 : Lancer le test pour vérifier le succès**

Run: `npx vitest run src/renderer/src/lib/placement-engine.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 5 : Commit**

```bash
git add src/renderer/src/lib/placement-engine.ts src/renderer/src/lib/placement-engine.test.ts
git commit -m "feat(placement): distribution du budget par score"
```

---

## Task 5 : Moteur — `placeBlocks`

Place les budgets en blocs concrets dans les créneaux libres, étalés sur les jours, sans dépasser l'échéance ni les plafonds de session (spec §5).

**Files:**
- Modify: `src/renderer/src/lib/placement-engine.ts`
- Modify: `src/renderer/src/lib/placement-engine.test.ts`

- [ ] **Step 1 : Écrire les tests qui échouent**

Ajouter à la fin de `placement-engine.test.ts`, et ajouter `placeBlocks` à l'`import` `from './placement-engine'` :

```ts
describe('placeBlocks', () => {
  const taskItem = (refId: string, deadline: string | null) => ({
    kind: 'task' as const,
    refId,
    score: 1,
    deadline,
    linkedTaskId: null,
  })

  it('place les blocs dans les créneaux libres, planning vide = journée libre', () => {
    const blocks = placeBlocks(
      [taskItem('t1', null)],
      new Map([['task:t1', 120]]),
      ['2026-05-18'],
      [],
      [],
    )
    const total = blocks.reduce((s, b) => s + (b.endMinute - b.startMinute), 0)
    expect(total).toBe(120)
    expect(blocks.every((b) => b.date === '2026-05-18' && b.kind === 'task')).toBe(true)
  })

  it('ne place jamais une tâche après son échéance', () => {
    const blocks = placeBlocks(
      [taskItem('t1', '2026-05-18')],
      new Map([['task:t1', 120]]),
      ['2026-05-18', '2026-05-19', '2026-05-20'],
      [],
      [],
    )
    expect(blocks.length).toBeGreaterThan(0)
    expect(blocks.every((b) => b.date <= '2026-05-18')).toBe(true)
  })

  it('étale les blocs d un item sur plusieurs jours', () => {
    const blocks = placeBlocks(
      [taskItem('t1', null)],
      new Map([['task:t1', 600]]),
      ['2026-05-18', '2026-05-19', '2026-05-20', '2026-05-21', '2026-05-22'],
      [],
      [],
    )
    expect(new Set(blocks.map((b) => b.date)).size).toBeGreaterThan(1)
  })

  it('ne place pas l item temps libre (il est ce qui reste)', () => {
    const blocks = placeBlocks(
      [{ kind: 'free', refId: null, score: 5, deadline: null, linkedTaskId: null }],
      new Map([['free', 300]]),
      ['2026-05-18'],
      [],
      [],
    )
    expect(blocks).toEqual([])
  })
})
```

- [ ] **Step 2 : Lancer les tests pour vérifier l'échec**

Run: `npx vitest run src/renderer/src/lib/placement-engine.test.ts`
Expected: FAIL — `placeBlocks is not a function`.

- [ ] **Step 3 : Implémenter `placeBlocks`**

Ajouter à la fin de `placement-engine.ts` :

```ts
// ─── Placement des blocs (spec §5) ──────────────────────────────────────────

const MIN_BLOCK = 30 // durée minimale d'un bloc (min)
const MAX_BLOCK = 120 // durée maximale d'un bloc (min)
const MAX_PER_ITEM_PER_DAY = 240 // plafond « 4 h même item / jour »
const MAX_WORK_PER_DAY = 360 // plafond « 6 h de travail / jour »

type WorkSlot = { cursor: number; endMinute: number }

/**
 * Place les budgets (tâches + objectifs) en blocs concrets. Le temps libre
 * n'est pas placé : ce sont les créneaux qui restent vides. Par item, le budget
 * est étalé sur ses jours éligibles ; les tâches ne dépassent jamais leur
 * échéance ; les plafonds par jour sont respectés.
 */
export function placeBlocks(
  items: PlacementItem[],
  budgets: Map<string, number>,
  dates: string[],
  entries: ScheduleEntry[],
  rules: TimeRule[],
): PlacedBlock[] {
  const placeable = items
    .filter((i) => i.kind !== 'free')
    .sort((a, b) => b.score - a.score)

  // Créneaux de travail libres par date (créneaux non-préparation ≥ MIN_BLOCK).
  const slotsByDate = new Map<string, WorkSlot[]>()
  for (const date of dates) {
    slotsByDate.set(
      date,
      computeFreeTimeSlots(dayOfWeekOf(date), entries, rules)
        .filter((s) => !s.isPreparation && s.durationMinutes >= MIN_BLOCK)
        .map((s) => ({ cursor: s.startMinute, endMinute: s.endMinute })),
    )
  }

  const perDayItem = new Map<string, number>() // clé `${date}|${itemKey}`
  const perDayTotal = new Map<string, number>() // clé `date`
  const blocks: PlacedBlock[] = []

  for (const item of placeable) {
    const key = itemKey(item)
    let budget = budgets.get(key) ?? 0
    const eligible = dates.filter(
      (d) => item.kind !== 'task' || item.deadline === null || d <= item.deadline,
    )
    if (eligible.length === 0) continue

    let guard = 0
    while (budget >= MIN_BLOCK && guard < 1000) {
      guard += 1
      // Cible par jour : étale le budget restant sur les jours éligibles.
      const perPass = Math.min(
        MAX_BLOCK,
        Math.max(MIN_BLOCK, Math.floor(budget / eligible.length / 5) * 5),
      )
      let placedThisPass = false
      for (const date of eligible) {
        if (budget < MIN_BLOCK) break
        const dayItem = perDayItem.get(`${date}|${key}`) ?? 0
        const dayTotal = perDayTotal.get(date) ?? 0
        if (dayItem >= MAX_PER_ITEM_PER_DAY || dayTotal >= MAX_WORK_PER_DAY) continue
        const slot = (slotsByDate.get(date) ?? []).find(
          (s) => s.endMinute - s.cursor >= MIN_BLOCK,
        )
        if (!slot) continue
        const size =
          Math.floor(
            Math.min(
              perPass,
              budget,
              slot.endMinute - slot.cursor,
              MAX_PER_ITEM_PER_DAY - dayItem,
              MAX_WORK_PER_DAY - dayTotal,
            ) / 5,
          ) * 5
        if (size < MIN_BLOCK) continue
        blocks.push({
          id: `${date}:${slot.cursor}:${item.kind}:${item.refId ?? ''}`,
          date,
          startMinute: slot.cursor,
          endMinute: slot.cursor + size,
          kind: item.kind,
          refId: item.refId,
          linkedTaskId: item.linkedTaskId,
        })
        slot.cursor += size
        budget -= size
        perDayItem.set(`${date}|${key}`, dayItem + size)
        perDayTotal.set(date, dayTotal + size)
        placedThisPass = true
      }
      if (!placedThisPass) break
    }
  }

  return blocks
}
```

- [ ] **Step 4 : Lancer les tests pour vérifier le succès**

Run: `npx vitest run src/renderer/src/lib/placement-engine.test.ts`
Expected: PASS — 13 tests.

- [ ] **Step 5 : Commit**

```bash
git add src/renderer/src/lib/placement-engine.ts src/renderer/src/lib/placement-engine.test.ts
git commit -m "feat(placement): placement des blocs dans les créneaux libres"
```

---

## Task 6 : Moteur — `computePlacement`

La fonction publique composée : items → budget → blocs, pour une plage de dates (spec §3, §10).

**Files:**
- Modify: `src/renderer/src/lib/placement-engine.ts`
- Modify: `src/renderer/src/lib/placement-engine.test.ts`

- [ ] **Step 1 : Écrire les tests qui échouent**

Ajouter à la fin de `placement-engine.test.ts`, et ajouter `computePlacement` à l'`import` `from './placement-engine'` :

```ts
describe('computePlacement', () => {
  const base = {
    objectives: [],
    rules: [],
    entries: [],
    freeTimeLevel: 5,
    todayStr: '2026-05-18',
    rangeEndStr: '2026-05-24',
  }

  it('produit des blocs datés dans la plage', () => {
    const blocks = computePlacement({
      ...base,
      tasks: [makeTask({ id: 't1', level: 6, deadline: '2026-12-31', linkedObjectiveId: null })],
    })
    expect(blocks.length).toBeGreaterThan(0)
    expect(blocks.every((b) => b.date >= '2026-05-18' && b.date <= '2026-05-24')).toBe(true)
    expect(blocks.every((b) => b.kind === 'task')).toBe(true)
  })

  it('renvoie [] sans tâche ni objectif (seul le temps libre concourt)', () => {
    expect(computePlacement({ ...base, tasks: [] })).toEqual([])
  })

  it('est déterministe : mêmes entrées ⇒ même plan', () => {
    const input = {
      ...base,
      tasks: [makeTask({ id: 't1', level: 6, deadline: '2026-12-31', linkedObjectiveId: null })],
    }
    expect(computePlacement(input)).toEqual(computePlacement(input))
  })
})
```

- [ ] **Step 2 : Lancer les tests pour vérifier l'échec**

Run: `npx vitest run src/renderer/src/lib/placement-engine.test.ts`
Expected: FAIL — `computePlacement is not a function`.

- [ ] **Step 3 : Implémenter `computePlacement`**

Ajouter à la fin de `placement-engine.ts` :

```ts
// ─── Fonction publique (spec §3, §10) ───────────────────────────────────────

export type ComputePlacementInput = {
  tasks: Task[]
  objectives: Objective[]
  rules: TimeRule[]
  entries: ScheduleEntry[]
  freeTimeLevel: number
  /** Premier jour planifié + ancre du multiplicateur d'échéance. */
  todayStr: string
  /** Dernier jour planifié (todayStr + 6 pour le plan opérationnel ; fin du mois pour l'aperçu). */
  rangeEndStr: string
}

/**
 * Calcule le plan : place tâches et objectifs en blocs datés de `todayStr` à
 * `rangeEndStr`. Pure et déterministe — mêmes entrées ⇒ même sortie.
 */
export function computePlacement(input: ComputePlacementInput): PlacedBlock[] {
  const { tasks, objectives, rules, entries, freeTimeLevel, todayStr, rangeEndStr } = input
  const dates = enumerateDates(todayStr, rangeEndStr)
  if (dates.length === 0) return []

  const items = buildItems(tasks, objectives, freeTimeLevel, todayStr)

  // Temps libre total de la plage (créneaux hors préparation).
  let totalFree = 0
  for (const date of dates) {
    for (const slot of computeFreeTimeSlots(dayOfWeekOf(date), entries, rules)) {
      if (!slot.isPreparation) totalFree += slot.durationMinutes
    }
  }

  const budgets = distributeBudget(items, totalFree)
  return placeBlocks(items, budgets, dates, entries, rules)
}
```

- [ ] **Step 4 : Lancer les tests pour vérifier le succès**

Run: `npx vitest run src/renderer/src/lib/placement-engine.test.ts`
Expected: PASS — 16 tests.

- [ ] **Step 5 : Commit**

```bash
git add src/renderer/src/lib/placement-engine.ts src/renderer/src/lib/placement-engine.test.ts
git commit -m "feat(placement): fonction publique computePlacement"
```

---

## Task 7 : Moteur — `summarizeDailyLoad`

Agrège, par jour, le temps libre restant — donnée de la carte de charge de la vue Mois (spec §8.3).

**Files:**
- Modify: `src/renderer/src/lib/placement-engine.ts`
- Modify: `src/renderer/src/lib/placement-engine.test.ts`

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter à la fin de `placement-engine.test.ts`, et ajouter `summarizeDailyLoad` et le type `PlacedBlock` à l'`import` `from './placement-engine'` (le type via `import { ..., type PlacedBlock } from './placement-engine'`) :

```ts
describe('summarizeDailyLoad', () => {
  it('calcule temps travaillé et temps libre restant par jour', () => {
    const blocks: PlacedBlock[] = [
      {
        id: 'x',
        date: '2026-05-18',
        startMinute: 0,
        endMinute: 120,
        kind: 'task',
        refId: 't1',
        linkedTaskId: null,
      },
    ]
    const load = summarizeDailyLoad(blocks, ['2026-05-18', '2026-05-19'], [], [])
    expect(load[0]).toEqual({ date: '2026-05-18', workedMinutes: 120, freeMinutes: 1440 - 120 })
    expect(load[1]).toEqual({ date: '2026-05-19', workedMinutes: 0, freeMinutes: 1440 })
  })
})
```

- [ ] **Step 2 : Lancer le test pour vérifier l'échec**

Run: `npx vitest run src/renderer/src/lib/placement-engine.test.ts`
Expected: FAIL — `summarizeDailyLoad is not a function`.

- [ ] **Step 3 : Implémenter `summarizeDailyLoad`**

Ajouter à la fin de `placement-engine.ts` :

```ts
// ─── Charge quotidienne — vue Mois (spec §8.3) ──────────────────────────────

export type DailyLoad = {
  date: string
  workedMinutes: number
  /** Temps libre restant = temps libre total du jour − temps travaillé placé. */
  freeMinutes: number
}

/**
 * Pour chaque date, calcule le temps travaillé (somme des blocs tâche/objectif)
 * et le temps libre restant. Sert à colorer la vue Mois.
 */
export function summarizeDailyLoad(
  blocks: PlacedBlock[],
  dates: string[],
  entries: ScheduleEntry[],
  rules: TimeRule[],
): DailyLoad[] {
  return dates.map((date) => {
    let totalSlot = 0
    for (const slot of computeFreeTimeSlots(dayOfWeekOf(date), entries, rules)) {
      if (!slot.isPreparation) totalSlot += slot.durationMinutes
    }
    const workedMinutes = blocks
      .filter((b) => b.date === date && b.kind !== 'free')
      .reduce((sum, b) => sum + (b.endMinute - b.startMinute), 0)
    return { date, workedMinutes, freeMinutes: Math.max(0, totalSlot - workedMinutes) }
  })
}
```

- [ ] **Step 4 : Lancer le test pour vérifier le succès**

Run: `npx vitest run src/renderer/src/lib/placement-engine.test.ts`
Expected: PASS — 17 tests.

- [ ] **Step 5 : Commit**

```bash
git add src/renderer/src/lib/placement-engine.ts src/renderer/src/lib/placement-engine.test.ts
git commit -m "feat(placement): charge quotidienne pour la vue Mois"
```

---

## Task 8 : Moteur — cooldown du niveau de temps libre

Helpers purs pour le verrou de 2 semaines sur le changement du niveau de temps libre (spec §2). Utilisés par l'UI des réglages en Partie B.

**Files:**
- Modify: `src/renderer/src/lib/placement-engine.ts`
- Modify: `src/renderer/src/lib/placement-engine.test.ts`

- [ ] **Step 1 : Écrire les tests qui échouent**

Ajouter à la fin de `placement-engine.test.ts`, et ajouter `canChangeFreeTimeLevel` et `daysUntilFreeTimeLevelChange` à l'`import` `from './placement-engine'` :

```ts
describe('canChangeFreeTimeLevel', () => {
  it('autorise si jamais changé', () => {
    expect(canChangeFreeTimeLevel(undefined, new Date('2026-05-18T00:00:00.000Z'))).toBe(true)
  })

  it('refuse avant 14 jours', () => {
    expect(
      canChangeFreeTimeLevel('2026-05-10T00:00:00.000Z', new Date('2026-05-18T00:00:00.000Z')),
    ).toBe(false)
  })

  it('autorise à partir de 14 jours', () => {
    expect(
      canChangeFreeTimeLevel('2026-05-01T00:00:00.000Z', new Date('2026-05-18T00:00:00.000Z')),
    ).toBe(true)
  })
})

describe('daysUntilFreeTimeLevelChange', () => {
  it('compte les jours restants avant déverrouillage', () => {
    expect(
      daysUntilFreeTimeLevelChange('2026-05-10T00:00:00.000Z', new Date('2026-05-18T00:00:00.000Z')),
    ).toBe(6)
  })

  it('renvoie 0 si jamais changé', () => {
    expect(daysUntilFreeTimeLevelChange(undefined, new Date('2026-05-18T00:00:00.000Z'))).toBe(0)
  })
})
```

- [ ] **Step 2 : Lancer les tests pour vérifier l'échec**

Run: `npx vitest run src/renderer/src/lib/placement-engine.test.ts`
Expected: FAIL — `canChangeFreeTimeLevel is not a function`.

- [ ] **Step 3 : Implémenter les helpers de cooldown**

Ajouter à la fin de `placement-engine.ts` :

```ts
// ─── Cooldown du niveau de temps libre (spec §2) ────────────────────────────

const FREE_TIME_LEVEL_COOLDOWN_DAYS = 14

/** Vrai si le niveau de temps libre peut être changé (cooldown 2 semaines respecté). */
export function canChangeFreeTimeLevel(changedAt: string | undefined, now: Date): boolean {
  if (!changedAt) return true
  const diffDays = (now.getTime() - new Date(changedAt).getTime()) / 86_400_000
  return diffDays >= FREE_TIME_LEVEL_COOLDOWN_DAYS
}

/** Nombre de jours restants avant de pouvoir changer le niveau de temps libre. */
export function daysUntilFreeTimeLevelChange(changedAt: string | undefined, now: Date): number {
  if (!changedAt) return 0
  const diffDays = (now.getTime() - new Date(changedAt).getTime()) / 86_400_000
  return Math.max(0, Math.ceil(FREE_TIME_LEVEL_COOLDOWN_DAYS - diffDays))
}
```

- [ ] **Step 4 : Lancer la suite complète**

Run: `npx vitest run src/renderer/src/lib/placement-engine.test.ts`
Expected: PASS — 22 tests.

- [ ] **Step 5 : Vérifier les portes globales**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: typecheck node+web PASS, lint PASS, tous les tests verts (169 existants + 22 nouveaux = 191).

- [ ] **Step 6 : Commit**

```bash
git add src/renderer/src/lib/placement-engine.ts src/renderer/src/lib/placement-engine.test.ts
git commit -m "feat(placement): cooldown 2 semaines du niveau de temps libre"
```

---

## Auto-revue (référence)

Couverture de la spec par ce plan (Partie A) :
- §1 modèle de score → Task 3 (`buildItems`).
- §2 niveau de temps libre → Task 1–2 (champs) + Task 8 (cooldown).
- §3 fenêtre/plage → Task 6 (`computePlacement`, paramètre `rangeEndStr`).
- §4 distribution → Task 4 (`distributeBudget`).
- §5 placement (blocs 30–120 min, étalement, échéance, plafonds) → Task 5 (`placeBlocks`).
- §8.3 charge de la vue Mois → Task 7 (`summarizeDailyLoad`).
- §10 fonction pure déterministe → Task 6 (test de déterminisme).

Hors de cette partie (→ Partie B) : §6 blocs passés (rendu), §7 verrouillage UI, §8.1/§8.2 calendrier deux couches + fenêtre horaire, §8.3 rendu de la carte de charge, §9 recalcul (`useMemo`), et le réglage UI du niveau de temps libre dans `SettingsPage`.
