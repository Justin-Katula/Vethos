import { describe, it, expect } from 'vitest'
import {
  applyProtectedMargins,
  buildDayCapacity,
  buildFreeIntervals,
  classifyHour,
  computeEffectiveCapacity,
  computeRawCapacity,
  FRAGMENT_DEFAULTS,
  measureFragmentThreshold,
  mergeIntervals,
  scheduleEntriesForDate,
  splitDelayDebit,
  splitUsable,
  wakeZoneFor,
} from './capacity'
import type { AncreItem, LearningObservation, ScheduleEntry } from './types'

const entry = (
  start: number,
  end: number,
  categoryType: ScheduleEntry['categoryType'] = 'school',
): ScheduleEntry => ({
  dayOfWeek: 0,
  startMinute: start,
  endMinute: end,
  categoryType,
  label: categoryType,
  color: '#333333',
})

const ancre = (anchorMinute: number, normalMaxMinutes: number): AncreItem => ({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Sport',
  plan: 'Faire du sport au gymnase.',
  color: '#3ECF8E',
  trigger: 'sport',
  anchorMinute,
  daysOfWeek: [0],
  normalMaxMinutes,
  minimumMinutes: 24,
  appsToBlock: [],
  createdAt: '2026-08-01T10:00:00.000Z',
})

const obs = (o: Partial<LearningObservation>): LearningObservation => ({
  createdAt: '2026-08-01T10:00:00.000Z',
  ...o,
})

describe('A.1 — capacité brute', () => {
  it('1440 − sommeil (23 h → 7 h) = 960', () => {
    const sommeil = [entry(0, 420, 'sleep'), entry(1380, 1440, 'sleep')]
    expect(computeRawCapacity(sommeil)).toBe(960)
  })

  it('les ancres sortent aussi de la capacité brute', () => {
    const sommeil = [entry(0, 420, 'sleep'), entry(1380, 1440, 'sleep')]
    // 960 − 60 min de sport = 900.
    expect(computeRawCapacity(sommeil, [ancre(1080, 60)])).toBe(900)
  })

  it('deux obligations qui se chevauchent ne sont comptées qu’une fois', () => {
    // 08 h → 12 h et 10 h → 16 h : 480 minutes occupées, pas 600.
    expect(computeRawCapacity([entry(480, 720), entry(600, 960)])).toBe(1440 - 480)
    expect(
      mergeIntervals([
        { start: 0, end: 10 },
        { start: 5, end: 20 },
      ]),
    ).toEqual([{ start: 0, end: 20 }])
  })

  it('le sommeil n’est jamais compté comme charge de travail', () => {
    // Il sort de la capacité — il n'y entre pas. Une journée sans rien d'autre
    // que 8 h de sommeil laisse 16 h brutes, pas 16 h de travail dû.
    expect(computeRawCapacity([entry(0, 480, 'sleep')])).toBe(960)
  })
})

describe('A.2 — fragments et marges protégées', () => {
  it('les trous libres sont ceux que laissent obligations et ancres', () => {
    const free = buildFreeIntervals([
      entry(0, 420, 'sleep'),
      entry(480, 960),
      entry(1380, 1440, 'sleep'),
    ])
    expect(free).toEqual([
      { start: 420, end: 480 },
      { start: 960, end: 1380 },
    ])
  })

  it('30 min protégées avant le sommeil, 20 min avant une obligation', () => {
    const entries = [entry(0, 420, 'sleep'), entry(480, 960), entry(1380, 1440, 'sleep')]
    const trimmed = applyProtectedMargins(buildFreeIntervals(entries), entries)
    // 7 h → 8 h devient 7 h 30 → 7 h 40 : la zone de réveil ronge le début,
    // les 20 min de préparation avant l'école rongent la fin.
    expect(trimmed[0]).toEqual({ start: 450, end: 460 })
    // 16 h → 23 h devient 16 h 30 → 22 h 30 : le buffer de retour d'école
    // (A.2.3, 30 min) ronge le début, la transition avant le sommeil la fin.
    expect(trimmed[1]).toEqual({ start: 990, end: 1350 })
  })

  it('un fragment sous le seuil est inutilisable', () => {
    const { usable, unusableMinutes } = splitUsable(
      [
        { start: 0, end: 20 },
        { start: 100, end: 200 },
      ],
      25,
    )
    expect(usable).toEqual([{ start: 100, end: 200 }])
    expect(unusableMinutes).toBe(20)
  })
})

describe('A.2 — zone de réveil', () => {
  const nuit = [entry(0, 420, 'sleep'), entry(1380, 1440, 'sleep')]

  it('30 minutes protégées après le lever, par défaut', () => {
    const trimmed = applyProtectedMargins(buildFreeIntervals(nuit), nuit)
    // Lever à 7 h : rien ne se planifie avant 7 h 30.
    expect(trimmed[0]!.start).toBe(450)
  })

  it('crise prouvée : 20 min sacrifiées au maximum, plancher absolu de 10', () => {
    expect(wakeZoneFor(false)).toBe(FRAGMENT_DEFAULTS.wakeZone)
    expect(wakeZoneFor(true)).toBe(FRAGMENT_DEFAULTS.wakeZoneFloor)
    // Le sacrifice maximal mène exactement au plancher, jamais en dessous.
    expect(FRAGMENT_DEFAULTS.wakeZone - FRAGMENT_DEFAULTS.wakeZoneMaxSacrifice).toBe(
      FRAGMENT_DEFAULTS.wakeZoneFloor,
    )
    const trimmed = applyProtectedMargins(buildFreeIntervals(nuit), nuit, wakeZoneFor(true))
    expect(trimmed[0]!.start).toBe(430)
  })

  it('le jour porte toujours les deux chiffres : protégé et sacrifié (C.3)', () => {
    const day = (wakeZone: number) =>
      buildDayCapacity({
        date: '2026-08-11',
        dayOfWeek: 1,
        entries: nuit,
        ancres: [],
        restReservedMinutes: 0,
        fatiguePenaltyMinutes: 0,
        wakeZoneMinutes: wakeZone,
      })

    const normal = day(wakeZoneFor(false))
    expect(normal.wakeZoneMinutes).toBe(30)
    expect(normal.wakeZoneSacrificedMinutes).toBe(0)

    const crise = day(wakeZoneFor(true))
    expect(crise.wakeZoneMinutes).toBe(10)
    expect(crise.wakeZoneSacrificedMinutes).toBe(20)
    // Les 20 minutes sacrifiées reviennent vraiment dans la capacité.
    expect(crise.effectiveCapacityMinutes - normal.effectiveCapacityMinutes).toBe(20)
  })

  it('sans sommeil déclaré, aucune zone de réveil inventée', () => {
    const day = buildDayCapacity({
      date: '2026-08-11',
      dayOfWeek: 1,
      entries: [entry(480, 960)],
      ancres: [],
      restReservedMinutes: 0,
      fatiguePenaltyMinutes: 0,
    })
    expect(day.wakeZoneMinutes).toBe(0)
    expect(day.wakeZoneSacrificedMinutes).toBe(0)
  })
})

describe('A.2.3 — buffer de retour après une obligation fixe', () => {
  it('École/Travail/Engagement/Autre : 30 min protégées après CHAQUE instance, jour normal', () => {
    const cours = entry(480, 960, 'school') // 08:00 → 16:00
    const free = applyProtectedMargins(buildFreeIntervals([cours]), [cours])
    const soir = free.find((i) => i.start >= 960)!
    // Rien n'est planifiable avant 16 h 30 : le buffer de retour ronge le début.
    expect(soir.start).toBe(990)
  })

  it('Trajet : 5 minutes fixes, jour normal — jamais 30', () => {
    const trajet = entry(480, 500, 'commute') // 08:00 → 08:20
    const free = applyProtectedMargins(buildFreeIntervals([trajet]), [trajet])
    const apres = free.find((i) => i.start >= 500)!
    expect(apres.start).toBe(505)
  })

  it('crise prouvée : le buffer réductible tombe à 10 min, le Trajet ne bouge jamais', () => {
    const cours = entry(480, 960, 'school') // 08:00 → 16:00
    const trajet = entry(1020, 1040, 'commute') // 17:00 → 17:20
    const entries = [cours, trajet]
    const enCrise = wakeZoneFor(true) // 10 min — même mécanisme que la zone de réveil.
    const free = applyProtectedMargins(buildFreeIntervals(entries), entries, enCrise, enCrise)

    // École : 16 h 10 (960 + 10), pas 16 h 30 — le sacrifice de crise s'applique.
    const apresEcole = free.find((i) => i.start >= 960 && i.start < 1010)!
    expect(apresEcole.start).toBe(970)
    // Trajet : toujours 5 min, la même crise ne le touche jamais.
    const apresTrajet = free.find((i) => i.start >= 1040)!
    expect(apresTrajet.start).toBe(1045)
  })

  it('chiffré et visible (C.3) : les deux buffers sont exposés séparément sur le jour', () => {
    const cours = entry(480, 960, 'school')
    const trajet = entry(1020, 1040, 'commute')
    const entries = [cours, trajet]
    const dayArgs = {
      date: '2026-08-11',
      dayOfWeek: 1,
      entries,
      ancres: [],
      restReservedMinutes: 0,
      fatiguePenaltyMinutes: 0,
    }

    const normal = buildDayCapacity(dayArgs)
    expect(normal.postObligationBufferMinutes).toBe(30) // une instance réductible : l'école.
    expect(normal.postObligationSacrificedMinutes).toBe(0)
    expect(normal.commuteBufferMinutes).toBe(5)

    const crise = buildDayCapacity({ ...dayArgs, wakeZoneMinutes: wakeZoneFor(true) })
    expect(crise.postObligationBufferMinutes).toBe(10)
    expect(crise.postObligationSacrificedMinutes).toBe(20)
    // Le Trajet ne sacrifie jamais rien, même dans le même scénario de crise.
    expect(crise.commuteBufferMinutes).toBe(5)
  })

  it('plusieurs obligations le même jour : chaque instance reçoit SON buffer, indépendamment des autres', () => {
    const ecole = entry(480, 960, 'school') // 08:00 → 16:00
    const trajet = entry(1020, 1040, 'commute') // 17:00 → 17:20
    const travail = entry(1080, 1200, 'work') // 18:00 → 20:00
    const day = buildDayCapacity({
      date: '2026-08-11',
      dayOfWeek: 1,
      entries: [ecole, trajet, travail],
      ancres: [],
      restReservedMinutes: 0,
      fatiguePenaltyMinutes: 0,
    })
    // Deux instances réductibles (école, travail) → 2 × 30 = 60.
    expect(day.postObligationBufferMinutes).toBe(60)
    // Une instance Trajet → 5, jamais mélangée avec les deux autres.
    expect(day.commuteBufferMinutes).toBe(5)
  })
})

describe('A.1 — occurrence unique vs récurrente', () => {
  it('sans date, une entrée compte chaque semaine sur son jour', () => {
    const cours = entry(480, 960, 'school') // dayOfWeek: 0 (lundi)
    // Deux lundis différents : l'entrée s'applique aux deux.
    expect(scheduleEntriesForDate([cours], '2026-08-10', 0)).toEqual([cours])
    expect(scheduleEntriesForDate([cours], '2026-08-17', 0)).toEqual([cours])
  })

  it('avec une date, l’entrée ne compte QUE ce jour-là — jamais répétée', () => {
    const sortie = { ...entry(480, 960, 'commitment'), date: '2026-08-14' }
    expect(scheduleEntriesForDate([sortie], '2026-08-14', 4)).toEqual([sortie])
    // Même jour de semaine, une semaine plus tard : ne s'applique plus.
    expect(scheduleEntriesForDate([sortie], '2026-08-21', 4)).toEqual([])
  })

  it('les deux types cohabitent sans se marcher dessus', () => {
    const recurrente = entry(480, 960, 'school')
    const unique = { ...entry(600, 660, 'commitment'), date: '2026-08-10' }
    expect(scheduleEntriesForDate([recurrente, unique], '2026-08-10', 0)).toEqual([
      recurrente,
      unique,
    ])
    expect(scheduleEntriesForDate([recurrente, unique], '2026-08-17', 0)).toEqual([recurrente])
  })
})

describe('A.2.1 — seuil personnalisé', () => {
  it('sous 5 observations, le défaut tient et la confiance reste basse', () => {
    const few = [30, 40, 50, 60].map((actualMinutes) =>
      obs({ workKind: 'routine', actualMinutes, completed: true }),
    )
    expect(measureFragmentThreshold(few, 'routine')).toEqual({ threshold: 25, confidence: 'low' })
  })

  it('dès 5 observations, le plus petit bloc réellement mené à terme remplace le défaut', () => {
    const five = [32, 45, 60, 90, 120].map((actualMinutes) =>
      obs({ workKind: 'routine', actualMinutes, completed: true }),
    )
    // 32 arrondi au multiple de 5 inférieur = 30.
    expect(measureFragmentThreshold(five, 'routine')).toEqual({
      threshold: 30,
      confidence: 'measured',
    })
  })

  it('les blocs abandonnés ne comptent pas comme un seuil utilisable', () => {
    const mixed = [
      ...[10, 12].map((actualMinutes) =>
        obs({ workKind: 'novel', actualMinutes, completed: false }),
      ),
      ...[45, 50, 60, 70, 80].map((actualMinutes) =>
        obs({ workKind: 'novel', actualMinutes, completed: true }),
      ),
    ]
    expect(measureFragmentThreshold(mixed, 'novel').threshold).toBe(45)
  })
})

describe('A.3 — capacité effective', () => {
  it('brute − inutilisables − repos − fatigue', () => {
    expect(computeEffectiveCapacity(960, 40, 192, 0)).toBe(728)
    expect(computeEffectiveCapacity(960, 40, 192, 100)).toBe(628)
  })

  it('jamais négative', () => {
    expect(computeEffectiveCapacity(100, 50, 60, 60)).toBe(0)
  })

  it('assemble un jour complet et cohérent', () => {
    const entries = [entry(0, 420, 'sleep'), entry(480, 960), entry(1380, 1440, 'sleep')]
    const day = buildDayCapacity({
      date: '2026-08-11',
      dayOfWeek: 1,
      entries,
      ancres: [],
      restReservedMinutes: 96,
      fatiguePenaltyMinutes: 0,
    })
    // Brute : 1440 − 480 (sommeil) − 480 (école) = 480.
    expect(day.rawCapacityMinutes).toBe(480)
    // Trous bruts : 60 + 420 = 480. Le matin ne garde que 7 h 30 → 7 h 40 (10
    // min, sous le seuil de fragment). Le soir ne commence qu'à 16 h 30 : le
    // buffer de retour d'école (A.2.3, 30 min) ronge le début du trou, en plus
    // de la transition avant le sommeil qui en ronge déjà la fin — 360 min
    // utilisables. 480 − (10 + 360) = 110 rognées par les marges, + 10 de
    // fragment inutilisable = 120.
    expect(day.unusableMinutes).toBe(120)
    expect(day.effectiveCapacityMinutes).toBe(480 - 120 - 96)
    expect(day.slots).toEqual([
      { startMinute: 990, endMinute: 1350, durationMinutes: 360, cognitiveWindow: 'NORMALE' },
    ])
  })
})

describe('notBeforeMinute — le temps déjà passé n’est plus placeable (bug réel du 2026-08-22)', () => {
  const dayArgs = {
    date: '2026-08-22',
    dayOfWeek: 5,
    entries: [entry(0, 420, 'sleep'), entry(1380, 1440, 'sleep')],
    ancres: [],
    restReservedMinutes: 0,
    fatiguePenaltyMinutes: 0,
  }

  it('sans notBeforeMinute : le créneau part du début de journée utilisable, comme avant', () => {
    const day = buildDayCapacity(dayArgs)
    // 07h00 (420) + 30 min de zone de réveil protégée (A.2) = 450.
    expect(day.slots[0]!.startMinute).toBe(450)
  })

  it('avec notBeforeMinute : rien avant cette minute n’est offert au placement', () => {
    const day = buildDayCapacity({ ...dayArgs, notBeforeMinute: 1292 }) // 21h32
    expect(day.slots).toEqual([{ startMinute: 1292, endMinute: 1350, durationMinutes: 58, cognitiveWindow: 'NORMALE' }])
  })

  it('un reliquat sous le seuil de fragment après découpage disparaît, pas de bloc fantôme', () => {
    // Le trou utilisable s'arrête à 1350 (30 min avant le sommeil, A.2). Le
    // clipper à 1330 ne laisse que 20 min, sous le seuil de 25 (D.5/A.2).
    const day = buildDayCapacity({ ...dayArgs, notBeforeMinute: 1330, fragmentThreshold: 25 })
    expect(day.slots).toEqual([])
  })

  it('LE BUDGET NE CHANGE JAMAIS : rawCapacityMinutes et effectiveCapacityMinutes sont identiques avec ou sans notBeforeMinute', () => {
    // C'est le cœur de la conception : notBeforeMinute ne resserre QUE
    // l'endroit où le budget peut être dépensé, jamais le budget lui-même —
    // sinon un retard déjà débité (D.7) serait compté deux fois, une fois
    // dans la réduction de capacité, une fois dans le rétrécissement du
    // créneau.
    const withoutClip = buildDayCapacity({ ...dayArgs, delayMinutes: 300 })
    const withClip = buildDayCapacity({ ...dayArgs, delayMinutes: 300, notBeforeMinute: 1292 })
    expect(withClip.rawCapacityMinutes).toBe(withoutClip.rawCapacityMinutes)
    expect(withClip.unusableMinutes).toBe(withoutClip.unusableMinutes)
    expect(withClip.effectiveCapacityMinutes).toBe(withoutClip.effectiveCapacityMinutes)
  })

  it('une obligation fixe plus tard dans la soirée reste protégée normalement, même clippée', () => {
    const withEvening = buildDayCapacity({
      ...dayArgs,
      entries: [...dayArgs.entries, entry(1200, 1260, 'commitment')], // 20h00 → 21h00
      notBeforeMinute: 1100, // 18h20
    })
    // Le créneau s'arrête avant l'engagement (moins le buffer de préparation),
    // reprend après son buffer de retour — le clip ne change rien à ça.
    expect(withEvening.slots.some((s) => s.startMinute < 1200 && s.endMinute > 1200)).toBe(false)
  })
})

describe('D.7 — débit du retard non confirmé', () => {
  it('la réserve de repos encaisse en premier, sans coût de capacité', () => {
    // 40 min de retard, 96 min de réserve : la réserve absorbe tout.
    expect(splitDelayDebit(40, 96)).toEqual({ absorbedByRest: 40, excess: 0 })
  })

  it('seul ce qui dépasse la réserve devient un excédent', () => {
    // 150 min de retard, 96 de réserve → 96 absorbées, 54 facturées.
    expect(splitDelayDebit(150, 96)).toEqual({ absorbedByRest: 96, excess: 54 })
  })

  it('sans réserve, tout le retard est un excédent', () => {
    expect(splitDelayDebit(30, 0)).toEqual({ absorbedByRest: 0, excess: 30 })
  })

  it('aucun retard : rien à débiter', () => {
    expect(splitDelayDebit(0, 96)).toEqual({ absorbedByRest: 0, excess: 0 })
  })

  it('un retard négatif ne crédite jamais de capacité', () => {
    expect(splitDelayDebit(-60, 96)).toEqual({ absorbedByRest: 0, excess: 0 })
  })

  it('A.3 : seul l’excédent entre dans la capacité effective', () => {
    // Le 5e terme est bien soustrait, et le plancher à 0 tient toujours.
    expect(computeEffectiveCapacity(960, 40, 192, 0, 0)).toBe(728)
    expect(computeEffectiveCapacity(960, 40, 192, 0, 54)).toBe(674)
    expect(computeEffectiveCapacity(200, 0, 60, 0, 9999)).toBe(0)
  })

  it('C.3 : le jour chiffre le retard mesuré, absorbé et facturé — jamais un seul total', () => {
    const entries = [entry(0, 420, 'sleep'), entry(480, 960), entry(1380, 1440, 'sleep')]
    const build = (delayMinutes: number) =>
      buildDayCapacity({
        date: '2026-08-11',
        dayOfWeek: 1,
        entries,
        ancres: [],
        restReservedMinutes: 96,
        fatiguePenaltyMinutes: 0,
        delayMinutes,
      })

    const sansRetard = build(0)
    expect(sansRetard.delayMinutes).toBe(0)
    expect(sansRetard.delayExcessMinutes).toBe(0)

    // 60 min de retard sous la réserve de 96 : absorbé, capacité intacte.
    const absorbé = build(60)
    expect(absorbé.delayMinutes).toBe(60)
    expect(absorbé.delayAbsorbedByRestMinutes).toBe(60)
    expect(absorbé.delayExcessMinutes).toBe(0)
    expect(absorbé.effectiveCapacityMinutes).toBe(sansRetard.effectiveCapacityMinutes)

    // 150 min : 96 absorbées, 54 facturées — exactement 54 de capacité en moins.
    const facturé = build(150)
    expect(facturé.delayAbsorbedByRestMinutes).toBe(96)
    expect(facturé.delayExcessMinutes).toBe(54)
    expect(facturé.effectiveCapacityMinutes).toBe(sansRetard.effectiveCapacityMinutes - 54)
  })
})

describe('A.4 / G.2 — fenêtres cognitives', () => {
  const at = (completed: boolean[]) => new Map([[9, completed.map((c) => ({ completed: c }))]])

  it('sous 5 observations : NORMALE, aucune conclusion', () => {
    expect(classifyHour(9, at([true, true, true, true]))).toBe('NORMALE')
    expect(classifyHour(9, new Map())).toBe('NORMALE')
  })

  it('4 complétions sur 5 (80 %) → PROFONDE', () => {
    expect(classifyHour(9, at([true, true, true, true, false]))).toBe('PROFONDE')
  })

  it('3 sur 5 (60 %) → NORMALE', () => {
    expect(classifyHour(9, at([true, true, true, false, false]))).toBe('NORMALE')
  })

  it('1 sur 5 (20 %) → BASSE : le créneau cesse d’être proposé', () => {
    expect(classifyHour(9, at([true, false, false, false, false]))).toBe('BASSE')
  })
})
