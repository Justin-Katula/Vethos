import { useEffect, useMemo, useState } from 'react'
import { Eye, EyeOff, Lock, LogIn, Mail, User, UserPlus } from 'lucide-react'
import { NexusLogo } from '@/components/NexusLogo'
import { cn } from '@/lib/cn'
import { useAuthStore } from '@/store/auth.store'

/**
 * LE PREMIER ÉCRAN
 *
 * Deux moitiés qui ne font pas le même travail. À gauche, l'objet et une
 * phrase : c'est tout ce que cet écran a à promettre. À droite, le formulaire,
 * et rien qui le décore — un champ qui brille n'aide personne à le remplir.
 *
 * Deux défauts corrigés au passage, tous les deux invisibles à la relecture du
 * code et évidents à l'écran :
 *   - le trait de séparation était en `bg-border-subtle`, une classe qui
 *     n'existe dans aucun thème : il ne s'est jamais affiché.
 *   - le bouton d'envoi était en `bg-fg text-white`, c'est-à-dire du blanc sur
 *     du blanc. Le libellé était là, personne ne pouvait le lire.
 */

type AuthMode = 'sign-in' | 'sign-up'

export default function AuthPage(): JSX.Element {
  const account = useAuthStore((s) => s.account)
  const signIn = useAuthStore((s) => s.signIn)
  const signUp = useAuthStore((s) => s.signUp)

  const hasAccount = Boolean(account)
  const [mode, setMode] = useState<AuthMode>(hasAccount ? 'sign-in' : 'sign-up')
  const [name, setName] = useState('')
  const [email, setEmail] = useState(account?.email ?? '')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setMode(hasAccount ? 'sign-in' : 'sign-up')
    if (account?.email) setEmail(account.email)
  }, [account?.email, hasAccount])

  const title = mode === 'sign-up' ? 'Create your account' : 'Sign in'
  const submitLabel = mode === 'sign-up' ? 'Create the account' : 'Sign in'
  const SubmitIcon = mode === 'sign-up' ? UserPlus : LogIn

  const canSwitchMode = useMemo(() => {
    return mode === 'sign-in' ? !hasAccount : true
  }, [hasAccount, mode])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (mode === 'sign-up' && password !== confirmPassword) {
      setError('The passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      if (mode === 'sign-up') {
        await signUp({ name, email, password })
      } else {
        await signIn({ email, password })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  const switchMode = () => {
    setError(null)
    setPassword('')
    setConfirmPassword('')
    setMode((current) => (current === 'sign-in' ? 'sign-up' : 'sign-in'))
  }

  return (
    <div className="grid h-[100dvh] w-screen grid-cols-1 overflow-hidden bg-base text-fg lg:grid-cols-[minmax(360px,0.9fr)_1.1fr]">
      <section className="hidden min-h-0 flex-col justify-between border-r border-line bg-surface/70 px-14 py-12 lg:flex">
        <NexusLogo size={34} />
        <div>
          <div className="mb-6 h-[2px] w-28 bg-accent" />
          <h1 className="max-w-sm text-[30px] font-semibold leading-tight text-fg">
            Ton temps reste local. Le plan reste lisible.
          </h1>
          <p className="mt-5 max-w-sm text-[14px] leading-relaxed text-fg-2">
            Vethos works out your work windows from your real commitments and protects the
            sessions quand elles commencent.
          </p>
        </div>
        <p className="text-[12px] text-fg-3">Everything stays on this machine.</p>
      </section>

      <main className="flex min-h-0 items-center justify-center px-5 py-8 sm:px-10">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 lg:hidden">
            <NexusLogo size={30} />
          </div>

          <header className="mb-8">
            <h1 className="mt-2.5 text-[28px] font-semibold leading-tight">{title}</h1>
            <p className="mt-2.5 text-[14px] leading-relaxed text-fg-2">
              {mode === 'sign-up'
                ? 'Create a sign-in to protect your local space.'
                : account?.name
                  ? `Bon retour, ${account.name}.`
                  : 'Enter your credentials to continue.'}
            </p>
          </header>

          <form
            className="space-y-4"
            onSubmit={(event) => {
              void handleSubmit(event)
            }}
          >
            {mode === 'sign-up' && (
              <AuthField label="Nom" icon={<User size={16} />}>
                <input
                  type="text"
                  name="name"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-fg-3"
                  placeholder="Ton nom"
                />
              </AuthField>
            )}

            <AuthField label="Email" icon={<Mail size={16} />}>
              <input
                type="email"
                name="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-fg-3"
                placeholder="toi@example.com"
              />
            </AuthField>

            <AuthField label="Mot de passe" icon={<Lock size={16} />}>
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-fg-3"
                placeholder="8 characters minimum"
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="rounded p-1 text-fg-3 transition-colors hover:bg-surface-2 hover:text-fg"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                <span className="sr-only">
                  {showPassword ? 'Hide the password' : 'Show the password'}
                </span>
              </button>
            </AuthField>

            {mode === 'sign-up' && (
              <AuthField label="Confirmer le mot de passe" icon={<Lock size={16} />}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="confirm-password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-[14px] text-fg outline-none placeholder:text-fg-3"
                  placeholder="Repeat the password"
                />
              </AuthField>
            )}

            {error && (
              <p className="rounded-md border border-warn/30 bg-warn/[0.07] px-4 py-2.5 text-[13px] text-warn">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="btn-iris pressable mt-2 h-12 w-full"
            >
              <SubmitIcon size={17} />
              {submitting ? 'Working…' : submitLabel}
            </button>
          </form>

          <div className="mt-7 flex items-center justify-between gap-3 text-[13.5px]">
            <span className="text-fg-3">
              {mode === 'sign-up' ? 'Already have an account?' : 'No account yet?'}
            </span>
            <button
              type="button"
              onClick={switchMode}
              disabled={!canSwitchMode}
              className={cn(
                'rounded px-2 py-1 font-medium transition-colors',
                canSwitchMode ? 'text-accent hover:brightness-110' : 'cursor-not-allowed text-fg-3',
              )}
            >
              {mode === 'sign-up' ? 'Sign in' : 'Create an account'}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}

/**
 * Un champ avec son intitulé et son icône. L'anneau de focus est braise : sur
 * cet écran, c'est le seul endroit où la couleur a le droit d'apparaître, et
 * elle ne dit qu'une chose — c'est ici que tu écris.
 */
function AuthField({
  label,
  icon,
  children,
}: {
  label: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-fg-3">{label}</span>
      {/* `--field-bg-active` et non `bg-white` : le champ actif se décolle de la
          page dans les deux thèmes, au lieu d'être blanc dans les deux. */}
      <span className="mt-2 flex items-center gap-2.5 rounded border border-line bg-surface px-3.5 py-3 transition-colors focus-within:border-accent/50 focus-within:bg-[var(--field-bg-active)]">
        <span className="shrink-0 text-fg-3">{icon}</span>
        {children}
      </span>
    </label>
  )
}
