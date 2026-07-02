import { motion } from 'framer-motion'
import { Star } from 'lucide-react'

type Props = {
  /** Niveau entier affiché. */
  level: number
  /** Progression 0..1 vers le niveau suivant */
  progress: number
  /** Diamètre en pixels */
  size?: number
  /** Couleur principale (HEX). Défaut violet. */
  color?: string
  /** True = niveau max, étoile dorée affichée */
  isMax?: boolean
}

/**
 * Anneau circulaire SVG : track gris + arc coloré + chiffre central.
 * Étoile dorée si le niveau max est atteint.
 */
export function LevelRing({
  level,
  progress,
  size = 80,
  color = '#a78bfa',
  isMax = false,
}: Props): JSX.Element {
  const stroke = Math.max(4, Math.round(size * 0.08))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = isMax ? 1 : Math.max(0, Math.min(1, progress))
  const dashOffset = c * (1 - clamped)

  const cx = size / 2
  const cy = size / 2
  const fontSize = Math.round(size * 0.36)

  return (
    <div
      style={{ width: size, height: size }}
      className="relative inline-flex items-center justify-center"
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Track */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
        />
        {/* Progress arc */}
        <motion.circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={isMax ? '#fbbf24' : color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: dashOffset }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </svg>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        {isMax ? (
          <Star
            className="text-amber-400"
            fill="currentColor"
            size={Math.round(size * 0.42)}
          />
        ) : (
          <span
            className="font-bold tabular-nums text-white"
            style={{ fontSize, lineHeight: 1 }}
          >
            {level}
          </span>
        )}
      </div>
    </div>
  )
}
