/**
 * La lumière de Vethos suit le soleil. Une seule source de vérité pour la
 * teinte du fond, la couleur d'accent de l'heure, et la place de la lueur.
 * Transcrit de la maquette `build/Vethos.html` ; aucune dépendance à React.
 */
export type RVB = [number, number, number]

const ss = (a: number, b: number, x: number) => {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return k * k * (3 - 2 * k)
}
const sm = (k: number) => k * k * (3 - 2 * k)
const melange = (a: RVB, b: RVB, k: number): RVB => a.map((v, i) => v + (b[i]! - v) * k) as RVB

const LEVER = 6.5
const COUCHER = 20.5
const SOIR: [number, RVB][] = [
  [-16, [0.62, 0.68, 0.95]], [-6, [0.52, 0.52, 0.84]], [-2, [0.74, 0.66, 0.84]],
  [2, [1, 0.8, 0.68]], [8, [1, 0.88, 0.74]], [20, [1, 0.95, 0.87]], [35, [1, 0.98, 0.95]],
]
const MATIN: [number, RVB][] = [
  [-16, [0.62, 0.68, 0.95]], [-6, [0.5, 0.56, 0.88]], [-2, [0.78, 0.74, 0.9]],
  [2, [1, 0.84, 0.78]], [8, [0.99, 0.92, 0.86]], [20, [0.98, 0.97, 0.93]], [35, [1, 0.98, 0.95]],
]
const paliers = (S: [number, RVB][], e: number): RVB => {
  if (e <= S[0]![0]) return S[0]![1]
  for (let i = 0; i < S.length - 1; i++) {
    const [a, A] = S[i]!
    const [b, B] = S[i + 1]!
    if (e <= b) return melange(A, B, ss(a, b, e))
  }
  return S[S.length - 1]![1]
}

/** La lumière à l'heure H (décimale) : teinte, intensité, étroitesse, position (x, y vers le haut). */
export function lumiere(H: number) {
  let el: number, ang: number, matin: boolean
  if (H >= LEVER && H < COUCHER) {
    const p = (H - LEVER) / (COUCHER - LEVER)
    el = Math.sin(p * Math.PI) * 62
    ang = Math.PI - p * Math.PI
    matin = p < 0.5
  } else {
    const q = ((H - COUCHER + 24) % 24) / (24 - (COUCHER - LEVER))
    el = -Math.sin(q * Math.PI) * 40
    ang = -q * Math.PI
    matin = q > 0.5
  }
  const tc = paliers(matin ? MATIN : SOIR, el)
  const li = 0.42 + 1.28 * Math.pow(ss(-10, 40, el), 1.1)
  return {
    tc,
    li,
    lt: 1.8 + 0.8 * ss(0, 50, el),
    lp: [0.5 + Math.cos(ang) * 1.3, 0.5 + Math.sin(ang) * 0.6] as [number, number],
    el,
  }
}

const versTsl = ([r, g, b]: RVB): RVB => {
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const l = (mx + mn) / 2
  let h = 0
  let s = 0
  if (mx !== mn) {
    const d = mx - mn
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
    h /= 6
  }
  return [h, s, l]
}
const depuisTsl = ([h, s, l]: RVB): RVB => {
  if (!s) return [l, l, l]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const f = (t: number) => {
    t = (t + 1) % 1
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p
  }
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)]
}
export const hex = (a: RVB) =>
  '#' + a.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
const hex3 = (s: string): RVB => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16)) as RVB

/** L'accent de l'app à cette heure : la teinte de la lumière, saturée. */
export function accentApp(H: number) {
  const [h, s] = versTsl(lumiere(H).tc)
  return hex(depuisTsl([h, Math.min(0.75, Math.max(0.38, s * 1.6)), 0.64]).map((v) => v * 255) as RVB)
}
/** La teinte du jour, en hex, pour les reflets des surfaces. */
export const teinteApp = (H: number) => hex(lumiere(H).tc.map((x) => x * 255) as RVB)

/** L'accent de l'introduction : bleu la nuit, ambre à midi, orchidée le soir, violet tard. Jamais de rouge. */
const KF: [number, string][] = [
  [0, '#6a73f0'], [5, '#6a73f0'], [7, '#4f8ff5'], [10, '#8fb2f5'], [12, '#e9a93f'], [15.5, '#e9a93f'],
  [17.5, '#e0902c'], [19.5, '#c77ab8'], [21, '#a45ad8'], [23, '#8c45d6'], [24, '#6a73f0'],
]
function accentRvb(h: number): RVB {
  for (let i = 0; i < KF.length - 1; i++) {
    const [a, ca] = KF[i]!
    const [b, cb] = KF[i + 1]!
    if (h >= a && h <= b) return melange(hex3(ca), hex3(cb), sm((h - a) / (b - a)))
  }
  return hex3(KF[0]![1])
}
export const accentIntro = (h: number) => hex(accentRvb(h))
/** Le même, éclairci pour du texte. */
export const encreIntro = (h: number) => hex(accentRvb(h).map((v) => v + (255 - v) * 0.22) as RVB)

const TK: [number, RVB][] = [
  [0, [0.35, 0.42, 0.75]], [5, [0.35, 0.42, 0.75]], [8, [0.78, 0.84, 1]], [12, [1, 0.98, 0.95]],
  [16, [1, 0.98, 0.95]], [19, [1, 0.72, 0.45]], [21, [0.64, 0.4, 0.85]], [24, [0.35, 0.42, 0.75]],
]
export function teinteIntro(h: number): RVB {
  for (let i = 0; i < TK.length - 1; i++) {
    const [a, A] = TK[i]!
    const [b, B] = TK[i + 1]!
    if (h >= a && h <= b) return melange(A, B, sm((h - a) / (b - a)))
  }
  return TK[0]![1]
}
export const accentRvbIntro = (h: number): RVB => accentRvb(h).map((v) => v / 255) as RVB

/** La lueur de l'introduction : son intensité suit le jour. */
export const jourDe = (H: number) =>
  sm(Math.min(1, Math.max(0, (H - 4.5) / 3.5))) * (1 - sm(Math.min(1, Math.max(0, (H - 20) / 3.5))))

export const heureDecimale = (d = new Date()) => d.getHours() + d.getMinutes() / 60
