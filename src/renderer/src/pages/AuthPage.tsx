import { useState, type FormEvent, type ReactNode } from 'react'
import { Show, UserButton, useSignIn, useSignUp } from '@clerk/react'
import {
  AlertCircle,
  ArrowRight,
  KeyRound,
  Loader2,
  Lock,
  LogIn,
  Mail,
  Phone,
  RefreshCw,
  ShieldCheck,
  User,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'
import { VethosLogo } from '@/components/VethosLogo'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'

type AuthMode = 'sign-in' | 'sign-up'
type SignInMethod = 'password' | 'code'
type SignInStep = 'credentials' | 'first-code' | 'second-code'
type CodeTarget = 'email' | 'phone'
type SignUpStep = 'details' | 'verify-email' | 'verify-phone'

type ClerkLikeError = {
  errors?: Array<{ longMessage?: string; message?: string }>
  message?: string
}

function clerkErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null) {
    const clerkErr = err as ClerkLikeError
    const first = clerkErr.errors?.[0]
    return first?.longMessage ?? first?.message ?? clerkErr.message ?? fallback
  }
  return fallback
}

function fieldMessage(field?: { message?: string; longMessage?: string } | null): string | null {
  return field?.longMessage ?? field?.message ?? null
}

function isPhoneIdentifier(value: string): boolean {
  const trimmed = value.trim()
  return /^\+?[0-9][0-9\s().-]{5,}$/.test(trimmed) && !trimmed.includes('@')
}

function codeTargetForIdentifier(identifier: string): CodeTarget {
  return isPhoneIdentifier(identifier) ? 'phone' : 'email'
}

function codeTargetLabel(target: CodeTarget): string {
  return target === 'phone' ? 'SMS' : 'email'
}

function hasCodeSecondFactor(
  factors: ReadonlyArray<{ strategy: string }> | null | undefined,
): CodeTarget | null {
  const phone = factors?.find((factor) => factor.strategy === 'phone_code')
  if (phone) return 'phone'
  const email = factors?.find((factor) => factor.strategy === 'email_code')
  return email ? 'email' : null
}

export default function AuthPage(): JSX.Element {
  const [mode, setMode] = useState<AuthMode>('sign-in')
  const isSignIn = mode === 'sign-in'

  return (
    <div className="grid h-screen w-screen grid-cols-1 overflow-hidden bg-bg-base text-text-primary lg:grid-cols-[minmax(320px,0.9fr)_minmax(440px,1.1fr)]">
      <section className="hidden min-h-0 flex-col justify-between border-r border-border-subtle bg-bg-elevated px-10 py-9 lg:flex">
        <div>
          <VethosLogo size={34} />
          <p className="mt-5 max-w-sm text-sm leading-6 text-text-secondary">
            Ton compte sert maintenant d&apos;identité stable pour séparer les données locales et
            préparer la synchronisation.
          </p>
        </div>

        <div className="space-y-5">
          <AuthProof
            icon={ShieldCheck}
            title="Session vérifiée"
            description="Connexion gérée par Clerk, interface gardée côté Vethos."
          />
          <AuthProof
            icon={KeyRound}
            title="Données par compte"
            description="Les prochains fichiers JSON peuvent être associés à ton userId Clerk."
          />
        </div>
      </section>

      <main className="flex min-h-0 items-center justify-center px-5 py-8 sm:px-8">
        <div className="w-full max-w-[440px]">
          <div className="mb-7 flex items-center justify-between lg:hidden">
            <VethosLogo size={30} />
            <Show when="signed-in">
              <UserButton />
            </Show>
          </div>

          <div className="info-panel rounded-lg p-5 shadow-elevated sm:p-6">
            <header className="mb-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                    Vethos
                  </p>
                  <h1 className="mt-2 text-2xl font-semibold tracking-tight">
                    {isSignIn ? 'Connexion' : 'Créer ton compte'}
                  </h1>
                </div>
                <Show when="signed-in">
                  <UserButton />
                </Show>
              </div>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                {isSignIn
                  ? 'Entre dans ton espace sans quitter le style de l’app.'
                  : 'Un compte Clerk, une interface Vethos, des données prêtes à être séparées.'}
              </p>
            </header>

            <Show when="signed-out">
              <div className="mb-5 grid grid-cols-2 gap-2 rounded-lg border border-border-subtle bg-bg-base p-1">
                <AuthModeButton
                  active={isSignIn}
                  icon={LogIn}
                  label="Connexion"
                  onClick={() => setMode('sign-in')}
                />
                <AuthModeButton
                  active={!isSignIn}
                  icon={UserPlus}
                  label="Créer"
                  onClick={() => setMode('sign-up')}
                />
              </div>

              {isSignIn ? (
                <CustomSignIn />
              ) : (
                <CustomSignUp onSwitchToSignIn={() => setMode('sign-in')} />
              )}
            </Show>
          </div>
        </div>
      </main>
    </div>
  )
}

function CustomSignIn(): JSX.Element {
  const { signIn, errors, fetchStatus } = useSignIn()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [method, setMethod] = useState<SignInMethod>('password')
  const [step, setStep] = useState<SignInStep>('credentials')
  const [codeTarget, setCodeTarget] = useState<CodeTarget>('email')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const busy = fetchStatus === 'fetching'

  const finalizeIfComplete = async (): Promise<boolean> => {
    if (signIn.status !== 'complete') return false
    const finalize = await signIn.finalize()
    if (finalize.error) {
      setError(finalize.error.message)
      return false
    }
    return true
  }

  const sendSecondFactorCode = async (): Promise<boolean> => {
    const target = hasCodeSecondFactor(signIn.supportedSecondFactors)
    if (!target) {
      setError('Ce compte demande un deuxième facteur que ce formulaire ne gère pas encore.')
      return false
    }

    const result =
      target === 'phone' ? await signIn.mfa.sendPhoneCode() : await signIn.mfa.sendEmailCode()
    if (result.error) {
      setError(result.error.message)
      return false
    }

    setCode('')
    setCodeTarget(target)
    setStep('second-code')
    setNotice(`Code de sécurité envoyé par ${codeTargetLabel(target)}.`)
    return true
  }

  const completeOrContinue = async (): Promise<boolean> => {
    if (await finalizeIfComplete()) return true
    if (signIn.status === 'needs_second_factor' || signIn.status === 'needs_client_trust') {
      return sendSecondFactorCode()
    }
    if (signIn.status === 'needs_new_password') {
      setError('Ce compte doit définir un nouveau mot de passe avant de continuer.')
      return false
    }
    setError('Connexion incomplète. Vérifie tes informations puis réessaie.')
    return false
  }

  const sendFirstFactorCode = async (target: CodeTarget): Promise<boolean> => {
    const trimmedIdentifier = identifier.trim()
    const result =
      target === 'phone'
        ? await signIn.phoneCode.sendCode({ phoneNumber: trimmedIdentifier })
        : await signIn.emailCode.sendCode({ emailAddress: trimmedIdentifier })

    if (result.error) {
      setError(result.error.message)
      return false
    }

    setCode('')
    setCodeTarget(target)
    setStep('first-code')
    setNotice(`Code de connexion envoyé par ${codeTargetLabel(target)}.`)
    return true
  }

  const handleCredentials = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setNotice(null)

    try {
      if (method === 'code') {
        await sendFirstFactorCode(codeTargetForIdentifier(identifier))
        return
      }

      const result = await signIn.password({ identifier: identifier.trim(), password })
      if (result.error) {
        setError(result.error.message)
        return
      }
      await completeOrContinue()
    } catch (err) {
      setError(clerkErrorMessage(err, 'Connexion impossible.'))
    }
  }

  const handleVerifyCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setNotice(null)

    try {
      const result =
        step === 'second-code'
          ? codeTarget === 'phone'
            ? await signIn.mfa.verifyPhoneCode({ code: code.trim() })
            : await signIn.mfa.verifyEmailCode({ code: code.trim() })
          : codeTarget === 'phone'
            ? await signIn.phoneCode.verifyCode({ code: code.trim() })
            : await signIn.emailCode.verifyCode({ code: code.trim() })

      if (result.error) {
        setError(result.error.message)
        return
      }

      await completeOrContinue()
    } catch (err) {
      setError(clerkErrorMessage(err, 'Vérification impossible.'))
    }
  }

  const handleResendCode = async () => {
    setError(null)
    setNotice(null)
    try {
      const sent =
        step === 'second-code'
          ? await sendSecondFactorCode()
          : await sendFirstFactorCode(codeTarget)
      if (sent) setNotice('Nouveau code envoyé.')
    } catch (err) {
      setError(clerkErrorMessage(err, 'Impossible de renvoyer le code.'))
    }
  }

  const resetCredentialsStep = () => {
    setStep('credentials')
    setCode('')
    setError(null)
    setNotice(null)
    void signIn.reset()
  }

  if (step !== 'credentials') {
    return (
      <form onSubmit={handleVerifyCode} className="space-y-4">
        <div className="rounded-lg border border-border-subtle bg-bg-base/55 px-4 py-3">
          <div className="text-sm font-medium text-text-primary">
            {step === 'second-code' ? 'Vérification de sécurité' : 'Vérifie ta connexion'}
          </div>
          <p className="mt-1 text-xs leading-5 text-text-muted">
            Entre le code envoyé par {codeTargetLabel(codeTarget)}.
          </p>
        </div>
        <AuthField
          id="sign-in-code"
          label={`Code ${codeTargetLabel(codeTarget)}`}
          icon={KeyRound}
          type="text"
          value={code}
          onChange={setCode}
          autoComplete="one-time-code"
          placeholder="123456"
          error={fieldMessage(errors.fields.code)}
        />
        <AuthError>{error ?? fieldMessage(errors.global?.[0])}</AuthError>
        {notice && <p className="text-xs text-emerald-300">{notice}</p>}
        <Button
          type="submit"
          variant="solid"
          disabled={busy || code.trim().length === 0}
          className="min-h-[44px] w-full rounded-lg"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
          Valider le code
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => void handleResendCode()}
          >
            <RefreshCw size={14} />
            Renvoyer
          </Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={resetCredentialsStep}>
            Modifier
          </Button>
        </div>
      </form>
    )
  }

  return (
    <form onSubmit={handleCredentials} className="space-y-4">
      <AuthField
        id="sign-in-identifier"
        label="Email ou téléphone"
        icon={Mail}
        type="text"
        value={identifier}
        onChange={setIdentifier}
        autoComplete="username"
        placeholder="toi@exemple.com ou +1..."
        error={fieldMessage(errors.fields.identifier)}
      />
      <div className="grid grid-cols-2 gap-2 rounded-lg border border-border-subtle bg-bg-base p-1">
        <AuthModeButton
          active={method === 'password'}
          icon={Lock}
          label="Mot de passe"
          onClick={() => {
            setMethod('password')
            setError(null)
          }}
        />
        <AuthModeButton
          active={method === 'code'}
          icon={KeyRound}
          label="Code"
          onClick={() => {
            setMethod('code')
            setError(null)
          }}
        />
      </div>
      {method === 'password' && (
        <AuthField
          id="sign-in-password"
          label="Mot de passe"
          icon={Lock}
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          placeholder="Ton mot de passe"
          error={fieldMessage(errors.fields.password)}
        />
      )}
      <AuthError>{error ?? fieldMessage(errors.global?.[0])}</AuthError>
      {notice && <p className="text-xs text-emerald-300">{notice}</p>}
      <Button
        type="submit"
        variant="solid"
        disabled={
          busy ||
          identifier.trim().length === 0 ||
          (method === 'password' && password.length === 0)
        }
        className="min-h-[44px] w-full rounded-lg"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
        {method === 'password' ? 'Se connecter' : 'Recevoir un code'}
      </Button>
    </form>
  )
}

function CustomSignUp({ onSwitchToSignIn }: { onSwitchToSignIn: () => void }): JSX.Element {
  const { signUp, errors, fetchStatus } = useSignUp()
  const [step, setStep] = useState<SignUpStep>('details')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const busy = fetchStatus === 'fetching'

  const finalizeIfComplete = async (): Promise<boolean> => {
    if (signUp.status !== 'complete') return false
    const result = await signUp.finalize()
    if (result.error) {
      setError(result.error.message)
      return false
    }
    return true
  }

  const continuePendingVerification = async (): Promise<boolean> => {
    if (await finalizeIfComplete()) return true

    if (signUp.unverifiedFields.includes('email_address')) {
      const send = await signUp.verifications.sendEmailCode()
      if (send.error) {
        setError(send.error.message)
        return false
      }
      setCode('')
      setStep('verify-email')
      setNotice('Code de vérification envoyé par email.')
      return true
    }

    if (signUp.unverifiedFields.includes('phone_number')) {
      const send = await signUp.verifications.sendPhoneCode()
      if (send.error) {
        setError(send.error.message)
        return false
      }
      setCode('')
      setStep('verify-phone')
      setNotice('Code de vérification envoyé par SMS.')
      return true
    }

    if (signUp.isTransferable) {
      setError('Un compte existe déjà avec cet identifiant. Connecte-toi plutôt.')
      return false
    }

    if (signUp.missingFields.length > 0) {
      setError(`Il manque encore ces champs Clerk : ${signUp.missingFields.join(', ')}.`)
      return false
    }

    setError('Inscription incomplète. Vérifie les champs requis dans Clerk.')
    return false
  }

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setNotice(null)

    try {
      const trimmedPhone = phone.trim()
      const result = await signUp.password({
        emailAddress: email.trim(),
        username: username.trim(),
        password,
        ...(trimmedPhone ? { phoneNumber: trimmedPhone } : {}),
      })
      if (result.error) {
        setError(result.error.message)
        return
      }
      await continuePendingVerification()
    } catch (err) {
      setError(clerkErrorMessage(err, 'Création du compte impossible.'))
    }
  }

  const handleVerify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setNotice(null)

    try {
      const result =
        step === 'verify-phone'
          ? await signUp.verifications.verifyPhoneCode({ code: code.trim() })
          : await signUp.verifications.verifyEmailCode({ code: code.trim() })
      if (result.error) {
        setError(result.error.message)
        return
      }
      await continuePendingVerification()
    } catch (err) {
      setError(clerkErrorMessage(err, 'Vérification impossible.'))
    }
  }

  const handleResend = async () => {
    setError(null)
    setNotice(null)
    try {
      const result =
        step === 'verify-phone'
          ? await signUp.verifications.sendPhoneCode()
          : await signUp.verifications.sendEmailCode()
      if (result.error) {
        setError(result.error.message)
        return
      }
      setNotice('Nouveau code envoyé.')
    } catch (err) {
      setError(clerkErrorMessage(err, 'Impossible de renvoyer le code.'))
    }
  }

  if (step === 'verify-email' || step === 'verify-phone') {
    const target = step === 'verify-phone' ? 'phone' : 'email'
    const targetValue = step === 'verify-phone' ? phone : email

    return (
      <form onSubmit={handleVerify} className="space-y-4">
        <div className="rounded-lg border border-border-subtle bg-bg-base/55 px-4 py-3">
          <div className="text-sm font-medium text-text-primary">
            Vérifie ton {target === 'phone' ? 'téléphone' : 'email'}
          </div>
          <p className="mt-1 text-xs leading-5 text-text-muted">
            Entre le code envoyé à <span className="text-text-secondary">{targetValue}</span>.
          </p>
        </div>
        <AuthField
          id="sign-up-code"
          label={`Code ${codeTargetLabel(target)}`}
          icon={KeyRound}
          type="text"
          value={code}
          onChange={setCode}
          autoComplete="one-time-code"
          placeholder="123456"
          error={fieldMessage(errors.fields.code)}
        />
        <AuthError>{error ?? fieldMessage(errors.global?.[0])}</AuthError>
        {notice && <p className="text-xs text-emerald-300">{notice}</p>}
        <Button
          type="submit"
          variant="solid"
          disabled={busy || code.trim().length === 0}
          className="min-h-[44px] w-full rounded-lg"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
          Valider le code
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => void handleResend()}
          className="w-full"
        >
          <RefreshCw size={14} />
          Renvoyer un code
        </Button>
      </form>
    )
  }

  return (
    <form onSubmit={handleCreate} className="space-y-4">
      <AuthField
        id="sign-up-email"
        label="Email"
        icon={Mail}
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        placeholder="toi@exemple.com"
        error={fieldMessage(errors.fields.emailAddress)}
      />
      <AuthField
        id="sign-up-username"
        label="Nom d’utilisateur"
        icon={User}
        type="text"
        value={username}
        onChange={setUsername}
        autoComplete="username"
        placeholder="ton_pseudo"
        error={fieldMessage(errors.fields.username)}
      />
      <AuthField
        id="sign-up-phone"
        label="Téléphone"
        icon={Phone}
        type="tel"
        value={phone}
        onChange={setPhone}
        autoComplete="tel"
        placeholder="+1..."
        error={fieldMessage(errors.fields.phoneNumber)}
      />
      <AuthField
        id="sign-up-password"
        label="Mot de passe"
        icon={Lock}
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        placeholder="8 caractères minimum"
        error={fieldMessage(errors.fields.password)}
      />
      <div id="clerk-captcha" />
      <AuthError>{error ?? fieldMessage(errors.global?.[0])}</AuthError>
      <Button
        type="submit"
        variant="solid"
        disabled={
          busy ||
          email.trim().length === 0 ||
          username.trim().length === 0 ||
          password.length < 8
        }
        className="min-h-[44px] w-full rounded-lg"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
        Créer le compte
      </Button>
      <div className="flex items-center justify-between gap-3 border-t border-border-subtle pt-4 text-sm">
        <span className="text-text-muted">Déjà un compte ?</span>
        <Button type="button" variant="ghost" size="sm" onClick={onSwitchToSignIn}>
          Se connecter
        </Button>
      </div>
    </form>
  )
}

function AuthModeButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean
  icon: LucideIcon
  label: string
  onClick: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex min-h-[38px] items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors',
        active
          ? 'border border-accent/30 bg-accent/15 text-text-primary'
          : 'border border-transparent text-text-muted hover:bg-white/5 hover:text-text-secondary',
      )}
    >
      <Icon size={15} />
      {label}
    </button>
  )
}

function AuthField({
  id,
  label,
  icon: Icon,
  value,
  onChange,
  error,
  ...inputProps
}: {
  id: string
  label: string
  icon: LucideIcon
  value: string
  onChange: (value: string) => void
  error?: string | null
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id' | 'value' | 'onChange'>): JSX.Element {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[10px] font-medium uppercase tracking-widest text-text-muted"
      >
        {label}
      </label>
      <div
        className={cn(
          'mt-2 flex items-center gap-2 rounded-lg border bg-bg-base px-3 transition-colors',
          error ? 'border-red-500/45' : 'border-border-subtle focus-within:border-accent',
        )}
      >
        <Icon size={15} className={error ? 'text-red-300' : 'text-text-muted'} />
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-[42px] w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
          {...inputProps}
        />
      </div>
      {error && <p className="mt-1.5 text-xs text-red-300">{error}</p>}
    </div>
  )
}

function AuthError({ children }: { children: ReactNode }): JSX.Element | null {
  if (!children) return null
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-200">
      <AlertCircle size={14} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  )
}

function AuthProof({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon
  title: string
  description: string
}): JSX.Element {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-base/55 px-4 py-3">
      <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
        <Icon size={15} className="text-accent" />
        {title}
      </div>
      <p className="mt-1 text-xs leading-5 text-text-muted">{description}</p>
    </div>
  )
}
