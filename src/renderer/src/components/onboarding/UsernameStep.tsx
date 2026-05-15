import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { User } from 'lucide-react'
import { useSettingsStore } from '@/store/settings.store'

export function UsernameStep(): JSX.Element {
  const stored = useSettingsStore((s) => s.username)
  const save = useSettingsStore((s) => s.save)
  const [name, setName] = useState(stored)

  // Persist en debounce 400ms à chaque changement
  useEffect(() => {
    if (name === stored) return
    const t = setTimeout(() => {
      void save(name.trim())
    }, 400)
    return () => clearTimeout(t)
  }, [name, stored, save])

  const trimmed = name.trim()

  return (
    <div className="flex flex-col items-center gap-8 text-center">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/15 text-accent"
      >
        <User size={28} />
      </motion.div>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {trimmed ? `Bienvenue, ${trimmed}.` : 'Comment tu t’appelles ?'}
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          {"Ton prénom apparaît dans l’interface. Tu peux le laisser vide."}
        </p>
      </div>

      <input
        autoFocus
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Alex"
        maxLength={100}
        className="w-full max-w-md rounded-xl border border-border-subtle bg-bg-elevated px-5 py-4 text-center text-2xl font-semibold tracking-tight text-text-primary outline-none transition-colors focus:border-accent focus:ring-4 focus:ring-accent/20"
      />
    </div>
  )
}
