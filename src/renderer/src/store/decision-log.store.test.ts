import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(async () => ({ ok: true as const })),
}))
vi.mock('@/lib/ipc', () => ({ vethos: { storage: mocks } }))

import { useDecisionLogStore } from './decision-log.store'

describe('decision log store', () => {
  beforeEach(() => {
    mocks.read.mockReset().mockResolvedValue({ entries: [] })
    mocks.write.mockClear()
    useDecisionLogStore.getState().reset()
    useDecisionLogStore.getState().setUserId('user-1')
  })

  it('persiste, nettoie les URLs et déduplique une décision identique', async () => {
    const input = {
      type: 'placement' as const,
      targetType: 'planning_block' as const,
      targetId: 'block-1',
      placementResult: {
        blockId: 'block-1', blockStart: '2026-07-02T10:00:00', blockEnd: '2026-07-02T11:00:00',
        durationMinutes: 60, placementQuality: 'good' as const, placementScore: 78,
        reasons: ['Voir https://example.test/private?token=secret'], warnings: [],
      },
    }
    await useDecisionLogStore.getState().record(input)
    await useDecisionLogStore.getState().record(input)
    expect(useDecisionLogStore.getState().entries).toHaveLength(1)
    expect(useDecisionLogStore.getState().entries[0]?.placementResult?.reasons[0]).toBe('Voir example.test')
    expect(mocks.write).toHaveBeenCalled()
  })
})
