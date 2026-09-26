import type { PlanningSignal } from './planning/types'

/**
 * What the engine noticed, put into sentences.
 *
 * The engine produces numbered FACTS. This file only makes them readable — it
 * decides nothing, weighs nothing, adds no threshold. The contract rule (F)
 * fits on one line: **never a judgement, never a question**. "Missed 3 times
 * in a row" is a fact; "you should get back to it" is not, and appears
 * nowhere.
 *
 * Shared, and deliberately so. Both apps used to carry their own copy of these
 * sentences; the day one of them was reworded, the same event started reading
 * differently depending on the screen you happened to be looking at. Two
 * Vethos that describe the same fact in two ways are two products.
 */

/** A week-level fact, ready to be put on screen. */
export type SignalSentence = { key: string; text: string }

/**
 * C.3.4: the list is CLOSED — four signals, not one more.
 *
 * `density_deficit` deliberately produces no sentence here: the deficit card
 * already shows it, with its costed options. Repeating it underneath would
 * state the same fact twice, once without anything to do about it.
 */
export function signalSentence(
  signal: PlanningSignal,
  nameOf: (id: string) => string | undefined,
): string | null {
  const d = signal.data
  const num = (key: string): number => (typeof d[key] === 'number' ? (d[key] as number) : 0)
  const str = (key: string): string => (typeof d[key] === 'string' ? (d[key] as string) : '')

  switch (signal.type) {
    case 'anchor_missed_3x': {
      const name = nameOf(str('ancreId')) ?? 'This anchor'
      return `${name} — missed ${num('missedCount')} times in a row, never started.`
    }
    case 'objective_stalled': {
      const name = str('name') || 'This goal'
      return `${name} — no progress for ${num('daysSinceLastService')} days.`
    }
    case 'delay_repeated': {
      const name = nameOf(str('refId')) ?? 'This block'
      return `${name} — late again, ${num('consecutiveDelays')} times in a row.`
    }
    default:
      return null
  }
}

export function signalSentences(
  signals: readonly PlanningSignal[],
  nameOf: (id: string) => string | undefined,
): SignalSentence[] {
  return signals
    .map((s) => ({ key: s.subject, text: signalSentence(s, nameOf) }))
    .filter((s): s is SignalSentence => s.text !== null)
}

/**
 * What the engine had to do to place a block where it did.
 *
 * An ordinary block has no note. One appears only when something happened — a
 * cap crossed, an anchor cut back, a break folded in. The order matters:
 * `capOverride` and `reducedToMinimum` are engine decisions made under
 * constraint, and outrank the plain reminder of a break.
 *
 * The clock does not come into it. "Now" is a fact the day view establishes on
 * its own; repeating it here would make a time-independent value depend on
 * time, and force a recompute of the whole week every minute.
 */
export function blockNote(block: {
  preview?: boolean
  capOverride?: boolean
  reducedToMinimum?: boolean
  breakMinutes: number
}, durationLabel: (minutes: number) => string): string | undefined {
  if (block.preview) return 'preview — locked by the previous part'
  if (block.capOverride) return 'over the daily cap'
  if (block.reducedToMinimum) return 'reduced to its minimum'
  if (block.breakMinutes > 0) return `then a ${durationLabel(block.breakMinutes)} break`
  return undefined
}
