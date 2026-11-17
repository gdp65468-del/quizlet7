'use client'

import { useEffect, useState } from 'react'
import { AppwriteException, ID } from 'appwrite'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogIn,
  Mail,
  User,
  UserPlus,
  X,
} from 'lucide-react'
import { ArrowIcon } from '@/components/ui'
import { getAppwriteServices, isAppwriteConfigured, pingAppwriteOnce } from '@/lib/appwrite'
import { formatAppwriteAuthError } from '@/lib/cloud-sync'
import { useI18n } from '@/lib/i18n'
import { INACTIVITY_POLICY_TEXT_EN, INACTIVITY_POLICY_TEXT_PT } from '@/lib/quiz-limits'

type AuthFeedback = {
  kind: 'error' | 'info' | 'success'
  message: string
  action?: 'forgot' | 'register' | 'login'
}

export default function LoginForm() {
  const { locale, t } = useI18n()
  const isPt = locale === 'pt'

  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [pending, setPending] = useState(false)
  const [checkingExisting, setCheckingExisting] = useState(isAppwriteConfigured)
  const [feedback, setFeedback] = useState<AuthFeedback | null>(null)
  const [cookieBlocked, setCookieBlocked] = useState(false)

  // Password recovery request modal state ("Esqueceu sua senha?")
  const [recoveryModalOpen, setRecoveryModalOpen] = useState(false)
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [recoveryPending, setRecoveryPending] = useState(false)
  const [recoveryStatus, setRecoveryStatus] = useState<{ kind: 'error' | 'success'; message: string } | null>(null)

  // Recovery completion state (when arriving from Appwrite email link with ?userId=...&secret=...)
  const [resetParams, setResetParams] = useState<{ userId: string; secret: string } | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [resetPending, setResetPending] = useState(false)
  const [resetError, setResetError] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const userIdParam = params.get('userId')?.trim()
    const secretParam = params.get('secret')?.trim()
    if (userIdParam && secretParam) {
      const timer = setTimeout(() => {
        setResetParams({ userId: userIdParam, secret: secretParam })
        setCheckingExisting(false)
      }, 0)
      return () => clearTimeout(timer)
    }

    const services = getAppwriteServices()
    if (!services) {
      const timer = setTimeout(() => setCheckingExisting(false), 0)
      return () => clearTimeout(timer)
    }
    pingAppwriteOnce()
    let active = true

    const syncExisting = async () => {
      try {
        await services.account.get()
        const jwtRes = await services.account.createJWT()
        if (!jwtRes?.jwt || !active) return
        const res = await fetch('/api/auth/session', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jwt: jwtRes.jwt }),
        })
        if (!res.ok) return
        const verify = await fetch('/api/auth/session', { cache: 'no-store', credentials: 'include' })
        const state = await verify.json().catch(() => null)
        if (state?.authenticated && active) {
          window.location.replace('/painel')
          return
        }
      } catch {
        // No active browser Appwrite session
      } finally {
        if (active) setCheckingExisting(false)
      }
    }

    void syncExisting()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!recoveryModalOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !recoveryPending) {
        setRecoveryModalOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [recoveryModalOpen, recoveryPending])

  const switchMode = (nextMode: 'login' | 'register', customFeedback: AuthFeedback | null = null) => {
    setAuthMode(nextMode)
    setFeedback(customFeedback)
    setCookieBlocked(false)
    setPassword('')
  }

  const openRecoveryModal = () => {
    setRecoveryEmail(email.trim())
    setRecoveryStatus(null)
    setRecoveryModalOpen(true)
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (pending) return

    const services = getAppwriteServices()
    if (!services) {
      setFeedback({
        kind: 'error',
        message: isPt
          ? 'Appwrite Auth não está configurado neste ambiente (NEXT_PUBLIC_APPWRITE_PROJECT_ID ausente).'
          : 'Appwrite Auth is not configured in this environment.',
      })
      return
    }

    setPending(true)
    setFeedback(null)
    setCookieBlocked(false)
    try {
      const cleanEmail = email.trim()
      if (authMode === 'register') {
        await services.account.create({
          userId: ID.unique(),
          email: cleanEmail,
          password,
          name: name.trim() || undefined,
        })
      }

      try {
        await services.account.createEmailPasswordSession({
          email: cleanEmail,
          password,
        })
      } catch (sessionErr) {
        if (
          sessionErr instanceof AppwriteException &&
          sessionErr.type === 'user_session_already_exists'
        ) {
          await services.account.deleteSession({ sessionId: 'current' }).catch(() => {})
          await services.account.createEmailPasswordSession({
            email: cleanEmail,
            password,
          })
        } else {
          throw sessionErr
        }
      }

      const jwtRes = await services.account.createJWT()
      if (!jwtRes?.jwt) {
        throw new Error(
          isPt
            ? 'Não foi possível validar a sessão com o Appwrite Auth.'
            : 'Could not verify Appwrite Auth session.',
        )
      }

      const response = await fetch('/api/auth/session', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jwt: jwtRes.jwt }),
      })

      if (!response.ok) {
        const result = await response.json().catch(() => ({}))
        throw new Error(result.error || 'Could not establish creator session')
      }

      const verify = await fetch('/api/auth/session', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'include',
      })
      const sessionState = await verify.json().catch(() => null)
      if (!sessionState?.authenticated) {
        setCookieBlocked(true)
        throw new Error(t.cookieBlockedError)
      }

      window.location.replace('/painel')
    } catch (err) {
      if (err instanceof AppwriteException && err.code === 409 && authMode === 'register') {
        // Switch cleanly to the Sign In tab, keep typed email, clear password, and guide the user clearly
        switchMode('login', {
          kind: 'info',
          message: isPt
            ? 'Este e-mail já está cadastrado! Mudamos para a aba "Entrar". Digite sua senha abaixo para acessar ou clique em "Esqueceu sua senha?".'
            : 'This email is already registered! We switched you to the "Sign in" tab. Enter your password below or click "Forgot your password?".',
          action: 'forgot',
        })
      } else if (err instanceof AppwriteException && err.code === 401 && err.type === 'user_invalid_credentials') {
        setFeedback({
          kind: 'error',
          message: formatAppwriteAuthError(err, locale),
          action: authMode === 'login' ? 'forgot' : undefined,
        })
      } else {
        setFeedback({
          kind: 'error',
          message: formatAppwriteAuthError(err, locale),
        })
      }
      setPending(false)
    }
  }

  const handleRecoverySubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (recoveryPending) return

    const services = getAppwriteServices()
    if (!services) {
      setRecoveryStatus({
        kind: 'error',
        message: isPt ? 'Appwrite Auth não configurado.' : 'Appwrite Auth is not configured.',
      })
      return
    }

    const cleanEmail = recoveryEmail.trim()
    if (!cleanEmail) return

    setRecoveryPending(true)
    setRecoveryStatus(null)
    try {
      const redirectUrl = `${window.location.origin}/login`
      await services.account.createRecovery({
        email: cleanEmail,
        url: redirectUrl,
      })
      setRecoveryStatus({
        kind: 'success',
        message: isPt
          ? `Enviamos um e-mail de redefinição de senha para ${cleanEmail}. Verifique sua caixa de entrada (e spam) e acesse o link recebido.`
          : `We sent a password reset link to ${cleanEmail}. Please check your inbox (and spam folder) and follow the link.`,
      })
    } catch (err) {
      setRecoveryStatus({
        kind: 'error',
        message: formatAppwriteAuthError(err, locale),
      })
    } finally {
      setRecoveryPending(false)
    }
  }

  const handleCompleteRecovery = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!resetParams || resetPending) return

    const services = getAppwriteServices()
    if (!services) return

    if (newPassword.length < 8) {
      setResetError(isPt ? 'A nova senha deve ter pelo menos 8 caracteres.' : 'New password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmNewPassword) {
      setResetError(isPt ? 'As senhas não coincidem.' : 'Passwords do not match.')
      return
    }

    setResetPending(true)
    setResetError('')
    try {
      await services.account.updateRecovery({
        userId: resetParams.userId,
        secret: resetParams.secret,
        password: newPassword,
      })
      window.history.replaceState({}, '', '/login')
      setResetParams(null)
      setNewPassword('')
      setConfirmNewPassword('')
      switchMode('login', {
        kind: 'success',
        message: isPt
          ? 'Senha redefinida com sucesso! Agora você já pode entrar com sua nova senha.'
          : 'Password updated successfully! You can now sign in with your new password.',
      })
    } catch (err) {
      setResetError(formatAppwriteAuthError(err, locale))
    } finally {
      setResetPending(false)
    }
  }

  // Dedicated screen when arriving from Appwrite password recovery email link (?userId=...&secret=...)
  if (resetParams) {
    return (
      <>
        <p className="eyebrow mt-7">{isPt ? 'Recuperação de senha' : 'Password recovery'}</p>
        <h1 id="login-title" className="mt-3 text-3xl font-extrabold tracking-[-.04em]">
          {isPt ? 'Definir nova senha' : 'Set a new password'}
        </h1>
        <p className="text-muted mt-3 text-sm leading-relaxed">
          {isPt
            ? 'Escolha uma nova senha segura (mínimo de 8 caracteres) para acessar sua conta.'
            : 'Choose a secure new password (minimum 8 characters) to access your account.'}
        </p>

        <form onSubmit={handleCompleteRecovery} className="mt-6 space-y-4">
          <label className="block">
            <span className="label flex items-center gap-1.5 text-xs">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" /> {isPt ? 'Nova senha' : 'New password'}
            </span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="field w-full py-3.5 text-sm"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={isPt ? 'Mínimo 8 caracteres' : 'Minimum 8 characters'}
            />
          </label>

          <label className="block">
            <span className="label flex items-center gap-1.5 text-xs">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" /> {isPt ? 'Confirmar nova senha' : 'Confirm new password'}
            </span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="field w-full py-3.5 text-sm"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              placeholder={isPt ? 'Repita a nova senha' : 'Repeat new password'}
            />
          </label>

          {resetError && (
            <p className="notice text-xs" role="alert">
              {resetError}
            </p>
          )}

          <button className="btn-primary btn-success w-full py-4" type="submit" disabled={resetPending}>
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            {resetPending
              ? isPt
                ? 'Salvando nova senha...'
                : 'Updating password...'
              : isPt
                ? 'Salvar nova senha'
                : 'Save new password'}
          </button>

          <button
            type="button"
            onClick={() => {
              window.history.replaceState({}, '', '/login')
              setResetParams(null)
              setResetError('')
            }}
            className="btn-ghost w-full py-2 text-xs"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {isPt ? 'Voltar para o login' : 'Back to login'}
          </button>
        </form>
      </>
    )
  }

  return (
    <>
      <p className="eyebrow mt-7">{t.creatorAccess}</p>
      <h1 id="login-title" className="mt-3 text-3xl font-extrabold tracking-[-.04em] sm:text-4xl">
        {t.welcomeCreatorTitle}
      </h1>
      <p className="text-muted mt-3 text-sm leading-relaxed">{t.enterCreatorCredentials}</p>

      <div
        className="mt-6 grid grid-cols-2 gap-2 rounded-xl border border-white/15 bg-white/5 p-1"
        role="tablist"
        aria-label={isPt ? 'Alternar entre entrar ou criar conta' : 'Switch between sign in and create account'}
      >
        <button
          type="button"
          role="tab"
          aria-selected={authMode === 'login'}
          onClick={() => switchMode('login')}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-bold transition ${
            authMode === 'login'
              ? 'bg-[#f5cf70] text-[#0b1526] shadow-sm'
              : 'text-[#cbd5e1] hover:bg-white/5 hover:text-white'
          }`}
        >
          <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
          {t.signIn}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={authMode === 'register'}
          onClick={() => switchMode('register')}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-bold transition ${
            authMode === 'register'
              ? 'bg-[#f5cf70] text-[#0b1526] shadow-sm'
              : 'text-[#cbd5e1] hover:bg-white/5 hover:text-white'
          }`}
        >
          <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
          {t.createAccount}
        </button>
      </div>

      <form onSubmit={submit} className="mt-6 space-y-4">
        {authMode === 'register' && (
          <label className="block">
            <span className="label flex items-center gap-1.5 text-xs">
              <User className="h-3.5 w-3.5" aria-hidden="true" /> {isPt ? 'Seu nome' : 'Your name'}
            </span>
            <input
              type="text"
              className="field w-full py-3.5 text-sm"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={isPt ? 'Ex: João Silva' : 'e.g. John Doe'}
              autoComplete="name"
            />
          </label>
        )}

        <label className="block">
          <span className="label flex items-center gap-1.5 text-xs">
            <Mail className="h-3.5 w-3.5" aria-hidden="true" /> E-mail
          </span>
          <input
            type="email"
            required
            autoComplete="email"
            autoFocus
            className="field w-full py-3.5 text-sm"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="voce@exemplo.com"
          />
        </label>

        <div>
          <label className="block">
            <span className="label flex items-center gap-1.5 text-xs">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" /> {t.password}
            </span>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                className="field w-full py-3.5 pr-11 text-sm"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={isPt ? 'Mínimo 8 caracteres' : 'Minimum 8 characters'}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-300 transition hover:text-white"
                aria-label={
                  showPassword
                    ? isPt
                      ? 'Ocultar senha'
                      : 'Hide password'
                    : isPt
                      ? 'Mostrar senha'
                      : 'Show password'
                }
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </label>

          {authMode === 'login' && (
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={openRecoveryModal}
                className="text-xs font-medium text-[#f5cf70]/90 underline-offset-4 transition hover:text-[#f5cf70] hover:underline"
              >
                {isPt ? 'Esqueceu sua senha?' : 'Forgot your password?'}
              </button>
            </div>
          )}
        </div>

        {feedback && (
          <div
            role={feedback.kind === 'error' ? 'alert' : 'status'}
            className={
              feedback.kind === 'success'
                ? 'rounded-2xl border border-emerald-400/40 bg-emerald-500/15 p-3.5 text-xs leading-relaxed text-emerald-100 space-y-2'
                : feedback.kind === 'info'
                  ? 'rounded-2xl border border-amber-300/45 bg-amber-400/15 p-3.5 text-xs leading-relaxed text-amber-100 space-y-2'
                  : 'notice space-y-2 text-xs'
            }
          >
            <p className="flex items-start gap-2">
              {feedback.kind === 'success' && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />}
              {feedback.kind === 'info' && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />}
              <span>{feedback.message}</span>
            </p>
            {feedback.action === 'forgot' && (
              <button
                type="button"
                onClick={openRecoveryModal}
                className="inline-flex items-center gap-1.5 font-bold text-[#f5cf70] underline underline-offset-4 hover:text-white"
              >
                <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                {isPt ? 'Recuperar senha por e-mail' : 'Reset password by email'}
              </button>
            )}
            {cookieBlocked && (
              <a
                href="/login"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-bold underline"
              >
                {t.openInNewTab}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            )}
          </div>
        )}

        <button className="btn-primary btn-success w-full py-4" type="submit" disabled={pending || checkingExisting}>
          {pending
            ? authMode === 'register'
              ? t.creatingAccount
              : t.signingIn
            : checkingExisting
              ? isPt
                ? 'Verificando sessão...'
                : 'Checking session...'
              : authMode === 'register'
                ? t.createAccount
                : t.signIn}{' '}
          <ArrowIcon />
        </button>

        <p className="text-center text-xs text-slate-300/80">
          {authMode === 'login' ? (
            <>
              {isPt ? 'Ainda não tem conta?' : "Don't have an account?"}{' '}
              <button
                type="button"
                onClick={() => switchMode('register')}
                className="font-bold text-[#f5cf70] underline-offset-4 hover:underline"
              >
                {t.createAccount}
              </button>
            </>
          ) : (
            <>
              {isPt ? 'Já possui conta?' : 'Already have an account?'}{' '}
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="font-bold text-[#f5cf70] underline-offset-4 hover:underline"
              >
                {t.signIn}
              </button>
            </>
          )}
        </p>
      </form>

      <div className="mt-6 rounded-2xl border border-amber-300/30 bg-amber-400/10 p-3.5 text-xs leading-relaxed text-amber-100">
        <p className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
          <span>{isPt ? INACTIVITY_POLICY_TEXT_PT : INACTIVITY_POLICY_TEXT_EN}</span>
        </p>
      </div>

      {recoveryModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={() => {
            if (!recoveryPending) setRecoveryModalOpen(false)
          }}
        >
          <section
            className="glass w-full max-w-md border border-white/25 bg-[#10203a] p-6 sm:p-7 animate-in"
            role="dialog"
            aria-modal="true"
            aria-labelledby="recovery-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#f5cf70]/45 bg-[#f5cf70]/15 text-[#f5cf70]">
                  <KeyRound className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <p className="eyebrow">Appwrite Auth</p>
                  <h2 id="recovery-modal-title" className="text-xl font-extrabold text-white">
                    {isPt ? 'Recuperar sua senha' : 'Reset your password'}
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRecoveryModalOpen(false)}
                disabled={recoveryPending}
                className="settings-close"
                aria-label={isPt ? 'Fechar' : 'Close'}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <p className="text-muted mt-4 text-xs leading-relaxed">
              {isPt
                ? 'Informe o e-mail cadastrado na sua conta. Enviaremos um link seguro do Appwrite para você cadastrar uma nova senha.'
                : 'Enter your registered email address. We will send you a secure Appwrite link to set a new password.'}
            </p>

            <form onSubmit={handleRecoverySubmit} className="mt-5 space-y-4">
              <label className="block">
                <span className="label flex items-center gap-1.5 text-xs">
                  <Mail className="h-3.5 w-3.5" aria-hidden="true" /> E-mail
                </span>
                <input
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  className="field w-full py-3 text-sm"
                  value={recoveryEmail}
                  onChange={(e) => setRecoveryEmail(e.target.value)}
                  placeholder="voce@exemplo.com"
                />
              </label>

              {recoveryStatus && (
                <div
                  role={recoveryStatus.kind === 'error' ? 'alert' : 'status'}
                  className={
                    recoveryStatus.kind === 'success'
                      ? 'rounded-2xl border border-emerald-400/40 bg-emerald-500/15 p-3.5 text-xs leading-relaxed text-emerald-100'
                      : 'notice text-xs'
                  }
                >
                  {recoveryStatus.message}
                </div>
              )}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={recoveryPending}
                  onClick={() => setRecoveryModalOpen(false)}
                  className="btn-secondary px-4 py-2.5 text-xs"
                >
                  {isPt ? 'Fechar' : 'Close'}
                </button>
                <button
                  type="submit"
                  disabled={recoveryPending}
                  className="btn-primary btn-success px-5 py-2.5 text-xs"
                >
                  {recoveryPending
                    ? isPt
                      ? 'Enviando...'
                      : 'Sending...'
                    : isPt
                      ? 'Enviar link por e-mail'
                      : 'Send reset link'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  )
}
