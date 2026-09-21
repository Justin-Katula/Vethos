/**
 * Le vocabulaire visuel de Vethos, porté depuis le bureau sans une seule dérive.
 *
 * Les valeurs viennent de `src/renderer/src/styles/globals.css`. Deux thèmes qui
 * réécrivent EXACTEMENT les mêmes noms : un composant ne demande jamais « la
 * couleur claire » ou « la couleur sombre », il demande `surface` et reçoit la
 * bonne. C'est ce qui permet de basculer sans une seule condition dans l'interface.
 *
 * Trois règles qui ne se négocient pas :
 *
 * 1. **Aucun vert, nulle part** — aucune teinte entre 60° et 170°, pas même en
 *    nuance. Décidé le 2026-09-08, portée totale.
 * 2. **Le sombre est du noir franc** (#000), mais les SURFACES ne le sont pas.
 *    C'est le piège du vrai noir : entre deux gris très sombres le contraste
 *    s'écrase et un panneau cesse d'avoir un bord. Les paliers retenus
 *    (1.14 / 1.17 / 1.38) sont calés sur ceux du thème clair.
 * 3. **Les gris sont strictement neutres** — R = V = B. Un gris légèrement
 *    coloré se voit immédiatement à côté d'un vrai neutre.
 */

export type NomTheme = 'clair' | 'sombre'

export type Jetons = {
  /** Le fond du monde. Rien n'est posé dessous. */
  bg: string
  /** Un panneau posé sur le fond. */
  surface: string
  /** Un panneau posé sur un panneau. */
  surface2: string
  /** Le palier le plus haut : ce qui appelle le doigt. */
  surface3: string

  text: string
  text2: string
  text3: string

  line: string
  lineForte: string

  /** Le rouge. Le seul accent de l'application. */
  accent: string
  accentEncre: string
  accentSur: string
  accentDoux: string
  alerte: string

  /** Les trois natures de bloc du plan. */
  blocTache: string
  blocObjectif: string
  blocAncre: string
  blocEncreTache: string
  blocEncreObjectif: string
  blocEncreAncre: string

  champBg: string
  champBgActif: string
  focusBordure: string

  voile: string
  /** Le voile derrière une feuille modale. */
  rideau: string
}

const CLAIR: Jetons = {
  bg: '#e6e6e6',
  surface: '#f8f8f8',
  surface2: '#eeeeee',
  surface3: '#e0e0e0',

  text: '#181818',
  text2: '#4e4e4e',
  text3: '#787878',

  line: 'rgba(24, 24, 24, 0.13)',
  lineForte: 'rgba(24, 24, 24, 0.28)',

  accent: '#c1121f',
  accentEncre: '#c1121f',
  accentSur: '#ffffff',
  accentDoux: 'rgba(193, 18, 31, 0.08)',
  alerte: '#8d5b00',

  blocTache: '#c1121f',
  blocObjectif: '#55585c',
  blocAncre: '#253047',
  blocEncreTache: '#fff7f5',
  blocEncreObjectif: '#f8f8f8',
  blocEncreAncre: '#f8f9ff',

  champBg: '#f8f8f8',
  champBgActif: '#ffffff',
  focusBordure: 'rgba(193, 18, 31, 0.52)',

  voile: 'rgba(24, 24, 24, 0.12)',
  rideau: 'rgba(0, 0, 0, 0.75)',
}

const SOMBRE: Jetons = {
  bg: '#000000',
  surface: '#141414',
  surface2: '#232323',
  surface3: '#2f2f2f',

  text: '#f2f2f2',
  text2: '#bebebe',
  text3: '#8d8d8d',

  line: 'rgba(242, 242, 242, 0.16)',
  lineForte: 'rgba(242, 242, 242, 0.3)',

  // Deux rouges en sombre : le plein pour les aplats, le clair pour le texte.
  // Sur #000, un seul rouge ne peut pas faire les deux — trop sombre il
  // disparaît, trop clair il brûle en aplat.
  accent: '#cf1b29',
  accentEncre: '#f0525f',
  accentSur: '#ffffff',
  accentDoux: 'rgba(240, 82, 95, 0.14)',
  alerte: '#d69b3a',

  blocTache: '#c62330',
  blocObjectif: '#474b50',
  blocAncre: '#2c3a56',
  blocEncreTache: '#fff2f2',
  blocEncreObjectif: '#f2f2f2',
  blocEncreAncre: '#eef2f8',

  champBg: '#141414',
  champBgActif: '#222222',
  focusBordure: 'rgba(240, 82, 95, 0.6)',

  voile: 'rgba(0, 0, 0, 0.5)',
  rideau: 'rgba(0, 0, 0, 0.82)',
}

export const THEMES: Record<NomTheme, Jetons> = { clair: CLAIR, sombre: SOMBRE }

/** Rayons. Vethos est anguleux : rien n'est arrondi au-delà de 8. */
export const RAYON = { sm: 3, md: 5, lg: 6, xl: 8 } as const

/**
 * L'échelle d'espacement. Un seul pas de 4, jamais de valeur intermédiaire :
 * c'est ce qui fait qu'une interface « tombe juste » sans qu'on sache pourquoi.
 */
export const PAS = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48 } as const

/**
 * Durées et courbes. Identiques au bureau pour que les deux applications
 * bougent de la même façon.
 */
export const MOUVEMENT = {
  rapide: 150,
  normal: 240,
  lent: 360,
  /** Ressort d'Apple : démarre vite, s'arrête sans rebond. */
  ressort: { damping: 22, stiffness: 240, mass: 0.9 },
} as const
