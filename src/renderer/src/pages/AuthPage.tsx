import { useEffect, useMemo, useState } from 'react'
import { Eye, EyeOff, Lock, LogIn, Mail, User, UserPlus } from 'lucide-react'
import { NexusLogo } from '@/components/NexusLogo'
import { cn } from '@/lib/cn'
import { useAuthStore } from '@/store/auth.store'

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

  const title = mode === 'sign-up' ? 'Créer ton compte' : 'Connexion'
  const submitLabel = mode === 'sign-up' ? 'Créer le compte' : 'Se connecter'
  const SubmitIcon = mode === 'sign-up' ? UserPlus : LogIn

  const canSwitchMode = useMemo(() => {
    return mode === 'sign-in' ? !hasAccount : true
  }, [hasAccount, mode])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (mode === 'sign-up' && password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.')
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
    <div className="grid h-screen w-screen grid-cols-1 overflow-hidden bg-bg-base text-text-primary lg:grid-cols-[minmax(320px,0.95fr)_minmax(420px,1.05fr)]">
      <section className="hidden min-h-0 flex-col justify-between border-r border-border-subtle bg-bg-elevated px-10 py-9 lg:flex">
        <div>
          <NexusLogo size={32} />
          <p className="mt-4 max-w-sm text-sm leading-6 text-text-secondary">
            Ton espace de focus reste lié à ce profil local sur cette machine.
          </p>
        </div>
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase text-text-muted">Session locale</p>
          <div className="h-px w-full bg-border-subtle" />
          <p className="max-w-sm text-sm leading-6 text-text-secondary">
            Connecte-toi pour retrouver tes objectifs, tes tâches, ton planning et tes règles de
            blocage.
          </p>
        </div>
      </section>

      <main className="flex min-h-0 items-center justify-center px-5 py-8 sm:px-8">
        <div className="w-full max-w-[430px] rounded-lg border border-border-subtle bg-bg-card p-6 shadow-elevated sm:p-8">
          <div className="mb-7 lg:hidden">
            <NexusLogo size={30} />
          </div>

          <header className="mb-7">
            <p className="text-xs font-medium uppercase text-text-muted">Vethos</p>
            <h1 className="mt-2 text-2xl font-semibold">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              {mode === 'sign-up'
                ? 'Crée un accès pour protéger ton espace local.'
                : account?.name
                  ? `Bon retour, ${account.name}.`
                  : 'Entre tes identifiants pour continuer.'}
            </p>
          </header>

          <form className="space-y-4" onSubmit={handleSubmit}>
            {mode === 'sign-up' && (
              <label className="block">
                <span className="text-xs font-medium uppercase text-text-muted">Nom</span>
                <span className="mt-2 flex items-center gap-2 rounded-md border border-border-subtle bg-bg-base px-3 py-2.5 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30">
                  <User size={16} className="shrink-0 text-text-muted" />
                  <input
                    type="text"
                    autoComplete="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
                    placeholder="Ton nom"
                  />
                </span>
              </label>
            )}

            <label className="block">
              <span className="text-xs font-medium uppercase text-text-muted">Email</span>
              <span className="mt-2 flex items-center gap-2 rounded-md border border-border-subtle bg-bg-base px-3 py-2.5 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30">
                <Mail size={16} className="shrink-0 text-text-muted" />
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
                  placeholder="toi@example.com"
                />
              </span>
            </label>

            <label className="block">
              <span className="text-xs font-medium uppercase text-text-muted">Mot de passe</span>
              <span className="mt-2 flex items-center gap-2 rounded-md border border-border-subtle bg-bg-base px-3 py-2.5 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30">
                <Lock size={16} className="shrink-0 text-text-muted" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
                  placeholder="8 caractères minimum"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="rounded-md p-1 text-text-muted transition-colors hover:text-text-primary"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  <span className="sr-only">
                    {showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  </span>
                </button>
              </span>
            </label>

            {mode === 'sign-up' && (
              <label className="block">
                <span className="text-xs font-medium uppercase text-text-muted">
                  Confirmer le mot de passe
                </span>
                <span className="mt-2 flex items-center gap-2 rounded-md border border-border-subtle bg-bg-base px-3 py-2.5 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30">
                  <Lock size={16} className="shrink-0 text-text-muted" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
                    placeholder="Répète le mot de passe"
                  />
                </span>
              </label>
            )}

            {error && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className={cn(
                'inline-flex h-11 w-full items-center justify-center gap-2 rounded-md px-4',
                'text-sm font-medium transition-all duration-200',
                submitting
                  ? 'cursor-wait bg-bg-card-hover text-text-muted'
                  : 'bg-accent text-white hover:bg-accent-hover',
              )}
            >
              <SubmitIcon size={17} />
              {submitting ? 'Traitement...' : submitLabel}
            </button>
          </form>

          <div className="mt-6 flex items-center justify-between gap-3 text-sm">
            <span className="text-text-muted">
              {mode === 'sign-up' ? 'Déjà un compte ?' : 'Pas encore de compte ?'}
            </span>
            <button
              type="button"
              onClick={switchMode}
              disabled={!canSwitchMode}
              className={cn(
                'rounded-md px-2 py-1 font-medium transition-colors',
                canSwitchMode
                  ? 'text-accent hover:text-accent-hover'
                  : 'cursor-not-allowed text-text-muted',
              )}
            >
              {mode === 'sign-up' ? 'Se connecter' : 'Créer un compte'}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}

