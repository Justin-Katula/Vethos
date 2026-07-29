/**
 * Calcule où poser l'overlay à partir de l'état de sa cible.
 *
 * Correctif du bug 5 : l'overlay atterrissait au coin `0,0` parce que les
 * bounds étaient lues sur une fenêtre cachée ou minimisée. Windows place les
 * fenêtres minimisées à `-32000`. La règle est simple et sans exception —
 * quand l'état est douteux, on masque l'overlay, on ne devine jamais une
 * position.
 */

export type Rect = { left: number; top: number; right: number; bottom: number }

export type ShowState = 'normal' | 'minimized' | 'maximized'

export type TargetGeometry = {
  bounds: Rect
  showState: ShowState
  cloaked: boolean
  visible: boolean
}

export type Placement =
  | { kind: 'hidden'; reason: string }
  | { kind: 'placed'; x: number; y: number; width: number; height: number }

/** Sentinelle Windows pour les fenêtres minimisées. */
const OFFSCREEN_SENTINEL = -30000

export function computeOverlayPlacement(t: TargetGeometry): Placement {
  if (!t.visible) return { kind: 'hidden', reason: 'cible invisible' }
  if (t.cloaked) return { kind: 'hidden', reason: 'cible masquée par DWM' }
  if (t.showState === 'minimized') return { kind: 'hidden', reason: 'cible minimisée' }

  if (t.bounds.left <= OFFSCREEN_SENTINEL || t.bounds.top <= OFFSCREEN_SENTINEL) {
    return { kind: 'hidden', reason: 'bounds hors écran (-32000)' }
  }

  const width = t.bounds.right - t.bounds.left
  const height = t.bounds.bottom - t.bounds.top
  if (width <= 0 || height <= 0) return { kind: 'hidden', reason: 'bounds dégénérées' }

  return { kind: 'placed', x: t.bounds.left, y: t.bounds.top, width, height }
}
