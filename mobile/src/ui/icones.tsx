import Svg, { Path } from 'react-native-svg'

/**
 * Les icônes, dessinées.
 *
 * Un `✕` tapé au clavier n'est pas une icône : c'est un caractère, dont le
 * dessin change d'une police à l'autre et dont l'épaisseur ne s'accorde à rien.
 * Celles-ci partagent une grille de 24, un trait de 1,6 et des bouts arrondis —
 * la même famille, toujours.
 */

type Props = { taille?: number; couleur: string; epaisseur?: number }

function Trait({ d, taille = 16, couleur, epaisseur = 1.6 }: Props & { d: string }) {
  return (
    <Svg width={taille} height={taille} viewBox="0 0 24 24" fill="none">
      <Path
        d={d}
        stroke={couleur}
        strokeWidth={epaisseur}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export const Plus = (p: Props) => <Trait {...p} d="M12 5v14M5 12h14" />
export const Croix = (p: Props) => <Trait {...p} d="M6 6l12 12M18 6L6 18" />
export const Coche = (p: Props) => <Trait {...p} d="M4.5 12.5l5 5 10-11" epaisseur={p.epaisseur ?? 2} />
export const Chevron = (p: Props) => <Trait {...p} d="M9 5l7 7-7 7" />

/** Les quatre glyphes de la barre d'onglets. Géométrie pure, même grille. */
export const GlypheJour = (p: Props) => (
  <Trait {...p} taille={p.taille ?? 20} d="M12 3a9 9 0 100 18 9 9 0 000-18zM12 7.5V12l3 2" />
)
export const GlypheEngagements = (p: Props) => (
  <Trait {...p} taille={p.taille ?? 20} d="M4 7h16M4 12h11M4 17h7" />
)
export const GlypheBlocage = (p: Props) => (
  <Trait {...p} taille={p.taille ?? 20} d="M12 3l7 3v5c0 4.2-2.9 7.8-7 9-4.1-1.2-7-4.8-7-9V6l7-3z" />
)
export const GlypheReglages = (p: Props) => (
  <Trait
    {...p}
    taille={p.taille ?? 20}
    d="M5 7h14M5 12h14M5 17h14M9 5v4M15 10v4M11 15v4"
  />
)
