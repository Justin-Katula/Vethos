import { motion, useReducedMotion } from 'framer-motion'

/**
 * LE DÉPART EST ANNONCÉ
 *
 * Le tableau ne lance pas de confettis quand un train part. Il affiche la
 * ligne, et la ligne s'allume. La fin de l'installation se dit dans la
 * grammaire du base : une barre qui se remplit, et la suite.
 */
export function DonePage(): JSX.Element {
  const reduce = useReducedMotion()

  return (
    <div className="flex min-h-[420px] w-full flex-col items-center justify-center">
      <div className="w-full max-w-md">
        <div className="flex items-baseline justify-between border-b border-line pb-3">
          <span className="font-mono text-[13px] text-fg-3">Departure</span>
          <span className="font-mono text-[13px] text-accent">on time</span>
        </div>

        {/* La barre se remplit : c'est le seul mouvement, et il dit que le
            réglage est fait, pas qu'il faut applaudir. */}
        <div className="relative h-[2px] w-full overflow-hidden bg-line">
          <motion.div
            className="absolute inset-y-0 left-0 bg-accent"
            initial={{ width: reduce ? '100%' : 0 }}
            animate={{ width: '100%' }}
            transition={{ duration: reduce ? 0 : 1.1, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>

        <h1 className="mt-8 text-3xl font-medium text-fg">The board is in service.</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-fg-2">
          Declare your time once in “My time”. From there, the app places the work itself
          and asks you nothing more.
        </p>
      </div>
    </div>
  )
}
