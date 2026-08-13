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

  it('yPxToMinute is l inverse', () => {
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
