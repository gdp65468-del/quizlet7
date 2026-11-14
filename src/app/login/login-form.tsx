'use client'

import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { ArrowIcon } from '@/components/ui'
import { useI18n } from '@/lib/i18n'

export default function LoginForm({ showDefaultHint = false }: { showDefaultHint?: boolean }) {
  const { t } = useI18n()
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [cookieBlocked, setCookieBlocked] = useState(false)

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError('')
    setCookieBlocked(false)
    try {
      const response = await fetch('/api/admin/session', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!response.ok) {
        const result = await response.json().catch(() => ({}))
        if (response.status === 401) {
          throw new Error(t.incorrectPassword)
        }
        throw new Error(result.error || 'Could not sign in')
      }

      const verify = await fetch('/api/admin/session', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'include',
      })
      const sessionState = await verify.json().catch(() => null)
      if (!sessionState?.authenticated) {
        setCookieBlocked(true)
        throw new Error(t.cookieBlockedError)
      }

      window.location.replace('/host/dashboard')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign in')
      setPassword('')
      setPending(false)
    }
  }

  return (
    <>
      <p className="eyebrow mt-7">{t.adminAccess}</p>
      <h1 id="login-title" className="mt-3 text-4xl font-extrabold tracking-[-.05em]">{t.welcomeBack}</h1>
      <p className="text-muted mt-3 leading-relaxed">{t.enterPassword}</p>
      <form onSubmit={submit} className="mt-8">
        <label htmlFor="admin-password" className="label">{t.password}</label>
        <input id="admin-password" className="field w-full py-4" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" autoFocus required />
        {error && (
          <div className="notice mt-4 space-y-2" role="alert">
            <p>{error}</p>
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
        <button className="btn-primary btn-success mt-6 w-full py-4" type="submit" disabled={pending}>{pending ? t.signingIn : t.signIn} <ArrowIcon /></button>
      </form>
      {showDefaultHint && (
        <p className="text-muted mt-4 text-xs">
          {t.defaultPasswordHint}
        </p>
      )}
    </>
  )
}
