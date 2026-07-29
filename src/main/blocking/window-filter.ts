/**
 * Décide si une fenêtre est une cible de blocage valide.
 *
 * Correctif du bug 4 : l'ancienne implémentation touchait toutes les fenêtres
 * mémorisées d'un processus, y compris ses fenêtres internes — d'où les
 * doublons et les onglets parasites dans la barre des tâches au moment de
 * restaurer. On ne retient ici que les fenêtres « alt-tab-ables », celles
 * qu'un utilisateur perçoit comme une fenêtre d'application.
 *
 * Le sidecar n'applique aucun filtre : il émet les attributs bruts et cette
 * fonction décide. C'est ce qui rend la décision testable.
 */

export const WS_EX_TOOLWINDOW = 0x00000080
export const WS_EX_APPWINDOW = 0x00040000

/** Filet de sécurité, pas le filtre principal : ces classes ne sont jamais des fenêtres d'application. */
const HELPER_CLASSES = new Set([
  'ime',
  'msctfime ui',
  'default ime',
  'tooltips_class32',
  'sysshadow',
])

export type WindowInfo = {
  hwnd: string
  pid: number
  exeName: string
  title: string
  className: string
  exStyle: number
  style: number
  hasOwner: boolean
  cloaked: boolean
  visible: boolean
}

/** Renvoie le motif du rejet, ou `null` si la fenêtre est une cible valide. */
export function rejectionReason(w: WindowInfo): string | null {
  if (!w.visible) return 'invisible'
  if (w.cloaked) return 'masquée par DWM'
  if (w.title.trim().length === 0) return 'titre vide'
  if ((w.exStyle & WS_EX_TOOLWINDOW) !== 0) return 'fenêtre outil'
  if (HELPER_CLASSES.has(w.className.toLowerCase())) return 'classe assistante'
  // WS_EX_APPWINDOW est une demande explicite de figurer dans la barre des
  // tâches : elle prime sur la règle du propriétaire.
  if (w.hasOwner && (w.exStyle & WS_EX_APPWINDOW) === 0) return 'fenêtre possédée'
  return null
}

export function isBlockingTarget(w: WindowInfo): boolean {
  return rejectionReason(w) === null
}
