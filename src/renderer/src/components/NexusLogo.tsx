/**
 * Logo Vethos — bouclier avec un V central entouré d'un cercle segmenté.
 * L'image source (Logo/new-logo.png, 1254px) est downscalée et chroma-keyée
 * (fond blanc → transparent) par scripts/build-logo.mjs.
 */
import logoUrl from '@/assets/vethos-logo.png'

type Props = {
  size?: number
  className?: string
  /** Afficher le wordmark « Vethos » à côté de l'icône. */
  withWordmark?: boolean
}

export function NexusLogo({ size = 28, className, withWordmark = true }: Props) {
  return (
    <div className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <img
        src={logoUrl}
        alt="Vethos"
        width={size}
        height={size}
        // L'image est carrée avec transparence ; elle s'adapte à son conteneur.
        style={{ width: size, height: size, objectFit: 'contain', display: 'block' }}
        draggable={false}
      />
      {/* La taille s'écrit explicitement : `text-base` désignerait la COULEUR
          de fond ici, pas la taille — le thème définit une couleur nommée
          `base`, et Tailwind émet sa règle après celle de la taille. */}
      {withWordmark ? (
        <span className="text-[16px] font-semibold text-fg">Vethos</span>
      ) : null}
    </div>
  )
}
