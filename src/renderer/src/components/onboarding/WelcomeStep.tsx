import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { NexusLogo } from '@/components/NexusLogo'

type Props = {
  onContinue: () => void
}

/**
 * Le tout premier écran qu'on voit de l'application.
 *
 * Il portait un « N » dans un cercle cyan-et-bleu : la lettre de l'ancien nom
 * (Nexus) et deux couleurs qui n'existent nulle part ailleurs dans le produit.
 * Le premier écran est le pire endroit où montrer une identité qu'on a
 * abandonnée — c'est le logo réel qui est posé ici.
 */
export function WelcomeStep({ onContinue }: Props): JSX.Element {
  return (
    <div className="flex flex-col items-center gap-8 text-center">
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="relative flex items-center justify-center"
      >
        <NexusLogo size={116} withWordmark={false} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.25 }}
        className="flex flex-col gap-3"
      >
        <div className="inline-flex items-center justify-center self-center rounded border border-line bg-surface px-3.5 py-1.5 text-[10px] font-semibold text-fg-3">
          Premier lancement
        </div>
        <h1 className="text-[42px] font-bold leading-tight text-fg sm:text-5xl">
          Bienvenue dans Vethos.
        </h1>
        <p className="mx-auto max-w-xl text-base leading-relaxed text-fg-2">
          {
            'En quelques minutes, tu poses ton emploi du temps, tes engagements protégés et ton premier objectif.'
          }
        </p>
      </motion.div>

      <motion.button
        type="button"
        onClick={onContinue}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.25 }}
        whileHover={{ y: -1 }}
        className="btn-iris pressable px-8 py-3.5 text-[15px]"
      >
        Commencer
        <ArrowRight size={18} />
      </motion.button>
    </div>
  )
}
