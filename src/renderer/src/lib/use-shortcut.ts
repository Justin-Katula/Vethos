import { useEffect } from 'react'

export type Combo = 'Escape' | 'Mod+S' | 'Mod+K' | 'Enter' | 'Mod+Enter'

type Options = {
  /** Si false, le hook ne s'enregistre pas. */
  enabled?: boolean
  /** Empêche la propagation native. Défaut true. */
  preventDefault?: boolean
}

export function isMacPlatform(platform: string): boolean {
  return /Mac|iPhone|iPad|iPod/i.test(platform)
}

function isMac(): boolean {
  return typeof navigator !== 'undefined' && isMacPlatform(navigator.platform)
}

/**
 * Pure: Renvoie true si l'événement clavier matche la combinaison demandée.
 * Pas de side-effect — exporté pour tests.
 */
export function matchesCombo(
  e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey'>,
  combo: Combo,
  platformIsMac: boolean,
): boolean {
  const mod = platformIsMac ? e.metaKey : e.ctrlKey
  switch (combo) {
    case 'Escape':
      return e.key === 'Escape'
    case 'Mod+S':
      return mod && (e.key === 's' || e.key === 'S')
    case 'Mod+K':
      return mod && (e.key === 'k' || e.key === 'K')
    case 'Enter':
      return e.key === 'Enter' && !e.shiftKey && !mod
    case 'Mod+Enter':
      return mod && e.key === 'Enter'
  }
}

/**
 * Enregistre un raccourci clavier global. Le handler est appelé sur match.
 * Mod = Cmd sur Mac, Ctrl ailleurs.
 */
export function useShortcut(
  combo: Combo,
  handler: (e: KeyboardEvent) => void,
  options: Options = {},
): void {
  const { enabled = true, preventDefault = true } = options
  useEffect(() => {
    if (!enabled) return
    const listener = (e: KeyboardEvent): void => {
      if (matchesCombo(e, combo, isMac())) {
        if (preventDefault) e.preventDefault()
        handler(e)
      }
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [combo, handler, enabled, preventDefault])
}
