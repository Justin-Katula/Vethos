# Couche 2 — Jeux de distractions : plan d'implémentation

> Reference spec : `docs/superpowers/specs/2026-05-18-nexus-distraction-sets-design.md`
> Préreq : Partie B (UI calendrier) mergée.

**Goal :** Mettre les distractions sur les objectifs et tâches, retirer
l'éditeur de profils autonomes, fournir le resolver pur.

**Architecture :** Schéma + champs optionnels sur Objective/Task ; resolver pur
testé unitairement ; composant `DistractionSetForm` ré-utilisable extrait du
`ProfileEditor` ; éditeurs d'objectif et de tâche gagnent une section ;
BlockingPage passe en passif.

**Tech Stack :** TypeScript, React 18, Zod, Vitest.

**Branche suggérée :** `nexus-distraction-sets` depuis `master`.

---

## Files

**Create :**
- `src/renderer/src/lib/distraction-resolver.ts`
- `src/renderer/src/lib/distraction-resolver.test.ts`
- `src/renderer/src/components/blocking/DistractionSetForm.tsx`

**Modify :**
- `src/shared/schemas.ts`
- `src/renderer/src/components/blocking/ProfileEditor.tsx`
- L'éditeur d'objectif (à localiser via grep : `ObjectiveEditor`, `saveObjective`)
- L'éditeur de tâche (à localiser de même)
- `src/renderer/src/pages/BlockingPage.tsx`

Aucun `git add -A`.

---

## Task 1 : Schéma — `DistractionSet` + champs sur Objective/Task

**Step 1 — Modifier `src/shared/schemas.ts`.** Juste après `BlockingProfileSchema`,
ajouter :

```ts
export const DistractionSetSchema = z.object({
  blockedSites: z.array(z.string().regex(DOMAIN_REGEX)),
  blockedProcesses: z.array(z.string().regex(EXE_NAME_REGEX)),
  blockedNetworkApps: z.array(z.string()),
  unlockPolicy: z.discriminatedUnion('type', [
    z.object({ type: z.literal('none') }),
    z.object({ type: z.literal('cooldown'), minutes: z.number().int().min(1).max(60) }),
    z.object({ type: z.literal('justification'), minWords: z.number().int().min(50).max(500) }),
    z.object({
      type: z.literal('cooldown_and_justification'),
      minutes: z.number().int().min(1).max(60),
      minWords: z.number().int().min(50).max(500),
    }),
  ]),
})
export type DistractionSet = z.infer<typeof DistractionSetSchema>
```

Dans `ObjectiveSchema`, juste avant la ligne `createdAt:`, ajouter :
```ts
  distractions: DistractionSetSchema.optional(),
```

Dans `TaskSchema`, juste avant la ligne `createdAt:`, ajouter :
```ts
  distractionsOverride: DistractionSetSchema.optional(),
```

**Step 2 — Verify.** `npm run typecheck && npm run lint && npm run test` → PASS.

**Step 3 — Commit.**
```bash
git add src/shared/schemas.ts
git commit -m "feat(distractions): schéma DistractionSet sur Objective et Task"
```

---

## Task 2 : Resolver pur `resolveDistractions` (TDD)

**Step 1 — Test qui échoue.** Créer `src/renderer/src/lib/distraction-resolver.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import type { Task, Objective } from '@shared/schemas'
import type { PlacedBlock } from '@/lib/placement-engine'
import { resolveDistractions } from './distraction-resolver'

const sampleSet = {
  blockedSites: ['example.com'],
  blockedProcesses: [],
  blockedNetworkApps: [],
  unlockPolicy: { type: 'none' as const },
}

function makeTask(over: Partial<Task> & { id: string }): Task {
  return {
    id: over.id,
    title: over.title ?? 'T',
    linkedObjectiveId: over.linkedObjectiveId ?? null,
    deadline: '2026-12-31',
    level: 5,
    degradationPool: 0,
    totalDegradation: 0,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    distractionsOverride: over.distractionsOverride,
  }
}
function makeObjective(over: Partial<Objective> & { id: string }): Objective {
  return {
    id: over.id,
    name: over.name ?? 'O',
    color: '#000000',
    linkedRuleIds: [],
    level: 5,
    createdAt: '2026-01-01T00:00:00.000Z',
    distractions: over.distractions,
  }
}
function block(over: Partial<PlacedBlock> & { id: string }): PlacedBlock {
  return {
    id: over.id,
    date: over.date ?? '2026-05-18',
    startMinute: 0,
    endMinute: 60,
    kind: over.kind ?? 'task',
    refId: over.refId ?? null,
    linkedTaskId: over.linkedTaskId ?? null,
  }
}

describe('resolveDistractions', () => {
  it('renvoie null pour un bloc temps libre', () => {
    expect(resolveDistractions(block({ id: 'b', kind: 'free' }), [], [])).toBeNull()
  })

  it('renvoie l override d une tâche autonome', () => {
    const t = makeTask({ id: 't1', linkedObjectiveId: null, distractionsOverride: sampleSet })
    expect(resolveDistractions(block({ id: 'b', kind: 'task', refId: 't1' }), [t], [])).toEqual(sampleSet)
  })

  it('renvoie null pour une tâche autonome sans override', () => {
    const t = makeTask({ id: 't1', linkedObjectiveId: null })
    expect(resolveDistractions(block({ id: 'b', kind: 'task', refId: 't1' }), [t], [])).toBeNull()
  })

  it('renvoie les distractions de l objectif d un bloc objective', () => {
    const o = makeObjective({ id: 'o1', distractions: sampleSet })
    expect(resolveDistractions(block({ id: 'b', kind: 'objective', refId: 'o1' }), [], [o])).toEqual(sampleSet)
  })

  it('un override de tâche liée écrase les distractions de son objectif', () => {
    const o = makeObjective({ id: 'o1', distractions: { ...sampleSet, blockedSites: ['obj.com'] } })
    const t = makeTask({
      id: 't1',
      linkedObjectiveId: 'o1',
      distractionsOverride: { ...sampleSet, blockedSites: ['task.com'] },
    })
    const res = resolveDistractions(
      block({ id: 'b', kind: 'objective', refId: 'o1', linkedTaskId: 't1' }),
      [t],
      [o],
    )
    expect(res?.blockedSites).toEqual(['task.com'])
  })
})
```

**Step 2 — Run, expect FAIL** (module introuvable).

**Step 3 — Implémenter.** Créer `src/renderer/src/lib/distraction-resolver.ts` :

```ts
import type { Objective, Task, DistractionSet } from '@shared/schemas'
import type { PlacedBlock } from './placement-engine'

/**
 * Résout les distractions à appliquer à un bloc placé.
 *  - 'free'      → null (pas de blocage).
 *  - 'task'      → l'override de la tâche s'il existe, sinon null.
 *                  (Note : le moteur ne place pas de bloc 'task' pour une
 *                  tâche liée — celles-ci sont absorbées dans l'objectif.)
 *  - 'objective' → l'override de la `linkedTaskId` si présente et défini,
 *                  sinon les distractions de l'objectif, sinon null.
 */
export function resolveDistractions(
  block: PlacedBlock,
  tasks: Task[],
  objectives: Objective[],
): DistractionSet | null {
  if (block.kind === 'free') return null
  if (block.kind === 'task') {
    if (!block.refId) return null
    const task = tasks.find((t) => t.id === block.refId)
    return task?.distractionsOverride ?? null
  }
  // kind === 'objective'
  if (!block.refId) return null
  if (block.linkedTaskId) {
    const linked = tasks.find((t) => t.id === block.linkedTaskId)
    if (linked?.distractionsOverride) return linked.distractionsOverride
  }
  const obj = objectives.find((o) => o.id === block.refId)
  return obj?.distractions ?? null
}
```

**Step 4 — Run, expect PASS** (5 tests).

**Step 5 — Commit.**
```bash
git add src/renderer/src/lib/distraction-resolver.ts src/renderer/src/lib/distraction-resolver.test.ts
git commit -m "feat(distractions): resolver pur des distractions d'un bloc"
```

---

## Task 3 : Extraire `DistractionSetForm` de `ProfileEditor`

**Step 1 — Lire `src/renderer/src/components/blocking/ProfileEditor.tsx`** pour
repérer la portion du JSX qui édite les champs `blockedSites`,
`blockedProcesses`, `blockedNetworkApps`, `unlockPolicy`.

**Step 2 — Créer `src/renderer/src/components/blocking/DistractionSetForm.tsx`** :

```tsx
import { useState } from 'react'
import type { DistractionSet } from '@shared/schemas'

type Props = {
  value: DistractionSet | undefined
  onChange: (next: DistractionSet | undefined) => void
}

const EMPTY: DistractionSet = {
  blockedSites: [],
  blockedProcesses: [],
  blockedNetworkApps: [],
  unlockPolicy: { type: 'none' },
}

export function DistractionSetForm({ value, onChange }: Props) {
  if (!value) {
    return (
      <button
        type="button"
        onClick={() => onChange(EMPTY)}
        className="rounded-md border border-border-subtle bg-bg-card px-3 py-1.5 text-xs text-text-secondary hover:border-border-strong"
      >
        Ajouter des distractions
      </button>
    )
  }

  // Reprendre ici les sections JSX du ProfileEditor pour :
  //   - blockedSites (champ + bouton add ; suggestion auto si scan ok)
  //   - blockedProcesses (champ + scan d'apps si dispo)
  //   - blockedNetworkApps (sélecteur fichier)
  //   - unlockPolicy (radio + champs conditionnels)
  // En remplaçant chaque setter de Profile par `onChange({ ...value, <field>: <newVal> })`.
  // Bouton « Retirer » → onChange(undefined).
  // ⚠️ Codex : copie exactement le markup/styles existants ; ne réinvente pas.

  return (
    <div className="space-y-4">
      {/* TODO Codex : insérer ici le markup adapté de ProfileEditor */}
      <button
        type="button"
        onClick={() => onChange(undefined)}
        className="text-[10px] text-red-400 hover:underline"
      >
        Retirer les distractions
      </button>
    </div>
  )
}
```

**Note Codex :** ce TODO n'est pas un placeholder du plan — c'est une
instruction explicite pour toi : **transcris le markup existant** des 4
sections du `ProfileEditor` ici, en l'adaptant aux props `value` / `onChange`.
Pas de réinvention.

**Step 3 — Adapter `ProfileEditor.tsx`** pour utiliser `<DistractionSetForm>`
en interne (le profile garde son `id` / `name` autour, mais le formulaire
interne devient le composant extrait).

**Step 4 — Verify.** typecheck + lint + tests verts. Aucun changement visible
côté BlockingPage à ce stade.

**Step 5 — Commit.**
```bash
git add src/renderer/src/components/blocking/DistractionSetForm.tsx src/renderer/src/components/blocking/ProfileEditor.tsx
git commit -m "refactor(distractions): extraire DistractionSetForm de ProfileEditor"
```

---

## Task 4 : Section Distractions dans l'éditeur d'objectif

**Step 1 — Localiser l'éditeur.** Lance :
```bash
grep -rn "ObjectiveEditor\|EditObjective\|saveObjective" src/renderer/src/
```
Si plusieurs candidats : choisir le composant qui rend les champs d'objectif
(nom, couleur, deadline, level).

**Step 2 — Importer le composant.**
```ts
import { DistractionSetForm } from '@/components/blocking/DistractionSetForm'
import type { DistractionSet } from '@shared/schemas'
```

**Step 3 — Ajouter la section.** Sous les champs existants de l'objectif :

```tsx
<section className="space-y-2">
  <h3 className="text-xs font-medium uppercase tracking-wider text-text-muted">
    Distractions
  </h3>
  <p className="text-[10px] text-text-muted">
    Sites et applications à bloquer pendant les créneaux de cet objectif.
  </p>
  <DistractionSetForm
    value={draft.distractions}
    onChange={(distractions) => setDraft({ ...draft, distractions })}
  />
</section>
```

(`draft` = le state local de l'éditeur. Adapter au nommage réel.)

**Step 4 — Verify.** typecheck + lint + tests verts. Smoke test manuel
recommandé.

**Step 5 — Commit.**
```bash
git add <chemin de l éditeur d objectif>
git commit -m "feat(distractions): section Distractions dans l'éditeur d'objectif"
```

---

## Task 5 : Toggle « Surcharger les distractions » dans l'éditeur de tâche

**Step 1 — Localiser l'éditeur de tâche.**
```bash
grep -rn "TaskEditor\|EditTask\|saveTask" src/renderer/src/
```

**Step 2 — Importer le composant.**
```ts
import { DistractionSetForm } from '@/components/blocking/DistractionSetForm'
```

**Step 3 — Ajouter la section.**

```tsx
<section className="space-y-2">
  <h3 className="text-xs font-medium uppercase tracking-wider text-text-muted">
    Distractions spécifiques
  </h3>
  <p className="text-[10px] text-text-muted">
    {draft.linkedObjectiveId
      ? 'Surcharge celles de l objectif lié pour cette tâche seulement.'
      : 'Liste de sites/apps à bloquer quand cette tâche est planifiée.'}
  </p>
  <DistractionSetForm
    value={draft.distractionsOverride}
    onChange={(distractionsOverride) => setDraft({ ...draft, distractionsOverride })}
  />
</section>
```

**Step 4 — Verify.** typecheck + lint + tests verts.

**Step 5 — Commit.**
```bash
git add <chemin de l éditeur de tâche>
git commit -m "feat(distractions): override des distractions par tâche"
```

---

## Task 6 : `BlockingPage` passe en passif

**Step 1 — Modifier `src/renderer/src/pages/BlockingPage.tsx`.** Retirer :
- Le bouton « Nouveau profile ».
- La liste des profils.
- L'ouverture / mount de `ProfileEditor`.

Garder :
- La bannière de statut du service (existante, P16).
- L'affichage de la session active (s'il y en a une).
- L'historique des sessions.

Si la page devient quasi vide, ajouter un court paragraphe explicatif :
« Le blocage suit ton calendrier vivant — il s'active automatiquement
quand un bloc commence. Configure les distractions par objectif et par tâche
dans leurs éditeurs respectifs. »

**Step 2 — Verify.** typecheck + lint + tests verts. Si l'import de
`ProfileEditor` devient inutilisé, le retirer.

**Step 3 — Commit.**
```bash
git add src/renderer/src/pages/BlockingPage.tsx
git commit -m "feat(distractions): BlockingPage devient passive"
```

---

## Couverture spec → tâches

- D1 (où vivent les distractions) → Task 1.
- D2 (forme `DistractionSet`) → Task 1.
- D3 (`BlockingProfile` reste pour le service) → aucune action requise (la
  couche 3 compilera à la volée).
- D4 (resolver) → Task 2.
- D5 (UI) → Tasks 3, 4, 5, 6.
- D6 (migration) → aucune (rien à migrer).

---

## À surveiller

- Si l'éditeur d'objectif ou de tâche est gros et tangled, **ne pas
  restructurer** au-delà du strict nécessaire. Ajouter la section, c'est tout.
- Si le scan d'apps reste cassé (bug 2), l'UX d'ajout d'apps reste manuelle —
  fonctionnelle mais inconfortable.
- Si la couche 2 livrée révèle un modèle qui ne convient pas à l'utilisateur,
  c'est le prix de la spec non brainstormée. Le code reste localisé (3
  fichiers principaux + un composant) → refactor à coût modéré.
