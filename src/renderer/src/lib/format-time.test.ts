import { describe, it, expect } from 'vitest'
import { minuteToHHMM, durationLabel, formatCountdown } from './format-time'

describe('minuteToHHMM', () => {
  it('formats midnight', () => {
    expect(minuteToHHMM(0)).toBe('00:00')
  })
  it('formats 90 → 01:30', () => {
    expect(minuteToHHMM(90)).toBe('01:30')
  })
  it('formats 1439 → 23:59', () => {
    expect(minuteToHHMM(1439)).toBe('23:59')
  })
  it('formats 1440 → 24:00', () => {
    expect(minuteToHHMM(1440)).toBe('24:00')
  })
  it('clamps negatives', () => {
    expect(minuteToHHMM(-5)).toBe('00:00')
  })
})

describe('durationLabel', () => {
  it('< 1h → "X min"', () => {
    expect(durationLabel(30)).toBe('30 min')
    expect(durationLabel(0)).toBe('0 min')
  })
  it('exact hour → "Xh"', () => {
    expect(durationLabel(60)).toBe('1h')
    expect(durationLabel(120)).toBe('2h')
  })
  it('mixed → "XhYY"', () => {
    expect(durationLabel(90)).toBe('1h30')
    expect(durationLabel(125)).toBe('2h05')
  })
})

describe('formatCountdown', () => {
  it('< 1h → MM:SS', () => {
    expect(formatCountdown(0)).toBe('00:00')
    expect(formatCountdown(65_000)).toBe('01:05')
    expect(formatCountdown(59 * 60 * 1000 + 59_000)).toBe('59:59')
  })
  it('>= 1h → HH:MM:SS', () => {
    expect(formatCountdown(3_600_000)).toBe('01:00:00')
    expect(formatCountdown(3_725_000)).toBe('01:02:05')
  })
  it('clamps negatives to zero', () => {
    expect(formatCountdown(-1000)).toBe('00:00')
  })
})
