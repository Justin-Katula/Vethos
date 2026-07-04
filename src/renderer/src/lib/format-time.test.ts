import { describe, it, expect } from 'vitest'
import { minuteToClockLabel, durationLabel, formatCountdown } from './format-time'

describe('minuteToClockLabel', () => {
  it('formats midnight', () => {
    expect(minuteToClockLabel(0)).toBe('0h00')
  })
  it('formats 90 as 1h30', () => {
    expect(minuteToClockLabel(90)).toBe('1h30')
  })
  it('formats 1439 as 23h59', () => {
    expect(minuteToClockLabel(1439)).toBe('23h59')
  })
  it('clamps 1440 to the last minute of the day', () => {
    expect(minuteToClockLabel(1440)).toBe('23h59')
  })
  it('clamps negatives', () => {
    expect(minuteToClockLabel(-5)).toBe('0h00')
  })
})

describe('durationLabel', () => {
  it('< 1h → "Xmin"', () => {
    expect(durationLabel(30)).toBe('30min')
    expect(durationLabel(0)).toBe('0min')
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
  it('formats under one hour without colon notation', () => {
    expect(formatCountdown(0)).toBe('0s')
    expect(formatCountdown(65_000)).toBe('1min05s')
    expect(formatCountdown(59 * 60 * 1000 + 59_000)).toBe('59min59s')
  })
  it('formats one hour and above without colon notation', () => {
    expect(formatCountdown(3_600_000)).toBe('1h00min00s')
    expect(formatCountdown(3_725_000)).toBe('1h02min05s')
  })
  it('clamps negatives to zero', () => {
    expect(formatCountdown(-1000)).toBe('0s')
  })
})
