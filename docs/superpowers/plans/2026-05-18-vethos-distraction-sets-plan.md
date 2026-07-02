# Couche 2 — Registre + classifications : plan d'implémentation

> Reference spec : `docs/superpowers/specs/2026-05-18-vethos-distraction-sets-design.md`
> Préreq : Partie B (UI calendrier) mergée. Le scan d'apps et l'historique
> navigateur (bugs 2 et 3) peuvent être corrigés en parallèle ou après ; sans
> eux le registre reste alimentable à la main.

**Goal :** Implémenter le registre central (sites + apps avec classification),
le resolver pur, l'UI de classification dans la BlockingPage, l'unlockPolicy
sur Objective/Task, et le réglage `classificationMode`. Respecter les règles
d'anti-sabotage de D11 (pas de modifications, demote one-way).

**Branche suggérée :** `vethos-distraction-sets` depuis `master`.

---

## Fichiers

**Créer :**
- `src/renderer/src/lib/blocking-resolver.ts` (+ `.test.ts`)
- `src/renderer/src/store/registry.store.ts`
- `src/renderer/src/components/blocking/DistractionWarning.tsx` (dialog)
- `src/renderer/src/components/blocking/ClassificationDialog.tsx`
- `src/renderer/src/components/blocking/UnclassifiedList.tsx`
- `src/renderer/src/components/blocking/RegistryList.tsx`
- `src/renderer/src/components/blocking/UnlockPolicyForm.tsx`

**Modifier :**
- `src/shared/schemas.ts`
- `src/renderer/src/pages/BlockingPage.tsx` (refonte)
- `src/renderer/src/pages/SettingsPage.tsx` (ajout classificationMode)
- L'éditeur d'objectif (à localiser via grep `ObjectiveEditor|saveObjective`)
- L'éditeur de tâche (à localiser via grep)
- `src/main/tracking/app-discovery.ts` (câblage au registre, après bug 2 fixé)
- `src/main/tracking/site-tracker.ts` (câblage au registre, après bug 3 fixé)

Aucun `git add -A`.

---

## Task 1 : Schéma — RegistryItem + UnlockPolicy + champs additifs

**Step 1 — Extraire `UnlockPolicySchema` du `BlockingProfileSchema`.** Dans
`src/shared/schemas.ts`, juste avant `BlockingProfileSchema`, ajouter :

```ts
export const UnlockPolicySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('cooldown'), minutes: z.number().int().min(1).max(60) }),
  z.object({ type: z.literal('justification'), minWords: z.number().int().min(50).max(500) }),
  z.object({
    type: z.literal('cooldown_and_justification'),
    minutes: z.number().int().min(1).max(60),
    minWords: z.number().int().min(50).max(500),
  }),
])
export type UnlockPolicy = z.infer<typeof UnlockPolicySchema>
```

Et dans `BlockingProfileSchema`, remplacer la définition inline d'`unlockPolicy`
par `unlockPolicy: UnlockPolicySchema` (équivalent, mais factorisé).

**Step 2 — Ajouter `RegistryItemSchema` et `RegistryStateSchema`.** Après
`BlockingProfileSchema` :

```ts
export const RegistryItemSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['site', 'app']),
  /** Domaine ('youtube.com') ou nom de processus ('discord.exe'). */
  identifier: z.string().min(1),
  /** Label lisible affiché à l'utilisateur. */
  displayName: z.string().min(1),
  /** Visites (site) ou minutes d'usage cumulé (app). */
  usageCount: z.number().int().min(0).default(0),
  lastSeenAt: z.string().datetime(),
  /** True ssi l'utilisateur a répondu au moins une fois. */
  classified: z.boolean().default(false),
  /** True ssi démontré utile → distraction. Irréversible (D11). */
  demoted: z.boolean().default(false),
  usefulFor: z
    .object({
      objectives: z.array(z.string().uuid()).default([]),
      standaloneTasks: z.array(z.string().uuid()).default([]),
    })
    .default({ objectives: [], standaloneTasks: [] }),
  createdAt: z.string().datetime(),
})
export type RegistryItem = z.infer<typeof RegistryItemSchema>

export const RegistryStateSchema = z.object({
  items: z.array(RegistryItemSchema).max(10_000),
})
export type RegistryState = z.infer<typeof RegistryStateSchema>
```

**Step 3 — Ajouter `unlockPolicy` à Objective et Task.**

Dans `ObjectiveSchema`, juste avant `createdAt`, ajouter :
```ts
  unlockPolicy: UnlockPolicySchema.optional(),
```

Dans `TaskSchema`, juste avant `createdAt`, ajouter :
```ts
  unlockPolicy: UnlockPolicySchema.optional(),
```

**Step 4 — Ajouter `classificationMode` à `SettingsSchema`.**

Juste avant `freeTimeLevel`, ajouter :
```ts
  /** Quand l'app demande de classifier (D7). */
  classificationMode: z.enum(['immediate', 'batch_3h', 'batch_1d', 'batch_1w']).optional(),
```

**Step 5 — Ajouter la storage key `'registry'`.**

Dans `STORAGE_KEYS`, ajouter `'registry'`. Dans `STORAGE_SCHEMAS`, ajouter :
```ts
  registry: RegistryStateSchema,
```

**Step 6 — Vérifier les portes.**
`npm run typecheck && npm run lint && npm run test` — Expected : PASS.

**Step 7 — Commit.**
```bash
git add src/shared/schemas.ts
git commit -m "feat(distractions): schéma RegistryItem, UnlockPolicy, classificationMode"
```

---

## Task 2 : Store du registre + actions anti-sabotage

**Step 1 — Créer `src/renderer/src/store/registry.store.ts`.**

```ts
import { create } from 'zustand'
import { vethos } from '@/lib/ipc'
import type { RegistryItem, RegistryState } from '@shared/schemas'
import { assertStorageWrite } from '@/lib/storage-write'

type AddItemInput = Omit<RegistryItem, 'id' | 'createdAt' | 'classified' | 'demoted' | 'usefulFor' | 'usageCount'> & {
  usageCount?: number
}

type ClassifyInput = {
  itemId: string
  usefulFor: { objectives: string[]; standaloneTasks: string[] }
}

type State = {
  items: RegistryItem[]
  loaded: boolean
  load: () => Promise<void>
  /** Ajoute un item nouvellement détecté (classified=false). */
  observeItem: (input: AddItemInput) => Promise<RegistryItem>
  /** Incrémente l'usageCount + met à jour lastSeenAt. */
  incrementUsage: (itemId: string) => Promise<void>
  /** Classifie un item (irréversible, D11). Refuse si déjà classifié. */
  classifyItem: (input: ClassifyInput) => Promise<void>
  /** Ajoute des associations supplémentaires (additif uniquement). */
  addUsefulFor: (input: ClassifyInput) => Promise<void>
  /** Démote one-way (D11). Refuse si déjà demoted. */
  demoteItem: (itemId: string) => Promise<void>
}

async function persist(items: RegistryItem[]): Promise<void> {
  const result = await vethos.storage.write<RegistryState>('registry', { items })
  assertStorageWrite(result, 'registry')
}

export const useRegistryStore = create<State>((set, get) => ({
  items: [],
  loaded: false,

  async load() {
    const data = await vethos.storage.read<RegistryState>('registry')
    set({ items: data?.items ?? [], loaded: true })
  },

  async observeItem(input) {
    const existing = get().items.find(
      (i) => i.kind === input.kind && i.identifier === input.identifier,
    )
    if (existing) return existing
    const now = new Date().toISOString()
    const item: RegistryItem = {
      id: crypto.randomUUID(),
      kind: input.kind,
      identifier: input.identifier,
      displayName: input.displayName,
      usageCount: input.usageCount ?? 0,
      lastSeenAt: now,
      classified: false,
      demoted: false,
      usefulFor: { objectives: [], standaloneTasks: [] },
      createdAt: now,
    }
    const items = [...get().items, item]
    set({ items })
    await persist(items)
    return item
  },

  async incrementUsage(itemId) {
    const items = get().items.map((i) =>
      i.id === itemId ? { ...i, usageCount: i.usageCount + 1, lastSeenAt: new Date().toISOString() } : i,
    )
    set({ items })
    await persist(items)
  },

  async classifyItem({ itemId, usefulFor }) {
    const item = get().items.find((i) => i.id === itemId)
    if (!item) throw new Error('Registry item introuvable')
    if (item.classified) throw new Error('Item déjà classifié — anti-sabotage (D11)')
    const items = get().items.map((i) =>
      i.id === itemId ? { ...i, classified: true, usefulFor } : i,
    )
    set({ items })
    await persist(items)
  },

  async addUsefulFor({ itemId, usefulFor }) {
    const item = get().items.find((i) => i.id === itemId)
    if (!item) throw new Error('Registry item introuvable')
    if (item.demoted) throw new Error('Item démontré — pas d ajout possible (D11)')
    const merged = {
      objectives: Array.from(new Set([...item.usefulFor.objectives, ...usefulFor.objectives])),
      standaloneTasks: Array.from(new Set([...item.usefulFor.standaloneTasks, ...usefulFor.standaloneTasks])),
    }
    const items = get().items.map((i) =>
      i.id === itemId ? { ...i, classified: true, usefulFor: merged } : i,
    )
    set({ items })
    await persist(items)
  },

  async demoteItem(itemId) {
    const item = get().items.find((i) => i.id === itemId)
    if (!item) throw new Error('Registry item introuvable')
    if (item.demoted) throw new Error('Item déjà démontré — irréversible (D11)')
    const items = get().items.map((i) =>
      i.id === itemId ? { ...i, classified: true, demoted: true } : i,
    )
    set({ items })
    await persist(items)
  },
}))
```

**Step 2 — Vérifier les portes.** PASS.

**Step 3 — Commit.**
```bash
git add src/renderer/src/store/registry.store.ts
git commit -m "feat(distractions): store du registre + actions anti-sabotage"
```

---

## Task 3 : Resolver pur `resolveBlockingForBlock` (TDD)

**Step 1 — Créer le test.** `src/renderer/src/lib/blocking-resolver.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import type { Objective, Task, RegistryItem } from '@shared/schemas'
import type { PlacedBlock } from '@/lib/placement-engine'
import { resolveBlockingForBlock } from './blocking-resolver'

function item(over: Partial<RegistryItem> & { id: string; identifier: string }): RegistryItem {
  return {
    id: over.id,
    kind: over.kind ?? 'site',
    identifier: over.identifier,
    displayName: over.displayName ?? over.identifier,
    usageCount: 0,
    lastSeenAt: '2026-01-01T00:00:00.000Z',
    classified: over.classified ?? false,
    demoted: over.demoted ?? false,
    usefulFor: over.usefulFor ?? { objectives: [], standaloneTasks: [] },
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

function obj(over: Partial<Objective> & { id: string }): Objective {
  return {
    id: over.id,
    name: over.name ?? 'O',
    color: '#000000',
    linkedRuleIds: [],
    level: 5,
    createdAt: '2026-01-01T00:00:00.000Z',
    unlockPolicy: over.unlockPolicy,
  }
}

function task(over: Partial<Task> & { id: string }): Task {
  return {
    id: over.id,
    title: over.title ?? 'T',
    linkedObjectiveId: over.linkedObjectiveId ?? null,
    deadline: '2026-12-31',
    level: 5,
    degradationPool: 0,
    totalDegradation: 0,
    status: over.status ?? 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    unlockPolicy: over.unlockPolicy,
  }
}

function block(over: Partial<PlacedBlock> & { id: string }): PlacedBlock {
  return {
    id: over.id,
    date: '2026-05-18',
    startMinute: 0,
    endMinute: 60,
    kind: over.kind ?? 'objective',
    refId: over.refId ?? null,
    linkedTaskId: over.linkedTaskId ?? null,
  }
}

describe('resolveBlockingForBlock', () => {
  it('renvoie null pour un bloc temps libre', () => {
    expect(resolveBlockingForBlock(block({ id: 'b', kind: 'free' }), [], [], [])).toBeNull()
  })

  it('bloque les items non classifiés pendant un bloc objectif', () => {
    const items = [item({ id: 'i1', identifier: 'unknown.com', classified: false })]
    const o = obj({ id: 'o1' })
    const res = resolveBlockingForBlock(block({ id: 'b', kind: 'objective', refId: 'o1' }), items, [o], [])
    expect(res?.blockedSites).toEqual(['unknown.com'])
  })

  it('autorise un item utile pour l objectif en cours', () => {
    const items = [item({ id: 'i1', identifier: 'docs.com', classified: true, usefulFor: { objectives: ['o1'], standaloneTasks: [] } })]
    const o = obj({ id: 'o1' })
    const res = resolveBlockingForBlock(block({ id: 'b', kind: 'objective', refId: 'o1' }), items, [o], [])
    expect(res?.blockedSites).toEqual([])
  })

  it('bloque un item utile pour un AUTRE objectif', () => {
    const items = [item({ id: 'i1', identifier: 'docs.com', classified: true, usefulFor: { objectives: ['o2'], standaloneTasks: [] } })]
    const o1 = obj({ id: 'o1' })
    const o2 = obj({ id: 'o2' })
    const res = resolveBlockingForBlock(block({ id: 'b', kind: 'objective', refId: 'o1' }), items, [o1, o2], [])
    expect(res?.blockedSites).toEqual(['docs.com'])
  })

  it('bloque un item démontré même s il est dans usefulFor', () => {
    const items = [item({ id: 'i1', identifier: 'demoted.com', classified: true, demoted: true, usefulFor: { objectives: ['o1'], standaloneTasks: [] } })]
    const o = obj({ id: 'o1' })
    const res = resolveBlockingForBlock(block({ id: 'b', kind: 'objective', refId: 'o1' }), items, [o], [])
    expect(res?.blockedSites).toEqual(['demoted.com'])
  })

  it('utilise l unlockPolicy de l objectif', () => {
    const o = obj({ id: 'o1', unlockPolicy: { type: 'cooldown', minutes: 10 } })
    const res = resolveBlockingForBlock(block({ id: 'b', kind: 'objective', refId: 'o1' }), [], [o], [])
    expect(res?.unlockPolicy).toEqual({ type: 'cooldown', minutes: 10 })
  })

  it('ignore une standaloneTask archivée dans usefulFor', () => {
    const t = task({ id: 't1', linkedObjectiveId: null, status: 'history' })
    const items = [item({ id: 'i1', identifier: 'docs.com', classified: true, usefulFor: { objectives: [], standaloneTasks: ['t1'] } })]
    const res = resolveBlockingForBlock(block({ id: 'b', kind: 'task', refId: 't1' }), items, [], [t])
    expect(res?.blockedSites).toEqual(['docs.com'])
  })

  it('renvoie default unlock {type: none} si l objectif n a pas de unlockPolicy', () => {
    const o = obj({ id: 'o1' })
    const res = resolveBlockingForBlock(block({ id: 'b', kind: 'objective', refId: 'o1' }), [], [o], [])
    expect(res?.unlockPolicy).toEqual({ type: 'none' })
  })
})
```

**Step 2 — Run, expect FAIL** (module introuvable).

**Step 3 — Créer `src/renderer/src/lib/blocking-resolver.ts`.**

```ts
import type { Objective, RegistryItem, Task, UnlockPolicy } from '@shared/schemas'
import type { PlacedBlock } from './placement-engine'

export type SessionPayload = {
  blockedSites: string[]
  blockedProcesses: string[]
  blockedNetworkApps: string[]
  unlockPolicy: UnlockPolicy
  /** Label à utiliser dans les notifications (« Maths commence »). */
  label: string
}

const DEFAULT_UNLOCK: UnlockPolicy = { type: 'none' }

/**
 * Résout le payload de session pour un bloc planifié, à partir du registre,
 * des objectifs et des tâches. Renvoie null pour un bloc 'free'.
 *
 * Règles (spec D8) :
 *  - item demoted → bloqué.
 *  - item !classified → bloqué.
 *  - bloc 'objective' O : item bloqué ssi O ∉ usefulFor.objectives.
 *  - bloc 'task' T (autonome) : item bloqué ssi T ∉ usefulFor.standaloneTasks
 *    OU T n'est plus active (status === 'history').
 */
export function resolveBlockingForBlock(
  block: PlacedBlock,
  registry: RegistryItem[],
  objectives: Objective[],
  tasks: Task[],
): SessionPayload | null {
  if (block.kind === 'free' || !block.refId) return null

  const activeStandaloneTaskIds = new Set(
    tasks.filter((t) => t.status === 'active' && t.linkedObjectiveId === null).map((t) => t.id),
  )

  const isUsefulForThisBlock = (item: RegistryItem): boolean => {
    if (!item.classified) return false
    if (item.demoted) return false
    if (block.kind === 'objective') {
      return item.usefulFor.objectives.includes(block.refId!)
    }
    // block.kind === 'task'
    return (
      item.usefulFor.standaloneTasks.includes(block.refId!) &&
      activeStandaloneTaskIds.has(block.refId!)
    )
  }

  const blocked = registry.filter((item) => !isUsefulForThisBlock(item))
  const blockedSites = blocked.filter((i) => i.kind === 'site').map((i) => i.identifier)
  const blockedProcesses = blocked.filter((i) => i.kind === 'app').map((i) => i.identifier)

  let unlockPolicy: UnlockPolicy = DEFAULT_UNLOCK
  let label = 'Bloc'
  if (block.kind === 'objective') {
    const o = objectives.find((x) => x.id === block.refId)
    if (o) {
      unlockPolicy = o.unlockPolicy ?? DEFAULT_UNLOCK
      label = o.name
    }
  } else {
    const t = tasks.find((x) => x.id === block.refId)
    if (t) {
      unlockPolicy = t.unlockPolicy ?? DEFAULT_UNLOCK
      label = t.title
    }
  }

  return {
    blockedSites,
    blockedProcesses,
    blockedNetworkApps: [], // v1.1 : mapper exeName → exePath dans le registre.
    unlockPolicy,
    label,
  }
}
```

**Step 4 — Run, expect PASS** (8 tests).

**Step 5 — Commit.**
```bash
git add src/renderer/src/lib/blocking-resolver.ts src/renderer/src/lib/blocking-resolver.test.ts
git commit -m "feat(distractions): resolver pur du payload de session"
```

---

## Task 4 : Composant `DistractionWarning` (dialog de confirmation D11)

**Step 1 — Créer `src/renderer/src/components/blocking/DistractionWarning.tsx`.**

```tsx
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/cn'

type Props = {
  open: boolean
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Dialog de confirmation avant une action irréversible (classification, demote).
 * Anti-sabotage : l'utilisateur doit lire le warning avant de valider (D11).
 */
export function DistractionWarning({ open, title, message, onConfirm, onCancel }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onCancel}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="max-w-md rounded-xl border border-border-strong bg-bg-elevated p-6 shadow-elevated"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-orange/10 text-orange">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
                <p className="mt-2 text-xs text-text-secondary">{message}</p>
                <p className="mt-3 text-[10px] uppercase tracking-wider text-orange">
                  Cette action est irréversible.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-md border border-border-subtle px-3 py-1.5 text-xs text-text-secondary hover:border-border-strong"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className={cn(
                  'rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white',
                  'hover:bg-accent-hover',
                )}
              >
                Confirmer
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

**Step 2 — Verify gates.** PASS.

**Step 3 — Commit.**
```bash
git add src/renderer/src/components/blocking/DistractionWarning.tsx
git commit -m "feat(distractions): dialog DistractionWarning (anti-sabotage D11)"
```

---

## Task 5 : `ClassificationDialog` (popup immédiat)

**Step 1 — Créer `src/renderer/src/components/blocking/ClassificationDialog.tsx`.**

Le composant affiche :
- Le nom du site/app à classifier.
- Multi-select objectifs (chips cochables).
- Multi-select tâches autonomes (chips cochables).
- Bouton « C'est une distraction » (= classifié, usefulFor vide).
- Bouton « Plus tard » (= ne classifie pas, reste en non-classifiés).
- Au clic « Confirmer », montre d'abord un `<DistractionWarning>`, puis appelle
  `useRegistryStore.classifyItem(...)`.

Squelette (Codex : étoffe avec le markup Tailwind cohérent avec le reste de
l'app, et utilise les patterns existants des autres dialogs de BlockingPage) :

```tsx
import { useState } from 'react'
import { useRegistryStore } from '@/store/registry.store'
import { useLevelsStore } from '@/store/levels.store'
import { useTasksStore } from '@/store/tasks.store'
import { DistractionWarning } from './DistractionWarning'
import type { RegistryItem } from '@shared/schemas'

type Props = {
  item: RegistryItem
  onClose: () => void
}

export function ClassificationDialog({ item, onClose }: Props) {
  const objectives = useLevelsStore((s) => s.objectives)
  const tasks = useTasksStore((s) => s.tasks).filter((t) => t.status === 'active' && t.linkedObjectiveId === null)
  const classifyItem = useRegistryStore((s) => s.classifyItem)

  const [selObjs, setSelObjs] = useState<string[]>([])
  const [selTasks, setSelTasks] = useState<string[]>([])
  const [pendingAction, setPendingAction] = useState<'classify' | 'distraction' | null>(null)

  const handleConfirmClassify = async () => {
    await classifyItem({ itemId: item.id, usefulFor: { objectives: selObjs, standaloneTasks: selTasks } })
    onClose()
  }
  const handleConfirmDistraction = async () => {
    await classifyItem({ itemId: item.id, usefulFor: { objectives: [], standaloneTasks: [] } })
    onClose()
  }

  // … markup : nom, multi-select chips, 3 boutons : « Utile (n sélectionnés) »
  // déclenche pendingAction='classify' ; « Distraction » déclenche
  // pendingAction='distraction' ; « Plus tard » → onClose() sans changer
  // l'item. Confirmation via <DistractionWarning> avant chaque action.

  return (
    <>
      {/* dialog principal — markup à finaliser par Codex */}
      <DistractionWarning
        open={pendingAction === 'classify'}
        title={`Marquer ${item.displayName} comme utile ?`}
        message={`Tu vas marquer ${item.displayName} comme utile pour ${selObjs.length + selTasks.length} item(s). Une fois validé, tu ne pourras plus retirer ces associations — la seule modification possible sera de démontrer l'item en « distraction » plus tard.`}
        onConfirm={handleConfirmClassify}
        onCancel={() => setPendingAction(null)}
      />
      <DistractionWarning
        open={pendingAction === 'distraction'}
        title={`Marquer ${item.displayName} comme distraction ?`}
        message={`Tu vas marquer ${item.displayName} comme une distraction. Il sera bloqué pendant TOUT bloc de travail et tu ne pourras plus jamais le marquer utile.`}
        onConfirm={handleConfirmDistraction}
        onCancel={() => setPendingAction(null)}
      />
    </>
  )
}
```

**Step 2 — Verify gates.**

**Step 3 — Commit.**
```bash
git add src/renderer/src/components/blocking/ClassificationDialog.tsx
git commit -m "feat(distractions): ClassificationDialog (popup immédiat)"
```

---

## Task 6 : `RegistryList` + `UnclassifiedList`

**Step 1 — Créer `src/renderer/src/components/blocking/RegistryList.tsx`.**

Composant paramétré par `kind: 'site' | 'app'` qui rend une liste triée par
`usageCount` desc. Pour chaque item, affiche :
- Nom + identifier.
- Usage (« 12 visites », « 4 h d'usage »).
- Statut courant : « Utile pour : Maths, Programmation » / « Distraction » /
  « Non classifié ».
- Bouton « Modifier » qui ouvre `ClassificationDialog` (n'autorise QUE l'ajout
  d'associations supplémentaires — pas la suppression, anti-sabotage D11).
- Bouton « Démontrer en distraction » (one-way) avec warning, si l'item est
  classifié useful et pas déjà demoted.

**Step 2 — Créer `src/renderer/src/components/blocking/UnclassifiedList.tsx`.**

Filtre les items où `!classified`. Affiche chaque item avec un bouton
« Classifier » qui ouvre le `ClassificationDialog`.

Le badge dans la sidebar (« n nouveaux ») est dérivé d'un sélecteur du store :
`useRegistryStore((s) => s.items.filter((i) => !i.classified).length)`. À
afficher dans `Sidebar.tsx` à côté du lien « Blocage ».

**Step 3 — Verify gates.**

**Step 4 — Commit.**
```bash
git add src/renderer/src/components/blocking/RegistryList.tsx src/renderer/src/components/blocking/UnclassifiedList.tsx src/renderer/src/components/Sidebar.tsx
git commit -m "feat(distractions): RegistryList + UnclassifiedList + badge sidebar"
```

---

## Task 7 : Refonte `BlockingPage`

**Step 1 — Refondre `src/renderer/src/pages/BlockingPage.tsx`.**

Layout final (Codex : suivre les styles existants de la page) :

```tsx
<PageTransition>
  <div className="flex h-full flex-col gap-6 overflow-y-auto px-12 pb-16 pt-16">
    <header>
      <h1 className="text-3xl font-semibold tracking-tight">Blocage</h1>
      <p className="mt-2 text-sm text-text-secondary">
        Centre d'automatisation : Vethos suit tes apps et sites visités, tu les classes, le calendrier déclenche le blocage automatiquement.
      </p>
    </header>

    {/* Bannière statut service — existante */}
    <ServiceStatusBanner />

    {/* Session active — existante */}
    <ActiveSessionPanel />

    {/* Non classifiés */}
    <UnclassifiedList />

    {/* Apps installées (triées par usage) */}
    <section>
      <h2 className="...">Apps installées</h2>
      <RegistryList kind="app" />
    </section>

    {/* Sites suivis */}
    <section>
      <h2 className="...">Sites suivis</h2>
      <RegistryList kind="site" />
    </section>

    {/* Historique des sessions — existant */}
    <HistoryPanel />
  </div>
</PageTransition>
```

Retirer entièrement :
- Le bouton « Nouveau profile ».
- La liste des profils.
- Toute ouverture/mount de `ProfileEditor`.

**Step 2 — Verify gates.** Si des imports deviennent inutilisés, les retirer.

**Step 3 — Commit.**
```bash
git add src/renderer/src/pages/BlockingPage.tsx
git commit -m "feat(distractions): refonte BlockingPage en hub d'automatisation"
```

---

## Task 8 : `UnlockPolicyForm` + intégration éditeurs

**Step 1 — Créer `src/renderer/src/components/blocking/UnlockPolicyForm.tsx`.**

Composant qui édite une `UnlockPolicy` :
- Radio entre `none` / `cooldown` / `justification` / `cooldown_and_justification`.
- Champ minutes (1–60) si cooldown / both.
- Champ minWords (50–500) si justification / both.

**Step 2 — Localiser et modifier l'éditeur d'objectif.**

```bash
grep -rn "ObjectiveEditor\|saveObjective" src/renderer/src/
```

Ajouter une section utilisant `<UnlockPolicyForm value={draft.unlockPolicy} onChange={(unlockPolicy) => setDraft({...draft, unlockPolicy})} />`.

**Step 3 — Pareil pour l'éditeur de tâche** (uniquement les tâches autonomes :
masquer la section si `draft.linkedObjectiveId !== null`, message explicatif :
« Cette tâche hérite de la politique de son objectif »).

**Step 4 — Verify gates.**

**Step 5 — Commit.**
```bash
git add src/renderer/src/components/blocking/UnlockPolicyForm.tsx <éditeurs>
git commit -m "feat(distractions): UnlockPolicyForm + intégration éditeurs"
```

---

## Task 9 : `classificationMode` dans SettingsPage

**Step 1 — Étendre `settings.store.ts`.** Ajouter `classificationMode: 'immediate' | 'batch_3h' | 'batch_1d' | 'batch_1w'` à `SettingsState` + initial state `'immediate'` + buildPayload + load.

**Step 2 — Modifier `SettingsPage.tsx`.** Ajouter une section « Mode de classification » avec 4 boutons radio (immediate par défaut). Sur changement → `updateSettings({ classificationMode: ... })`.

**Step 3 — Verify gates + commit.**
```bash
git add src/renderer/src/store/settings.store.ts src/renderer/src/pages/SettingsPage.tsx
git commit -m "feat(distractions): réglage classificationMode"
```

---

## Task 10 : Câbler la détection automatique au registre

**Préreq :** Bugs 2 et 3 corrigés (sinon les trackers ne renvoient rien).

**Step 1 — Site tracker** : dans `src/main/tracking/site-tracker.ts`, à chaque
détection d'un nouveau domaine, invoquer l'IPC qui appelle
`useRegistryStore.observeItem({ kind: 'site', identifier: domain, displayName: domain })`
puis `incrementUsage(...)` à chaque revisit.

(Côté renderer : exposer une méthode `vethos.tracking.observeSite(domain)` qui
réémet vers le store ; ou alors le tracker écrit directement dans le storage
`'registry'` côté main, et le store recharge.)

**Step 2 — App tracker** : dans `app-usage-tracker.ts`, pareil pour les apps.

**Step 3 — Décision sur le mode immédiat** : si `classificationMode === 'immediate'`
et qu'un nouvel item est ajouté au registre, ouvrir automatiquement
`ClassificationDialog` côté renderer (déclencher via un event store ou un
listener du registre). Sinon (mode batch), l'item reste dans la
`UnclassifiedList`.

**Step 4 — Verify gates + smoke test manuel.**

**Step 5 — Commit.**
```bash
git add src/main/tracking/<files>
git commit -m "feat(distractions): câble les trackers au registre"
```

---

## À surveiller

- Les éditeurs d'objectif/tâche n'ont pas leurs chemins exacts dans cette
  spec (codebase pas exhaustivement exploré côté Couche 2). Codex doit
  grep et adapter.
- Le câblage du popup immédiat (Task 10 Step 3) demande un mécanisme
  event-driven entre le registre et l'UI. Possibilités : Zustand subscribe,
  EventBus, ou simple polling sur les changements du store. Choix
  d'implémentation laissé à Codex.
- Le mapping `exeName` → `exePath` (pour blockedNetworkApps) est laissé v1.1.
  Pour l'instant `blockedNetworkApps: []` dans le resolver.
- Smoke test final : sans le service P16 fonctionnel (bug 1), tu peux quand
  même tester la classification, le registre, l'UI. La session de blocage
  réelle attendra Couche 3.
