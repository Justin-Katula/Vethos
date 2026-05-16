import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2 } from 'lucide-react'

const CONFETTI_COLORS = [
  '#3b82f6',
  '#06b6d4',
  '#10b981',
  '#a855f7',
  '#ec4899',
  '#f97316',
  '#eab308',
]

type Confetto = {
  x: number
  y: number
  size: number
  color: string
  rot: number
  delay: number
}

function generateConfetti(count: number): Confetto[] {
  const out: Confetto[] = []
  for (let i = 0; i < count; i++) {
    out.push({
      x: Math.random() * 100,
      y: -10 - Math.random() * 30,
      size: 4 + Math.random() * 6,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]!,
      rot: Math.random() * 360,
      delay: Math.random() * 0.4,
    })
  }
  return out
}

export function DonePage(): JSX.Element {
  const confetti = useMemo(() => generateConfetti(60), [])

  return (
    <div className="relative flex h-full min-h-[500px] flex-col items-center justify-center gap-6 text-center">
      {/* Confettis */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {confetti.map((c, i) => (
          <motion.div
            key={i}
            initial={{ y: `${c.y}vh`, x: `${c.x}vw`, opacity: 1, rotate: c.rot }}
            animate={{
              y: '110vh',
              rotate: c.rot + 90,
              opacity: [1, 1, 0],
            }}
            transition={{
              duration: 0.3,
              delay: c.delay,
              ease: [0.4, 0, 0.6, 1],
            }}
            className="absolute"
            style={{
              width: c.size,
              height: c.size * 1.6,
              backgroundColor: c.color,
              borderRadius: 1,
            }}
          />
        ))}
      </div>

      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="relative flex h-24 w-24 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400"
      >
        <CheckCircle2 size={48} strokeWidth={2.4} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.25 }}
      >
        <h1 className="text-4xl font-bold tracking-tight text-text-primary">
          Tout est prêt.
        </h1>
        <p className="mt-3 text-base text-text-secondary">
          Termine une session de focus pour voir tes premiers progrès.
        </p>
      </motion.div>
    </div>
  )
}
