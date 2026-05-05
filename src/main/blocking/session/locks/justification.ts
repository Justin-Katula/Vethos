export function countWords(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/u).filter((w) => w.length > 0).length
}

export function isJustificationValid(text: string, minWords: number): boolean {
  return countWords(text) >= minWords
}
