import { PALETTE_ANCRES, PALETTE_OBJECTIFS, PALETTE_TACHES } from '@shared/palettes'
import type { NatureApp } from './app-briques'

/**
 * Chaque engagement garde SA couleur, proche de celle de sa nature mais
 * distincte à l'œil nu. Les palettes rangées (12 par famille) descendent
 * jusqu'au quasi-noir : sur le fond noir de l'app, elles disparaîtraient. On
 * les lit donc à travers ces tons-ci, rang pour rang — même rang rangé, même
 * ton affiché. Aucun vert (teinte 60-170° bannie).
 */
export const VISIBLES: Record<NatureApp, readonly string[]> = {
  GOAL: ['#e03131', '#f06565', '#d9532f', '#e64980', '#ff8a65', '#c2255c', '#ff6b81', '#e8590c', '#b83b5e', '#f03e3e', '#d6336c', '#ff9b8a'],
  TASK: ['#8d8d8d', '#c4c7cc', '#6b6f76', '#a8a29a', '#8e98a8', '#e0e0e0', '#9a8f99', '#757d8a', '#b3aca3', '#5f636b', '#a3abb8', '#87807a'],
  ANCHOR: ['#4b6190', '#5b7fc7', '#7d9bd1', '#3f5f9a', '#6c8ebf', '#4a72b0', '#8fa8d6', '#5468a8', '#3d6f9e', '#6b7fb8', '#9db4e0', '#4e5f8f'],
}

const RANGEES: Record<NatureApp, readonly string[]> = { GOAL: PALETTE_OBJECTIFS, TASK: PALETTE_TACHES, ANCHOR: PALETTE_ANCRES }

/** Un rang stable tiré d'un identifiant, pour ce qui n'a pas de couleur rangée. */
function rangDe(id: string, n: number): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h % n
}

/** La couleur affichée d'un engagement : la sienne, lisible sur le noir. */
export function traitDe(nature: NatureApp, couleur?: string | null, id?: string): string {
  const visibles = VISIBLES[nature]
  const rang = couleur ? RANGEES[nature].findIndex((c) => c.toLowerCase() === couleur.trim().toLowerCase()) : -1
  if (rang >= 0) return visibles[rang % visibles.length]!
  return id ? visibles[rangDe(id, visibles.length)]! : visibles[0]!
}
