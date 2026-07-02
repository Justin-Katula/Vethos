import { describe, it, expect } from 'vitest'
import type { Objective, Task, RegistryItem } from '@shared/schemas'
import type { PlacedBlock } from './placement-engine'
import { resolveBlockingForBlock } from './blocking-resolver'

function item(over: Partial<RegistryItem> & { id: string; identifier: string }): RegistryItem {
  return {
    id: over.id,
    kind: over.kind ?? 'site',
    identifier: over.identifier,
    executableName: over.executableName,
    blockable: over.blockable,
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
    status: over.status ?? 'active',
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
    status: over.status ?? 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    unlockPolicy: over.unlockPolicy,
  }
}

function block(over: Partial<PlacedBlock> & { id: string }): PlacedBlock {
  return {
    id: over.id,
    date: over.date ?? '2026-05-18',
    startMinute: over.startMinute ?? 0,
    endMinute: over.endMinute ?? 60,
    kind: over.kind ?? 'objective',
    refKind: over.refKind ?? over.kind ?? 'objective',
    refId: over.refId ?? null,
    label: over.label ?? 'B',
    locked: over.locked ?? true,
    linkedTaskId: over.linkedTaskId ?? null,
    linkedTaskIds: over.linkedTaskIds ?? [],
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

  it('utilise la vraie cible exécutable et ignore les apps non blocables', () => {
    const items = [
      item({
        id: 'app-1',
        kind: 'app',
        identifier: 'installed:winget:Mon application',
        executableName: 'real-app.exe',
        blockable: true,
      }),
      item({
        id: 'app-2',
        kind: 'app',
        identifier: 'installed:uwp:Application sans cible',
        blockable: false,
      }),
      item({
        id: 'app-3',
        kind: 'app',
        identifier: 'installed:shortcut:Autre façade',
        executableName: 'real-app.exe',
        blockable: true,
      }),
    ]
    const o = obj({ id: 'o1' })
    const res = resolveBlockingForBlock(
      block({ id: 'b', kind: 'objective', refId: 'o1' }),
      items,
      [o],
      [],
    )

    expect(res?.blockedProcesses).toEqual(['real-app.exe'])
  })

  it('autorise un item utile pour l objectif en cours', () => {
    const items = [
      item({
        id: 'i1',
        identifier: 'docs.com',
        classified: true,
        usefulFor: { objectives: ['o1'], standaloneTasks: [] },
      }),
    ]
    const o = obj({ id: 'o1' })
    const res = resolveBlockingForBlock(block({ id: 'b', kind: 'objective', refId: 'o1' }), items, [o], [])
    expect(res?.blockedSites).toEqual([])
  })

  it('bloque un item utile pour un AUTRE objectif', () => {
    const items = [
      item({
        id: 'i1',
        identifier: 'docs.com',
        classified: true,
        usefulFor: { objectives: ['o2'], standaloneTasks: [] },
      }),
    ]
    const o1 = obj({ id: 'o1' })
    const o2 = obj({ id: 'o2' })
    const res = resolveBlockingForBlock(
      block({ id: 'b', kind: 'objective', refId: 'o1' }),
      items,
      [o1, o2],
      [],
    )
    expect(res?.blockedSites).toEqual(['docs.com'])
  })

  it('bloque un item démontré même s il est dans usefulFor', () => {
    const items = [
      item({
        id: 'i1',
        identifier: 'demoted.com',
        classified: true,
        demoted: true,
        usefulFor: { objectives: ['o1'], standaloneTasks: [] },
      }),
    ]
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
    const t = task({ id: 't1', linkedObjectiveId: null, status: 'completed' })
    const items = [
      item({
        id: 'i1',
        identifier: 'docs.com',
        classified: true,
        usefulFor: { objectives: [], standaloneTasks: ['t1'] },
      }),
    ]
    const res = resolveBlockingForBlock(block({ id: 'b', kind: 'task', refId: 't1' }), items, [], [t])
    expect(res?.blockedSites).toEqual(['docs.com'])
  })

  it('renvoie default unlock {type: none} si l objectif n a pas de unlockPolicy', () => {
    const o = obj({ id: 'o1' })
    const res = resolveBlockingForBlock(block({ id: 'b', kind: 'objective', refId: 'o1' }), [], [o], [])
    expect(res?.unlockPolicy).toEqual({ type: 'none' })
  })
})
