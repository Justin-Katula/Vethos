import type { ScheduleCategory } from '@shared/schemas'
import type { BlockKind } from '@shared/planning/types'
import type { Theme } from '@shared/theme'

/**
 * Couleurs de planning.
 *
 * Le gris-vert clair porte la réalité fixe : sommeil, cours, travail, trajet.
 * Le rouge est réservé à la contrainte active. Les engagements personnels ont
 * chacun une teinte sombre ou mate pour rester lisibles dans la grille sans
 * transformer le calendrier en nuancier.
 *
 * ── Pourquoi ce fichier calcule au lieu de lire des variables CSS ──────────
 *
 * Tout ce qui est purement décoratif (blocs du moteur, pauses) est un jeton
 * dans `globals.css`, et se réécrit d'un thème à l'autre sans code. Mais la
 * couleur d'une entrée d'emploi du temps, d'un objectif ou d'une ancre est
 * ÉCRITE DANS LES DONNÉES de l'utilisateur, en hexadécimal, et le schéma
 * l'exige (`HEX_COLOR_REGEX`). On ne peut donc pas y ranger un `var(--…)`.
 *
 * D'où `entryFill` / `entryMark` : la valeur stockée reste l'identité de la
 * chose — sa teinte —, et le thème décide de ce qu'on en affiche. Sans ça, un
 * bloc « Sommeil » gardé en #d6d9d0 recevrait de l'encre claire la nuit, sur du
 * gris pâle : illisible. Et une ancre en #253047 disparaîtrait dans le fond.
 */

/**
 * Les deux catégories qui étaient vertes (`sleep`, `commitment`) sont devenues
 * des gris francs, distincts l'un de l'autre par la clarté. Les quatre autres
 * ne bougent pas : elles tenaient déjà par une nuance froide ou chaude.
 *
 * Contrainte à connaître avant de retoucher ces valeurs : en thème sombre,
 * `entryFill` comprime toutes ces clartés dans une bande de six points, donc
 * **deux catégories ne peuvent s'y distinguer que par la nuance**. Le vert
 * occupait deux de ces nuances ; sans lui, `sleep` et `commitment` se
 * ressemblent la nuit. C'est assumé : ils ne se touchent jamais dans la grille
 * (l'un à l'aube, l'autre le soir) et chacun porte son étiquette.
 */
export const CATEGORY_COLOR: Record<ScheduleCategory, string> = {
  sleep: '#d9d9d9',
  school: '#c9d4de',
  work: '#d8d1c3',
  commute: '#d3d6da',
  commitment: '#c6c6c6',
  custom: '#dad7cf',
}

export const CATEGORY_LABEL: Record<ScheduleCategory, string> = {
  sleep: 'Sommeil',
  school: 'École',
  work: 'Travail',
  commute: 'Trajet',
  commitment: 'Engagement',
  custom: 'Autre',
}

export const BLOCK_COLOR: Record<BlockKind, string> = {
  task: 'var(--block-task)',
  objective: 'var(--block-objective)',
  ancre: 'var(--block-ancre)',
}

export const BLOCK_INK: Record<BlockKind, string> = {
  task: 'var(--block-ink-task)',
  objective: 'var(--block-ink-objective)',
  ancre: 'var(--block-ink-ancre)',
}

export const BREAK_VEIL = 'var(--break-veil)'
export const BREAK_HATCH = 'var(--break-hatch)'
export const BREAK_SEAM = 'var(--break-seam)'

/**
 * Les teintes d'engagement vivent dans `@shared/teintes` : le téléphone en a
 * besoin des MÊMES, et deux listes finiraient par ne plus se ressembler.
 */
export {
  TEINTES as CHOOSABLE_SHADES,
  teinteSuivante as nextShade,
  PALETTE_OBJECTIFS,
  PALETTE_TACHES,
  PALETTE_ANCRES,
  PALETTE_ENCRE,
  COULEUR_OBJECTIF,
  COULEUR_TACHE,
  COULEUR_ANCRE,
  COULEUR_ENCRE,
  couleurObjectif,
  couleurTache,
  couleurAncre,
  couleurEncre,
  couleurElement,
  variantesType,
  estCouleurDansFamille,
  assainirCouleur,
  allouerCouleurDisponible,
  allouerCouleurTache,
  allouerCouleurObjectif,
  allouerCouleurAncre,
} from '@shared/teintes'


// ─── Adaptation d'une couleur stockée au thème en cours ────────────────────

type Hsl = { h: number; s: number; l: number }

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

function hexToHsl(hex: string): Hsl | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return null
  const int = parseInt(match[1]!, 16)
  const r = ((int >> 16) & 255) / 255
  const g = ((int >> 8) & 255) / 255
  const b = (int & 255) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  const l = (max + min) / 2
  if (delta === 0) return { h: 0, s: 0, l }

  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min)
  const h =
    max === r
      ? ((g - b) / delta + (g < b ? 6 : 0)) * 60
      : max === g
        ? ((b - r) / delta + 2) * 60
        : ((r - g) / delta + 4) * 60
  return { h, s, l }
}

function hslToHex({ h, s, l }: Hsl): string {
  const hue = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x]
  const channel = (v: number): string =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${channel(r)}${channel(g)}${channel(b)}`
}

/**
 * Aucun vert ne doit s'afficher, jamais.
 *
 * Les défauts ci-dessus ont été dévertis, mais les couleurs déjà enregistrées
 * dans les données de l'utilisateur, elles, contiennent encore l'olive #58664A
 * et le vert pâle #D3DAC9 des versions précédentes. Plutôt qu'une migration qui
 * réécrirait ses fichiers, on refuse le vert au moment de l'AFFICHER : la
 * valeur stockée reste son historique, l'écran n'en montre rien.
 *
 * On retire la teinte sans toucher à la clarté — un bloc garde donc exactement
 * son poids dans la grille, il perd seulement sa couleur.
 */
const GREEN_FROM = 60
const GREEN_TO = 170

/**
 * Le seuil est bas — 2 % — parce que la demande portait sur la NUANCE autant
 * que sur la couleur. L'ancienne teinte gris-vert #6F7671 ne pesait que 3 % de
 * saturation et se lisait quand même sur un grand aplat.
 */
function isGreen({ h, s }: Hsl): boolean {
  return s > 0.02 && h >= GREEN_FROM && h <= GREEN_TO
}

function withoutGreen(hsl: Hsl): Hsl {
  return isGreen(hsl) ? { h: 0, s: 0, l: hsl.l } : hsl
}

/**
 * Une SURFACE qui porte du texte : un bloc de la grille, une pastille pleine.
 *
 * En clair, la valeur stockée est déjà juste — elle a été choisie pour ce
 * thème-là, et on la rend telle quelle (sauf si elle est verte). En sombre, on
 * garde la teinte (c'est elle qui identifie la catégorie) et on ramène clarté
 * et saturation dans une bande étroite : assez au-dessus de la surface pour que
 * le bloc se détache, assez sous l'encre pour la porter. Une couleur illisible
 * retombe sur la surface neutre plutôt que de casser le rendu.
 */
export function entryFill(color: string, theme: Theme): string {
  const parsed = hexToHsl(color)
  if (!parsed) return 'var(--surface-3)'
  const hsl = withoutGreen(parsed)
  // En clair on rend la chaîne d'origine plutôt qu'un aller-retour HSL, qui
  // décalerait la valeur d'un point sur 255 sans aucune raison.
  if (theme === 'light') return hsl === parsed ? color : hslToHex(hsl)
  // Bande calee sur un fond de colonne a #0F110E : l'encre secondaire y rend
  // 5.2 et l'encre tertiaire 2.95 — la valeur exacte du theme clair — pendant
  // que le bloc se detache de 1.42 a 1.94, la ou le clair se contente de 1.24.
  return hslToHex({
    h: hsl.h,
    s: clamp(hsl.s, 0, 0.24),
    l: clamp(0.185 + hsl.l * 0.085, 0.17, 0.235),
  })
}

/**
 * Une MARQUE qui doit se voir sur le fond : un trait du cadran, un arc, un
 * liseré. Rien ne s'écrit dessus, donc elle monte au contraire de `entryFill` —
 * sur presque-noir, un arc à la clarté d'un bloc ne se distingue pas du vide.
 */
export function entryMark(color: string, theme: Theme): string {
  const parsed = hexToHsl(color)
  if (!parsed) return 'var(--line-strong)'
  const hsl = withoutGreen(parsed)
  if (theme === 'light') return hsl === parsed ? color : hslToHex(hsl)
  return hslToHex({
    h: hsl.h,
    s: clamp(hsl.s * 0.95, hsl.s === 0 ? 0 : 0.12, 0.58),
    l: clamp(0.4 + hsl.l * 0.28, 0.5, 0.7),
  })
}
