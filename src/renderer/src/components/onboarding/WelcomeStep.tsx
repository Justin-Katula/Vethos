import { motion } from 'framer-motion'
import { Sparkles, ArrowRight } from 'lucide-react'

type Props = {
  onContinue: () => void
}

export function WelcomeStep({ onContinue }: Props): JSX.Element {
  return (
    <div className="flex flex-col items-center gap-8 text-center">
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="relative"
      >
        <svg width={140} height={140} viewBox="0 0 140 140" className="relative">
          <defs>
            <linearGradient id="welcome-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#3b82f6" />
            </linearGradient>
          </defs>
          <circle
            cx={70}
            cy={70}
            r={58}
            fill="none"
            stroke="url(#welcome-grad)"
            strokeWidth={6}
            strokeLinecap="round"
          />
          <text
            x="70"
            y="86"
            textAnchor="middle"
            fontFamily="Inter, sans-serif"
            fontWeight={700}
            fontSize={52}
            fill="white"
          >
            N
          </text>
        </svg>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.25 }}
        className="flex flex-col gap-3"
      >
        <div className="inline-flex items-center justify-center gap-1.5 self-center rounded-full border border-border-subtle bg-bg-elevated px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-amber-400">
          <Sparkles size={12} />
          Premier lancement
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-text-primary sm:text-5xl">
          Bienvenue dans Nexus.
        </h1>
        <p className="mx-auto max-w-xl text-base leading-relaxed text-text-secondary">
          {"Le travail concentré devient progression mesurable. En 3 minutes, on pose ton emploi du temps, tes engagements protégés, et ton premier objectif."}
        </p>
      </motion.div>

      <motion.button
        type="button"
        onClick={onContinue}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.25 }}
        whileHover={{ y: -2 }}
        className="inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-3 text-base font-semibold text-white shadow-elevated transition-colors hover:bg-accent-hover"
      >
        Commencer
        <ArrowRight size={18} />
      </motion.button>
    </div>
  )
}
