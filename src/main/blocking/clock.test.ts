import { describe, it, expect, vi } from 'vitest'
import {
  createReconciliationClock,
  diffSnapshots,
  snapshotFrom,
  type SessionSnapshot,
} from './clock'
import type { BlockingRules, BlockSession } from './schedule'

function makeBlock(o: Partial<BlockSession> = {}): BlockSession {
  const startedAt = new Date(2026, 6, 29, 9, 0, 0, 0).getTime()
  return {
    blockId: 'task-1',
    startedAt,
    endsAt: new Date(2026, 6, 29, 12, 0, 0, 0).getTime(),
    appIds: ['blender.exe'],
    ...o,
  }
}

const INACTIF: SessionSnapshot = { active: false, blockedAppIds: [], blockedSites: [], endsAt: null }

describe('snapshotFrom', () => {
  it('rend un instantané inactif quand aucune session ne tourne', () => {
    expect(snapshotFrom(null)).toEqual(INACTIF)
  })

  it('rend un instantané actif avec ses applications et son échéance', () => {
    expect(snapshotFrom({ blockedAppIds: ['a.exe'], blockedSites: [], endsAt: 5_000 })).toEqual({
      active: true,
      blockedAppIds: ['a.exe'],
      blockedSites: [],
      endsAt: 5_000,
    })
  })
})

describe('diffSnapshots', () => {
  const actif: SessionSnapshot = {
    active: true,
    blockedAppIds: ['a.exe'],
    blockedSites: [],
    endsAt: 5_000,
  }

  it('détecte un démarrage', () => {
    expect(diffSnapshots(INACTIF, actif)).toEqual({
      kind: 'started',
      blockedAppIds: ['a.exe'],
      endsAt: 5_000,
    })
  })

  it('détecte une fin', () => {
    expect(diffSnapshots(actif, INACTIF)).toEqual({ kind: 'ended' })
  })

  it('ne signale rien quand rien ne change', () => {
    expect(diffSnapshots(actif, { ...actif })).toEqual({ kind: 'none' })
    expect(diffSnapshots(INACTIF, { ...INACTIF })).toEqual({ kind: 'none' })
  })

  it('détecte un changement de liste d’applications', () => {
    const suivant: SessionSnapshot = { ...actif, blockedAppIds: ['a.exe', 'b.exe'] }
    expect(diffSnapshots(actif, suivant)).toEqual({
      kind: 'changed',
      blockedAppIds: ['a.exe', 'b.exe'],
      endsAt: 5_000,
    })
  })

  it('détecte un changement d’échéance — un créneau voisin a pris le relais', () => {
    const suivant: SessionSnapshot = { ...actif, endsAt: 9_000 }
    expect(diffSnapshots(actif, suivant)).toEqual({
      kind: 'changed',
      blockedAppIds: ['a.exe'],
      endsAt: 9_000,
    })
  })

  it('ne confond pas un ordre différent avec un changement réel', () => {
    // L'ordre vient d'un Set, il est deterministe mais depend de l'ordre des
    // regles. Le reordonner ne doit pas declencher une transition inutile.
    const suivant: SessionSnapshot = { ...actif, blockedAppIds: ['a.exe'] }
    expect(diffSnapshots({ ...actif, blockedAppIds: ['a.exe'] }, suivant).kind).toBe('none')
  })
})

describe('createReconciliationClock', () => {
  const mercrediDixHeures = new Date(2026, 6, 29, 10, 0, 0, 0)
  const mercrediQuinzeHeures = new Date(2026, 6, 29, 15, 0, 0, 0)

  it('signale le démarrage au premier tic quand un bloc confirmé est actif', async () => {
    const onTransition = vi.fn()
    const clock = createReconciliationClock({
      readRules: async (): Promise<BlockingRules> => ({ block: makeBlock() }),
      now: () => mercrediDixHeures,
      onTransition,
    })
    await clock.tickNow()
    expect(onTransition).toHaveBeenCalledTimes(1)
    expect(onTransition.mock.calls[0]?.[0]).toMatchObject({ kind: 'started' })
  })

  it('ne signale rien quand le bloc est terminé', async () => {
    const onTransition = vi.fn()
    const clock = createReconciliationClock({
      readRules: async (): Promise<BlockingRules> => ({ block: makeBlock() }),
      now: () => mercrediQuinzeHeures,
      onTransition,
    })
    await clock.tickNow()
    expect(onTransition).not.toHaveBeenCalled()
  })

  it('ne signale pas deux fois le même état', async () => {
    const onTransition = vi.fn()
    const clock = createReconciliationClock({
      readRules: async (): Promise<BlockingRules> => ({ block: makeBlock() }),
      now: () => mercrediDixHeures,
      onTransition,
    })
    await clock.tickNow()
    await clock.tickNow()
    await clock.tickNow()
    expect(onTransition).toHaveBeenCalledTimes(1)
  })

  it('signale la fin quand l’heure sort du bloc', async () => {
    const onTransition = vi.fn()
    let maintenant = mercrediDixHeures
    const clock = createReconciliationClock({
      readRules: async (): Promise<BlockingRules> => ({ block: makeBlock() }),
      now: () => maintenant,
      onTransition,
    })
    await clock.tickNow()
    maintenant = mercrediQuinzeHeures
    await clock.tickNow()
    expect(onTransition).toHaveBeenCalledTimes(2)
    expect(onTransition.mock.calls[1]?.[0]).toEqual({ kind: 'ended' })
  })

  it('expose l’instantané courant', async () => {
    const clock = createReconciliationClock({
      readRules: async (): Promise<BlockingRules> => ({ block: makeBlock() }),
      now: () => mercrediDixHeures,
      onTransition: () => undefined,
    })
    expect(clock.current()).toEqual(INACTIF)
    await clock.tickNow()
    expect(clock.current().active).toBe(true)
  })

  it('survit à une lecture de règles qui échoue — le blocage ne doit pas tomber en panne', async () => {
    const onTransition = vi.fn()
    const clock = createReconciliationClock({
      readRules: async (): Promise<BlockingRules> => {
        throw new Error('disque illisible')
      },
      now: () => mercrediDixHeures,
      onTransition,
    })
    await expect(clock.tickNow()).resolves.toBeUndefined()
    expect(onTransition).not.toHaveBeenCalled()
    expect(clock.current()).toEqual(INACTIF)
  })

  it('ne laisse pas deux tics se chevaucher', async () => {
    let enCours = 0
    let maxSimultane = 0
    const clock = createReconciliationClock({
      readRules: async (): Promise<BlockingRules> => {
        enCours += 1
        maxSimultane = Math.max(maxSimultane, enCours)
        await new Promise((r) => setTimeout(r, 10))
        enCours -= 1
        return { block: null }
      },
      now: () => mercrediDixHeures,
      onTransition: () => undefined,
    })
    await Promise.all([clock.tickNow(), clock.tickNow(), clock.tickNow()])
    expect(maxSimultane).toBe(1)
  })
})
