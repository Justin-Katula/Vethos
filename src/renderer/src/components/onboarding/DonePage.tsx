import { motion, useReducedMotion } from 'framer-motion'

/**
 * LE DÉPART EST ANNONCÉ
 *
 * Le tableau ne lance pas de confettis quand un train part. Il affiche la
 * ligne, et la ligne s'allume. La fin de l'installation se dit dans la
 * grammaire du hall : une barre qui se remplit, et la suite.
 */
export function DonePage(): JSX.Element {
  const reduce = useReducedMotion()

  return (
    <div className="flex min-h-[420px] w-full flex-col items-center justify-center">
      <div className="w-full max-w-md">
        <div className="flex items-baseline justify-between border-b border-rail pb-3">
          <span className="font-mono text-[13px] text-ink-3">Départ</span>
          <span className="font-mono text-[13px] text-signal">à l’heure</span>
        </div>

        {/* La barre se remplit : c'est le seul mouvement, et il dit que le
            réglage est fait, pas qu'il faut applaudir. */}
        <div className="relative h-[2px] w-full overflow-hidden bg-rail">
          <motion.div
            className="absolute inset-y-0 left-0 bg-signal"
            initial={{ width: reduce ? '100%' : 0 }}
            animate={{ width: '100%' }}
            transition={{ duration: reduce ? 0 : 1.1, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>

        <h1 className="mt-8 text-3xl font-medium text-ink">Le tableau est en service.</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
          Déclare ton temps une fois dans « Mon temps ». À partir de là, l’application place le
          travail elle-même et ne te demande plus rien.
        </p>
      </div>
    </div>
  )
}
