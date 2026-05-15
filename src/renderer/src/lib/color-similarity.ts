import { differenceCiede2000, parse } from 'culori'

const SIMILARITY_THRESHOLD = 5

export function colorDelta(hexA: string, hexB: string): number {
  const a = parse(hexA)
  const b = parse(hexB)
  if (!a || !b) return Number.POSITIVE_INFINITY
  return differenceCiede2000()(a, b)
}

export function areColorsSimilar(hexA: string, hexB: string): boolean {
  return colorDelta(hexA, hexB) < SIMILARITY_THRESHOLD
}

export function checkPaletteCollisions(colors: string[]): Array<[string, string]> {
  const collisions: Array<[string, string]> = []
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      const a = colors[i]
      const b = colors[j]
      if (a && b && areColorsSimilar(a, b)) collisions.push([a, b])
    }
  }
  return collisions
}
