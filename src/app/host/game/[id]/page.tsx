'use client'

import Link from 'next/link'
import { use, useEffect, useState } from 'react'
import { AlertTriangle, LogOut, Volume2, VolumeX, X } from 'lucide-react'
import { Brand, StatPill } from '@/components/ui'
import { LanguageToggle, useI18n } from '@/lib/i18n'
import { soundEngine } from '@/lib/sound-engine'
import { useGameView } from '@/lib/use-game-view'
import type { HostGameView } from '@/types/game'
import Lobby from './lobby'
import PartialLeaderboard from './partial-leaderboard'
import Quiz from './quiz'
import Results from './results'

export default function HostGame({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { t, locale } = useI18n()
  const [hostToken, setHostToken] = useState('')
  const [closing, setClosing] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false)
  const [muted, setMuted] = useState(false)
  const { view, applyView, error, setError, now } = useGameView<HostGameView>(id, 'host', hostToken)

  const isActivePhase =
    view?.phase === 'lobby' || view?.phase === 'quiz' || view?.phase === 'leaderboard'

  useEffect(() => {
    const timer = setTimeout(() => {
      const savedToken = localStorage.getItem(`host:${id}`) ?? ''
      setHostToken(savedToken)
      setMuted(soundEngine.isMuted())
      if (!savedToken) {
        setError(
          locale === 'pt'
            ? 'O acesso de apresentador só está disponível no navegador que criou esta sala.'
            : 'Host access is only available in the browser that created this game.',
        )
      }
    }, 0)
    return () => clearTimeout(timer)
  }, [id, locale, setError])

  useEffect(() => {
    if (view?.phase === 'lobby' && !muted) {
      soundEngine.startLobbyMusic()
    } else {
      soundEngine.stopLobbyMusic()
    }
    return () => {
      soundEngine.stopLobbyMusic()
    }
  }, [view?.phase, muted])

  useEffect(() => {
    if (!confirmCancelOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !cancelling) {
        setConfirmCancelOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [confirmCancelOpen, cancelling])

  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    soundEngine.setMuted(next)
    if (!next && view?.phase === 'lobby') {
      soundEngine.startLobbyMusic()
    }
  }

  const act = async (action: string) => {
    soundEngine.unlock()
    try {
      const response = await fetch(`/api/games/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-host-token': hostToken },
        body: JSON.stringify({ action }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      applyView(result)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update game')
    }
  }

  const returnHome = async () => {
    if (closing) return
    setClosing(true)
    soundEngine.stopLobbyMusic()
    try {
      const response = await fetch(`/api/games/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-host-token': hostToken },
        body: JSON.stringify({ action: 'close' }),
      })
      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || 'Could not close the session')
      }
      localStorage.removeItem(`host:${id}`)
      window.location.assign('/host/dashboard')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not close the session')
      setClosing(false)
    }
  }

  const cancelQuiz = async () => {
    if (cancelling) return
    setCancelling(true)
    soundEngine.stopLobbyMusic()
    try {
      const response = await fetch(`/api/games/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-host-token': hostToken },
        body: JSON.stringify({ action: 'cancel' }),
      })
      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || 'Could not cancel the quiz')
      }
      localStorage.removeItem(`host:${id}`)
      window.location.assign('/host/dashboard')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not cancel the quiz')
      setCancelling(false)
      setConfirmCancelOpen(false)
    }
  }

  return (
    <main className="app-shell">
      <div className="surface">
        <header className="container-game flex flex-wrap items-center justify-between gap-4 py-5 sm:py-7">
          <Link
            href="/host/dashboard"
            aria-label="Back to quiz library"
            onClick={(event) => {
              if (isActivePhase) {
                event.preventDefault()
                setConfirmCancelOpen(true)
              }
            }}
          >
            <Brand />
          </Link>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={toggleMute}
              className="btn-secondary whitespace-nowrap px-3 py-1.5 text-xs"
              aria-label={muted ? t.soundOff : t.soundOn}
            >
              {muted ? <VolumeX className="h-4 w-4 text-rose-300" /> : <Volume2 className="h-4 w-4 text-emerald-300" />}
              <span className="hidden sm:inline">{muted ? t.soundOff : t.soundOn}</span>
            </button>
            <LanguageToggle />
            <StatPill accent="mint">
              <span className="live-dot" /> {t.hostRoom}
            </StatPill>
            <span className="text-muted hidden text-xs font-semibold sm:inline">#{id.slice(0, 8).toUpperCase()}</span>
            {isActivePhase && (
              <button
                type="button"
                onClick={() => setConfirmCancelOpen(true)}
                className="btn-cancel min-w-0 whitespace-nowrap px-3 py-1.5 text-xs"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t.endQuizEarly}</span>
              </button>
            )}
          </div>
        </header>

        {error && (
          <div className="container-game">
            <p role="alert" className="notice mb-5">
              {error}
            </p>
          </div>
        )}

        {!view && !error && (
          <div className="container-game glass mt-8 flex min-h-72 flex-col items-center justify-center gap-5 text-center animate-in">
            <div className="flex gap-2">
              <span className="loading-dot" />
              <span className="loading-dot" />
              <span className="loading-dot" />
            </div>
            <p className="text-muted">{locale === 'pt' ? 'Preparando sua sala...' : 'Preparing your room...'}</p>
          </div>
        )}

        {view?.phase === 'lobby' && (
          <Lobby
            participants={view.participants}
            gameId={id}
            quizName={view.quizName}
            classLabel={view.classLabel}
            defaultJoinUrl={view.joinUrl}
            onStart={() => act('start')}
            onCancel={() => setConfirmCancelOpen(true)}
            cancelling={cancelling}
          />
        )}

        {view?.phase === 'quiz' && (
          <Quiz
            view={{ ...view, serverNow: now }}
            onAction={act}
            onRequestCancel={() => setConfirmCancelOpen(true)}
          />
        )}

        {view?.phase === 'leaderboard' && (
          <PartialLeaderboard
            view={view}
            onNext={() => act('next')}
            onRequestCancel={() => setConfirmCancelOpen(true)}
          />
        )}

        {view?.phase === 'result' && <Results view={view} onReturnHome={returnHome} closing={closing} />}

        {view?.phase === 'expired' && (
          <div className="container-game flex min-h-[72vh] items-center justify-center pb-16">
            <section className="glass w-full max-w-xl px-7 py-12 text-center animate-in sm:px-12" role="status">
              <p className="eyebrow">{locale === 'pt' ? 'Sala encerrada' : 'Room closed'}</p>
              <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
                {locale === 'pt' ? 'Quiz encerrado após uma hora' : 'Quiz closed after one hour'}
              </h1>
              <p className="text-muted mt-4">
                {locale === 'pt' ? 'Abra uma nova sala no painel para continuar jogando.' : 'Start a new room from Home to keep playing.'}
              </p>
              <Link
                href="/host/dashboard"
                onClick={() => localStorage.removeItem(`host:${id}`)}
                className="btn-primary mt-8 inline-flex"
              >
                {t.returnHome}
              </Link>
            </section>
          </div>
        )}

        {confirmCancelOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            role="presentation"
            onClick={() => {
              if (!cancelling) setConfirmCancelOpen(false)
            }}
          >
            <section
              className="glass w-full max-w-md border border-rose-400/40 bg-[#2d1c45] p-6 sm:p-7 animate-in"
              role="dialog"
              aria-modal="true"
              aria-labelledby="cancel-quiz-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-300/40 bg-amber-400/15 text-amber-300">
                  <AlertTriangle className="h-6 w-6" aria-hidden="true" />
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmCancelOpen(false)}
                  disabled={cancelling}
                  className="settings-close"
                  aria-label={t.continueQuiz}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <h2 id="cancel-quiz-title" className="mt-4 text-2xl font-extrabold tracking-tight text-white">
                {t.exitQuizTitle}
              </h2>

              <div className="mt-4 rounded-2xl border border-amber-300/35 bg-amber-400/10 p-4 text-sm leading-relaxed text-amber-100">
                {t.exitQuizWarning}
              </div>

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setConfirmCancelOpen(false)}
                  disabled={cancelling}
                  className="btn-secondary w-full sm:w-auto"
                >
                  {t.continueQuiz}
                </button>
                <button
                  type="button"
                  onClick={cancelQuiz}
                  disabled={cancelling}
                  className="btn-cancel w-full min-w-0 sm:w-auto"
                >
                  {cancelling ? t.cancelling : t.confirmCancelQuiz}
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  )
}
