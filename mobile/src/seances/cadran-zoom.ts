/**
 * Le cadran qui zoome sur la séance — la géométrie de l'écran « Shield » de
 * `build/Vethos Block Overlay.dc.html`, transcrite telle quelle. Pur : aucune
 * dépendance à React, vérifiable sans iPhone.
 *
 * Le cadran fait 24 h sur un cercle de rayon 168 centré en (200, 200) ; minuit
 * en haut. La vue part du cadran entier, puis se resserre sur l'arc de la
 * séance (fenêtre 345 × 220).
 */

export const LARGEUR = 345
export const HAUTEUR = 220
const RAPPORT = LARGEUR / HAUTEUR
/** Le zoom commence après ce délai, et dure tant (ms). */
export const ZOOM_DEBUT = 650
export const ZOOM_DUREE = 1600

const angle = (m: number) => (m / 1440) * 2 * Math.PI - Math.PI / 2
export const point = (m: number, r: number): [number, number] => [200 + r * Math.cos(angle(m)), 200 + r * Math.sin(angle(m))]
const f2 = (v: number) => v.toFixed(2)

/** L'arc de `a0` à `a1` (minutes), rayon `r`. Vide s'il n'a pas de longueur. */
export function arc(a0: number, a1: number, r: number): string {
  let sp = a1 - a0
  if (sp <= 0.01) return ''
  sp = Math.min(sp, 1439.9)
  const [x0, y0] = point(a0, r)
  const [x1, y1] = point(a0 + sp, r)
  return `M ${f2(x0)} ${f2(y0)} A ${r} ${r} 0 ${sp > 720 ? 1 : 0} 1 ${f2(x1)} ${f2(y1)}`
}

export const trait = (m: number, r1: number, r2: number) => {
  const [x1, y1] = point(m, r1)
  const [x2, y2] = point(m, r2)
  return { x1: f2(x1), y1: f2(y1), x2: f2(x2), y2: f2(y2) }
}

/** L'accélération du zoom : douce aux deux bouts. */
export const adoucir = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/** La part du zoom (0 → 1) à `ms` après l'apparition. */
export function avancementZoom(ms: number): number {
  return adoucir(Math.max(0, Math.min(1, (ms - ZOOM_DEBUT) / ZOOM_DUREE)))
}

export type Vue = { x: number; y: number; w: number; h: number; parUnite: number }

/**
 * La fenêtre sur le cadran pour une séance de `debut` à `fin` (minutes, `fin`
 * peut dépasser 1440) au zoom `z` : du cadran entier (z = 0) à l'arc seul,
 * avec une marge (z = 1). La largeur suit une interpolation logarithmique,
 * pour que le zoom paraisse régulier à l'œil.
 */
export function vue(debut: number, fin: number, z: number): Vue {
  const duree = fin - debut
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let i = 0; i <= 40; i++) {
    const m = debut + (duree * i) / 40
    for (const r of [146, 192]) {
      const [x, y] = point(m, r)
      x0 = Math.min(x0, x)
      y0 = Math.min(y0, y)
      x1 = Math.max(x1, x)
      y1 = Math.max(y1, y)
    }
  }
  let tw = x1 - x0 + 36
  const th = y1 - y0 + 36
  if (tw / th < RAPPORT) tw = th * RAPPORT
  const cible = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 }
  const w0 = 430 * RAPPORT
  const w = Math.exp(Math.log(w0) + (Math.log(tw) - Math.log(w0)) * z)
  const h = w / RAPPORT
  const cx = 200 + (cible.cx - 200) * z
  const cy = 200 + (cible.cy - 200) * z
  return { x: cx - w / 2, y: cy - h / 2, w, h, parUnite: LARGEUR / w }
}

/** Une heure du cadran, placée dans la fenêtre (pixels de la fenêtre 345 × 220). */
export function etiquette(m: number, v: Vue): { x: number; y: number } {
  const [x, y] = point(m, 150)
  return { x: (x - v.x) * v.parUnite, y: (y - v.y) * v.parUnite }
}

/** Le sablier : le sable du haut se vide à mesure que la séance avance (0 → 1). */
export function sablier(avancement: number): { haut: string; bas: string; filet: number | null } {
  const reste = 1 - Math.max(0, Math.min(1, avancement))
  const kh = Math.sqrt(reste) * 0.9
  const kb = Math.max(Math.sqrt(1 - reste) * 0.9, 0.05)
  return {
    haut: `${f2(12 - 4.6 * kh)},${f2(12 - 5.6 * kh)} ${f2(12 + 4.6 * kh)},${f2(12 - 5.6 * kh)} 12,12`,
    bas: `${f2(12 - 4.6 * kb)},21.2 ${f2(12 + 4.6 * kb)},21.2 12,${f2(21.2 - 4.4 * kb)}`,
    filet: reste > 0.01 && reste < 0.999 ? 21.2 - 4.4 * kb : null,
  }
}

/** Les 96 graduations (un quart d'heure) : six heures, heures, quarts. */
export const GRADUATIONS = Array.from({ length: 96 }, (_, i) => {
  const six = i % 24 === 0
  const heure = i % 4 === 0
  return { ...trait(i * 15, six ? 178 : heure ? 180 : 182, six ? 192 : heure ? 188 : 185), sorte: six ? 'six' : heure ? 'heure' : 'quart' } as const
})

/** Les traits de 5 minutes, qui n'apparaissent qu'avec le zoom. */
export const MINUTES = Array.from({ length: 288 }, (_, i) => i)
  .filter((i) => i % 3 !== 0)
  .map((i) => ({ m: i * 5, ...trait(i * 5, 184, 187) }))
