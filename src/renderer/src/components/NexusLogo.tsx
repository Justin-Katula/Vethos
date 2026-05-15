/**
 * Logo Nexus — wordmark inline SVG.
 * Le N est intégré dans un anneau cyan qui évoque le cercle 24h de l'app.
 */
type Props = {
  size?: number
  className?: string
}

export function NexusLogo({ size = 28, className }: Props) {
  return (
    <div className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="nx-ring" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
          <linearGradient id="nx-letter" x1="20" y1="16" x2="44" y2="48" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#e2e8f0" />
            <stop offset="100%" stopColor="#94a3b8" />
          </linearGradient>
        </defs>
        {/* anneau extérieur 75% */}
        <path
          d="M32 6 a26 26 0 1 1 -22.5 39"
          stroke="url(#nx-ring)"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
          opacity="0.9"
        />
        {/* point d'accent en bas */}
        <circle cx="9.5" cy="45" r="2.5" fill="#22d3ee" />
        {/* lettre N stylisée */}
        <path
          d="M22 18 V46 M22 18 L42 46 M42 18 V46"
          stroke="url(#nx-letter)"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
      <span
        className="text-base font-semibold tracking-tight text-text-primary"
      >
        Nexus
      </span>
    </div>
  )
}
