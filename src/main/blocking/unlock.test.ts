import { describe, it, expect } from 'vitest'
import {
  grantUnlock,
  isUnlocked,
  pruneExpired,
  unlockDurationMs,
  UNLOCK_MS_DEV,
  UNLOCK_MS_PROD,
  type Unlock,
} from './unlock'

describe('unlockDurationMs', () => {
  it('vaut exactement 10 minutes en production', () => {
    expect(UNLOCK_MS_PROD).toBe(600_000)
    expect(unlockDurationMs(true)).toBe(600_000)
  })

  it('vaut exactement 30 secondes en développement', () => {
    expect(UNLOCK_MS_DEV).toBe(30_000)
    expect(unlockDurationMs(false)).toBe(30_000)
  })
})

describe('grantUnlock', () => {
  it("fixe l'échéance à maintenant plus la durée", () => {
    expect(grantUnlock('blender.exe', 1_000_000, true)).toEqual({
      appId: 'blender.exe',
      until: 1_600_000,
    })
  })

  it('utilise la durée courte en développement', () => {
    expect(grantUnlock('blender.exe', 1_000_000, false).until).toBe(1_030_000)
  })

  it("ne cumule jamais : un second octroi repart de maintenant, pas de l'échéance précédente", () => {
    // Le piege que la spec interdit explicitement. Si l'implementation faisait
    // `precedent.until + duree`, on obtiendrait 2_200_000 et l'utilisateur
    // pourrait prolonger indefiniment en re-soumettant.
    const premier = grantUnlock('blender.exe', 1_000_000, true)
    expect(premier.until).toBe(1_600_000)
    const second = grantUnlock('blender.exe', 1_100_000, true)
    expect(second.until).toBe(1_700_000)
    expect(second.until - 1_100_000).toBe(UNLOCK_MS_PROD)
  })

  it('ne dépasse jamais 10 minutes, quel que soit le moment', () => {
    for (const now of [0, 1, 999_999_999, Date.now()]) {
      const unlock = grantUnlock('x.exe', now, true)
      expect(unlock.until - now).toBe(UNLOCK_MS_PROD)
      expect(unlock.until - now).toBeLessThanOrEqual(600_000)
    }
  })
})

describe('isUnlocked', () => {
  const unlock: Unlock = { appId: 'blender.exe', until: 1_600_000 }

  it('est vrai avant échéance', () => {
    expect(isUnlocked(unlock, 1_599_999)).toBe(true)
  })

  it("est faux à l'échéance exacte — reblocage immédiat, pas de tolérance", () => {
    expect(isUnlocked(unlock, 1_600_000)).toBe(false)
  })

  it('est faux après échéance', () => {
    expect(isUnlocked(unlock, 1_600_001)).toBe(false)
  })

  it('est faux quand aucun déblocage n’existe', () => {
    expect(isUnlocked(undefined, 0)).toBe(false)
  })
})

describe('pruneExpired', () => {
  it('ne garde que les déblocages encore actifs', () => {
    const unlocks: Unlock[] = [
      { appId: 'a.exe', until: 500 },
      { appId: 'b.exe', until: 1_500 },
      { appId: 'c.exe', until: 1_000 },
    ]
    expect(pruneExpired(unlocks, 1_000).map((u) => u.appId)).toEqual(['b.exe'])
  })

  it('ne modifie pas le tableau reçu', () => {
    const unlocks: Unlock[] = [{ appId: 'a.exe', until: 500 }]
    pruneExpired(unlocks, 1_000)
    expect(unlocks).toHaveLength(1)
  })

  it('gère une liste vide', () => {
    expect(pruneExpired([], 1_000)).toEqual([])
  })
})
