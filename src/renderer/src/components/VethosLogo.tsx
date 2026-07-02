import logoMark from '@/assets/vethos-logo-transparent.png'

type Props = {
  size?: number
  className?: string
  showWordmark?: boolean
}

export function VethosLogo({ size = 28, className, showWordmark = true }: Props) {
  const wordmarkSize = Math.max(16, Math.round(size * 0.46))

  return (
    <div className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <span
        style={{
          alignItems: 'center',
          display: 'inline-flex',
          height: size,
          justifyContent: 'center',
          lineHeight: 0,
          width: size,
          flexShrink: 0,
        }}
      >
        <img
          src={logoMark}
          alt={showWordmark ? '' : 'Vethos'}
          aria-hidden={showWordmark ? true : undefined}
          width={size}
          height={size}
          style={{ display: 'block', flex: 'none', objectFit: 'contain' }}
        />
      </span>
      {showWordmark && (
        <span
          className="font-semibold tracking-tight text-text-primary"
          style={{ fontSize: wordmarkSize, lineHeight: 1 }}
        >
          Vethos
        </span>
      )}
    </div>
  )
}
