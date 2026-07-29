import { describe, it, expect } from 'vitest'
import {
  activeSessionAt,
  minutesSinceMidnight,
  slotIsActiveAt,
  type BlockingRules,
  type RecurringSlot,
} from './schedule'

function makeSlot(overrides: Partial<RecurringSlot> = {}): RecurringSlot {
  return {
    id: 's1',
    label: 'Matin',
    daysOfWeek: [1, 2, 3, 4, 5],
    startMinute: 9 * 60,
    endMinute: 12 * 60,
    appIds: ['blender.exe'],
    ...overrides,
  }
}

// 2026-07-29 est un mercredi (jour 3).
const mercredi = (h: number, m = 0): Date => new Date(2026, 6, 29, h, m, 0, 0)
const dimanche = (h: number, m = 0): Date => new Date(2026, 7, 2, h, m, 0, 0)

describe('minutesSinceMidnight', () => {
  it('compte les minutes depuis minuit', () => {
    expect(minutesSinceMidnight(mercredi(0, 0))).toBe(0)
    expect(minutesSinceMidnight(mercredi(9, 30))).toBe(570)
    expect(minutesSinceMidnight(mercredi(23, 59))).toBe(1439)
  })
})

describe('slotIsActiveAt', () => {
  it('est actif pendant le créneau, un jour concerné', () => {
    expect(slotIsActiveAt(makeSlot(), mercredi(10))).toBe(true)
  })

  it('est actif à la minute de début', () => {
    expect(slotIsActiveAt(makeSlot(), mercredi(9, 0))).toBe(true)
  })

  it("n'est plus actif à la minute de fin — bornes semi-ouvertes", () => {
    expect(slotIsActiveAt(makeSlot(), mercredi(12, 0))).toBe(false)
  })

  it('est inactif avant le créneau', () => {
    expect(slotIsActiveAt(makeSlot(), mercredi(8, 59))).toBe(false)
  })

  it('est inactif un jour non concerné', () => {
    expect(slotIsActiveAt(makeSlot(), dimanche(10))).toBe(false)
  })

  it('gère un créneau qui franchit minuit — soirée', () => {
    // 22h00 -> 02h00 : actif mercredi soir ET aux petites heures.
    const nuit = makeSlot({ startMinute: 22 * 60, endMinute: 2 * 60, daysOfWeek: [3] })
    expect(slotIsActiveAt(nuit, mercredi(23, 0))).toBe(true)
    expect(slotIsActiveAt(nuit, mercredi(1, 0))).toBe(true)
    expect(slotIsActiveAt(nuit, mercredi(12, 0))).toBe(false)
  })

  it('gère un créneau sans jour — jamais actif', () => {
    expect(slotIsActiveAt(makeSlot({ daysOfWeek: [] }), mercredi(10))).toBe(false)
  })
})

describe('créneaux mal formés — échec du côté sûr', () => {
  // Deux bugs trouves par sondage : ils produisaient un blocage silencieux
  // qu'aucun element d'interface n'aurait permis de relier a sa cause.
  const dixHeures = new Date(2026, 6, 29, 10, 0, 0, 0)

  it('durée nulle (10h00 → 10h00) ne bloque PAS en permanence', () => {
    // Avant correction : traite comme un franchissement de minuit, donc
    // `minute >= 600 || minute < 600` toujours vrai — bloque 24 h/24.
    const nul = makeSlot({ startMinute: 600, endMinute: 600 })
    expect(slotIsActiveAt(nul, dixHeures)).toBe(false)
    expect(slotIsActiveAt(nul, new Date(2026, 6, 29, 3, 0, 0, 0))).toBe(false)
    expect(slotIsActiveAt(nul, new Date(2026, 6, 29, 23, 0, 0, 0))).toBe(false)
    expect(activeSessionAt({ slots: [nul], manual: null }, dixHeures)).toBeNull()
  })

  it('minute de fin hors bornes ne crée PAS une session de plusieurs jours', () => {
    // Avant correction : endMinute=5000 debordait dans setMinutes et donnait
    // une echeance trois jours plus tard.
    const debordant = makeSlot({ startMinute: 100, endMinute: 5000 })
    expect(slotIsActiveAt(debordant, dixHeures)).toBe(false)
    expect(activeSessionAt({ slots: [debordant], manual: null }, dixHeures)).toBeNull()
  })

  it('minute de début négative est rejetée', () => {
    expect(slotIsActiveAt(makeSlot({ startMinute: -60, endMinute: 120 }), dixHeures)).toBe(false)
  })

  it('minute non entière est rejetée', () => {
    expect(slotIsActiveAt(makeSlot({ startMinute: 9.5 * 60 + 0.5 }), dixHeures)).toBe(false)
  })

  it('jour de semaine hors 0..6 est rejeté', () => {
    expect(slotIsActiveAt(makeSlot({ daysOfWeek: [3, 9] }), dixHeures)).toBe(false)
  })

  it('un créneau valide couvrant la journée entière reste possible', () => {
    // La façon correcte d'exprimer « toute la journée » : 0 -> 1439.
    const journee = makeSlot({ startMinute: 0, endMinute: 1439 })
    expect(slotIsActiveAt(journee, dixHeures)).toBe(true)
  })

  it('un créneau invalide n’empêche pas les créneaux valides voisins', () => {
    const rules: BlockingRules = {
      slots: [makeSlot({ id: 'nul', startMinute: 600, endMinute: 600 }), makeSlot()],
      manual: null,
    }
    expect(activeSessionAt(rules, dixHeures)?.blockedAppIds).toEqual(['blender.exe'])
  })
})

describe('échéance absolue d’un créneau franchissant minuit', () => {
  // Ces cas ne sont couverts par aucun autre test et l'arithmetique de date
  // est le point le plus fragile du module : une echeance calculee le mauvais
  // jour ferait terminer la session 24 h trop tot ou trop tard.
  const nuit = makeSlot({ startMinute: 22 * 60, endMinute: 2 * 60, daysOfWeek: [3] })
  const rules: BlockingRules = { slots: [nuit], manual: null }

  it('portion du soir : la fin tombe le LENDEMAIN', () => {
    const session = activeSessionAt(rules, mercredi(23, 0))
    expect(session).not.toBeNull()
    // Mercredi 29/07 23h00 -> fin jeudi 30/07 02h00.
    expect(session?.endsAt).toBe(new Date(2026, 6, 30, 2, 0, 0, 0).getTime())
  })

  it('portion du petit matin : la fin tombe le JOUR MEME', () => {
    const session = activeSessionAt(rules, mercredi(1, 0))
    expect(session).not.toBeNull()
    // Mercredi 29/07 01h00 -> fin mercredi 29/07 02h00.
    expect(session?.endsAt).toBe(new Date(2026, 6, 29, 2, 0, 0, 0).getTime())
  })

  it("l'échéance est toujours dans le futur par rapport à maintenant", () => {
    for (const heure of [22, 23, 0, 1]) {
      const now = new Date(2026, 6, 29, heure, 30, 0, 0)
      if (!slotIsActiveAt(nuit, now)) continue
      const session = activeSessionAt(rules, now)
      expect(session?.endsAt).toBeGreaterThan(now.getTime())
    }
  })
})

describe('activeSessionAt', () => {
  it('renvoie null quand aucune règle ne s’applique', () => {
    const rules: BlockingRules = { slots: [makeSlot()], manual: null }
    expect(activeSessionAt(rules, mercredi(15))).toBeNull()
  })

  it('renvoie null sans aucune règle', () => {
    expect(activeSessionAt({ slots: [], manual: null }, mercredi(10))).toBeNull()
  })

  it('renvoie la session du créneau actif', () => {
    const rules: BlockingRules = { slots: [makeSlot()], manual: null }
    const session = activeSessionAt(rules, mercredi(10))
    expect(session?.blockedAppIds).toEqual(['blender.exe'])
    expect(session?.endsAt).toBe(mercredi(12, 0).getTime())
  })

  it('renvoie la session manuelle en cours', () => {
    const rules: BlockingRules = {
      slots: [],
      manual: {
        startedAt: mercredi(14).getTime(),
        endsAt: mercredi(16).getTime(),
        appIds: ['chrome.exe'],
      },
    }
    const session = activeSessionAt(rules, mercredi(15))
    expect(session?.blockedAppIds).toEqual(['chrome.exe'])
    expect(session?.endsAt).toBe(mercredi(16).getTime())
  })

  it('ignore une session manuelle expirée', () => {
    const rules: BlockingRules = {
      slots: [],
      manual: {
        startedAt: mercredi(14).getTime(),
        endsAt: mercredi(16).getTime(),
        appIds: ['chrome.exe'],
      },
    }
    expect(activeSessionAt(rules, mercredi(17))).toBeNull()
  })

  it('ignore une session manuelle pas encore commencée', () => {
    const rules: BlockingRules = {
      slots: [],
      manual: {
        startedAt: mercredi(14).getTime(),
        endsAt: mercredi(16).getTime(),
        appIds: ['chrome.exe'],
      },
    }
    expect(activeSessionAt(rules, mercredi(13))).toBeNull()
  })

  it('fusionne créneau et session manuelle — union des apps, échéance la plus lointaine', () => {
    const rules: BlockingRules = {
      slots: [makeSlot()],
      manual: {
        startedAt: mercredi(9).getTime(),
        endsAt: mercredi(14).getTime(),
        appIds: ['chrome.exe'],
      },
    }
    const session = activeSessionAt(rules, mercredi(10))
    expect(session?.blockedAppIds.sort()).toEqual(['blender.exe', 'chrome.exe'])
    expect(session?.endsAt).toBe(mercredi(14).getTime())
  })

  it('dédoublonne une application présente dans les deux sources', () => {
    const rules: BlockingRules = {
      slots: [makeSlot()],
      manual: {
        startedAt: mercredi(9).getTime(),
        endsAt: mercredi(11).getTime(),
        appIds: ['blender.exe'],
      },
    }
    expect(activeSessionAt(rules, mercredi(10))?.blockedAppIds).toEqual(['blender.exe'])
  })

  it('fusionne plusieurs créneaux actifs simultanément', () => {
    const rules: BlockingRules = {
      slots: [
        makeSlot({ id: 's1', appIds: ['blender.exe'] }),
        makeSlot({ id: 's2', appIds: ['discord.exe'], endMinute: 11 * 60 }),
      ],
      manual: null,
    }
    const session = activeSessionAt(rules, mercredi(10))
    expect(session?.blockedAppIds.sort()).toEqual(['blender.exe', 'discord.exe'])
    // L'echeance retenue est la plus lointaine : la session ne se termine que
    // quand plus aucune regle ne s'applique.
    expect(session?.endsAt).toBe(mercredi(12).getTime())
  })
})
