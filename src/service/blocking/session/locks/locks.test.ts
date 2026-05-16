import { describe, it, expect } from 'vitest'
import { isCooldownReady, remainingMs } from './cooldown'
import { countWords, isJustificationValid } from './justification'

describe('cooldown', () => {
  it('not ready before duration', () => {
    const start = '2026-05-04T10:00:00.000Z'
    const now = new Date('2026-05-04T10:02:30.000Z').getTime()
    expect(isCooldownReady(start, 5, now)).toBe(false)
    expect(remainingMs(start, 5, now)).toBe(2 * 60 * 1000 + 30 * 1000)
  })

  it('ready at threshold', () => {
    const start = '2026-05-04T10:00:00.000Z'
    const now = new Date('2026-05-04T10:05:00.000Z').getTime()
    expect(isCooldownReady(start, 5, now)).toBe(true)
    expect(remainingMs(start, 5, now)).toBe(0)
  })
})

describe('justification', () => {
  it('counts words separated by whitespace', () => {
    expect(countWords('  hello  world\nfoo\tbar ')).toBe(4)
  })

  it('handles unicode (whitespace-split, simple)', () => {
    // split sur whitespace pure : 'café — naïveté !' = 4 tokens (la ponctuation isolée compte)
    expect(countWords('café — naïveté !')).toBe(4)
    expect(countWords('café naïveté')).toBe(2)
  })

  it('returns 0 for empty', () => {
    expect(countWords('   \n  ')).toBe(0)
  })

  it('valid only above threshold', () => {
    expect(isJustificationValid('one two three', 5)).toBe(false)
    expect(isJustificationValid('one two three four five', 5)).toBe(true)
  })
})
