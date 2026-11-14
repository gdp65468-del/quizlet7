'use client'

import Link from 'next/link'
import { use, useEffect, useState } from 'react'
import { Flame, Trophy, Volume2, VolumeX } from 'lucide-react'
import CloseParticipantWindow from '@/components/close-participant-window'
import { Brand, StatPill } from '@/components/ui'
import { LanguageToggle, useI18n } from '@/lib/i18n'
import { soundEngine } from '@/lib/sound-engine'
import { useGameView } from '@/lib/use-game-view'
import type { PlayerGameView } from '@/types/game'
import Lobby from './lobby'
import Quiz from './quiz'

type PlayerCredential = { id: string; token: string; nickname: string }
type PendingChoice = { questionId: string; choiceIds: string[] }

export default function PlayerGame({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { t, locale } = useI18n()
  const [player, setPlayer] = useState<PlayerCredential | null>(null)
  const [pendingChoice, setPendingChoice] = useState<PendingChoice | null>(null)
  const [muted, setMuted] = useState(false)
  const { view, setView, error, setError, now } = useGameView<PlayerGameView>(id, 'player', player?.token, player?.id)

  useEffect(() => {
    const timer = setTimeout(() => {
      setMuted(soundEngine.isMuted())
      const saved = localStorage.getItem(`player:${id}`)
      if (saved) {
        try {
          setPlayer(JSON.parse(saved))
        } catch {
          localStorage.removeItem(`player:${id}`)
        }
      }
    }, 0)
    return () => clearTimeout(timer)
  }, [id])

  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    soundEngine.setMuted(next)
  }

  const register = (credential: PlayerCredential) => {
    localStorage.setItem(`player:${id}`, JSON.stringify(credential))
    setPlayer(credential)
  }

  const answer = async (choiceIds: string[]) => {
    if (!player || !view?.question || pendingChoice?.questionId === view.question.id || !choiceIds.length) return
    soundEngine.unlock()
    setPendingChoice({ questionId: view.question.id, choiceIds })
    try {
      const response = await fetch(`/api/games/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-player-id': player.id, 'x-player-token': player.token },
        body: JSON.stringify({ action: 'answer', choiceIds, choiceId: choiceIds[0] }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      setView((current) =>
        current ? { ...current, selectedChoiceId: choiceIds[0], selectedChoiceIds: choiceIds } : current,
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not submit answer')
      setPendingChoice(null)
    }
  }

  const selectedChoiceIds =
    view?.selectedChoiceIds && view.selectedChoiceIds.length > 0
      ? view.selectedChoiceIds
      : view?.selectedChoiceId
        ? [view.selectedChoiceId]
        : pendingChoice && pendingChoice.questionId === view?.question?.id
          ? pendingChoice.choiceIds
          : []

  return (
    <main className="app-shell">
      <div className="surface">
        <header className="container-game flex flex-wrap items-center justify-between gap-3 py-5 sm:py-7">
          <Brand />
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={toggleMute}
              className="btn-secondary px-3 py-1.5 text-xs"
              aria-label={muted ? t.soundOff : t.soundOn}
            >
              {muted ? <VolumeX className="h-4 w-4 text-rose-300" /> : <Volume2 className="h-4 w-4 text-emerald-300" />}
            </button>
            <LanguageToggle />
            <StatPill accent="cyan">
              {t.playerView} <span className="live-dot" />
            </StatPill>
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
            <p className="text-muted">{locale === 'pt' ? 'Encontrando sua sala...' : 'Finding your room...'}</p>
          </div>
        )}

        {!player && view?.phase === 'lobby' && <Lobby gameId={id} onRegistered={register} />}

        {view?.phase === 'cancelled' && (
          <div className="container-game flex min-h-[72vh] items-center justify-center pb-16">
            <section className="glass w-full max-w-xl px-7 py-12 text-center animate-in sm:px-12" role="status">
              <div
                className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[rgba(255,133,137,.2)] text-3xl text-[#ffb4b9]"
                aria-hidden="true"
              >
                ×
              </div>
              <p className="eyebrow">{locale === 'pt' ? 'Sala encerrada' : 'Room closed'}</p>
              <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
                {locale === 'pt' ? 'Quiz cancelado' : 'Quiz cancelled'}
              </h1>
              <p className="text-muted mt-4 leading-relaxed">
                {t.quizCancelledNotice}
              </p>
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                <Link href="/" className="btn-primary">
                  {t.joinAnotherQuiz}
                </Link>
              </div>
            </section>
          </div>
        )}

        {view?.phase === 'expired' && (
          <div className="container-game flex min-h-[72vh] items-center justify-center pb-16">
            <section className="glass w-full max-w-xl px-7 py-12 text-center animate-in sm:px-12" role="status">
              <p className="eyebrow">{locale === 'pt' ? 'Sala encerrada' : 'Room closed'}</p>
              <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
                {locale === 'pt' ? 'Quiz encerrado após uma hora' : 'Quiz closed after one hour'}
              </h1>
              <p className="text-muted mt-4">
                {locale === 'pt'
                  ? 'Peça um novo link ou QR Code ao apresentador.'
                  : 'Ask your host for a new link or QR code to join another quiz.'}
              </p>
              <CloseParticipantWindow />
            </section>
          </div>
        )}

        {!player && view?.phase !== 'lobby' && view?.phase !== 'cancelled' && view?.phase !== 'expired' && view && (
          <div className="container-game glass mt-8 p-9 text-center animate-in">
            <h1 className="text-2xl font-bold">
              {locale === 'pt' ? 'Esta partida já começou.' : 'This game has already started.'}
            </h1>
            <p className="text-muted mt-3">
              {locale === 'pt'
                ? 'Peça ao apresentador para incluí-lo na próxima rodada.'
                : 'Ask the host to include you in the next one.'}
            </p>
          </div>
        )}

        {player && view?.phase === 'lobby' && (
          <div className="container-game flex min-h-[72vh] items-center justify-center pb-16">
            <section className="glass w-full max-w-xl px-7 py-12 text-center animate-in sm:px-12">
              <div className="waiting-orbit mx-auto mb-8" aria-hidden="true">
                <span />
              </div>
              <p className="eyebrow">{locale === 'pt' ? 'Você entrou' : 'You’re in'}</p>
              <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
                {locale === 'pt' ? 'Bem-vindo,' : 'Welcome,'} <span className="gradient-text">{player.nickname}.</span>
              </h1>
              <p className="text-muted mt-4">
                {locale === 'pt'
                  ? 'O apresentador vai iniciar o quiz em instantes. Mantenha esta tela aberta.'
                  : 'The host will start the quiz in a moment. Keep this screen open.'}
              </p>
              <div className="glass-soft mt-8 p-4 text-sm text-[#d6def5]">
                {view.quizName} <span className="text-muted mx-2">·</span> {t.waitingRoom}
              </div>
            </section>
          </div>
        )}

        {player && view?.phase === 'quiz' && view.question && (
          <Quiz view={{ ...view, serverNow: now }} selectedChoiceIds={selectedChoiceIds} onAnswer={answer} />
        )}

        {player && view?.phase === 'leaderboard' && (
          <div className="container-game max-w-xl pb-16">
            <section className="glass p-6 sm:p-8 space-y-5 animate-in">
              <div className="text-center">
                <StatPill accent="amber">
                  <Trophy className="h-3.5 w-3.5" /> {t.partialStandingsTitle}
                </StatPill>
                {view.roundFeedback && (
                  <div className="mt-4">
                    <h1 className="text-2xl font-extrabold sm:text-3xl">
                      {t.rankPosition(view.roundFeedback.rank, view.roundFeedback.totalPlayers)}
                    </h1>
                    {view.roundFeedback.pointsBehindNext !== null && view.roundFeedback.pointsBehindNext > 0 && (
                      <p className="mt-1 text-sm font-semibold text-[#ffe0a6]">
                        {t.pointsBehind(view.roundFeedback.pointsBehindNext, view.roundFeedback.rank - 1)}
                      </p>
                    )}
                    {view.roundFeedback.pointsAheadNext !== null && view.roundFeedback.pointsAheadNext > 0 && (
                      <p className="mt-1 text-sm font-semibold text-[#65f5a3]">
                        {t.pointsAhead(view.roundFeedback.pointsAheadNext)}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <ol className="space-y-2.5">
                {view.partialLeaderboard.map((entry) => {
                  const isMe = entry.id === player.id
                  return (
                    <li
                      key={entry.id}
                      className={`glass-soft flex items-center justify-between gap-3 px-4 py-3 ${
                        isMe ? 'border-[#7de2e4]/70 bg-[#7de2e4]/15' : ''
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="rank-badge text-xs">{String(entry.rank).padStart(2, '0')}</span>
                        <span className="truncate font-bold text-white">
                          {entry.nickname} {isMe ? (locale === 'pt' ? '(Você)' : '(You)') : ''}
                        </span>
                        {entry.streak >= 2 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/20 px-2 py-0.5 text-[11px] font-bold text-amber-200">
                            <Flame className="h-3 w-3" /> {entry.streak}x
                          </span>
                        )}
                      </div>
                      <strong className="tabular-nums text-[#ffe0a6]">{entry.totalScore} pts</strong>
                    </li>
                  )
                })}
              </ol>

              <p className="text-muted text-center text-xs">
                {locale === 'pt' ? 'Aguardando a próxima pergunta...' : 'Waiting for the next question...'}
              </p>
            </section>
          </div>
        )}

        {player && view?.phase === 'result' && (
          <div className="container-game flex min-h-[72vh] items-center justify-center pb-16">
            <section className="glass w-full max-w-xl px-7 py-12 text-center animate-in sm:px-12">
              <div className="winner-crown mx-auto" aria-hidden="true">
                ✦
              </div>
              <p className="eyebrow mt-7">{t.gameComplete}</p>
              <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
                {t.sessionComplete} <span className="gradient-text">{player.nickname}.</span>
              </h1>
              <p className="text-muted mt-4">
                {t.thankYouPlaying} ({view.quizName})
              </p>
              {view.result && (
                <div className="mt-8 grid gap-3 sm:grid-cols-3" aria-label="Your quiz results">
                  <div className="glass-soft p-4">
                    <strong className="block text-2xl font-extrabold tabular-nums text-[#7de2e4]">
                      #{view.result.rank}
                    </strong>
                    <span className="text-muted mt-1 block text-xs">
                      {locale === 'pt' ? 'Posição' : 'Rank'}
                    </span>
                  </div>
                  <div className="glass-soft p-4">
                    <strong className="block text-2xl font-extrabold tabular-nums text-[#ffe0a6]">
                      {view.result.totalScore}
                    </strong>
                    <span className="text-muted mt-1 block text-xs">
                      {locale === 'pt' ? 'Pontos' : 'Points'}
                    </span>
                  </div>
                  <div className="glass-soft p-4">
                    <strong className="block text-2xl font-extrabold tabular-nums text-[#6cf2a0]">
                      {view.result.correctCount}/{view.questionCount}
                    </strong>
                    <span className="text-muted mt-1 block text-xs">
                      {locale === 'pt' ? 'Acertos' : 'Correct'}
                      {view.result.bestStreak >= 2 ? ` · 🔥 ${view.result.bestStreak}x` : ''}
                    </span>
                  </div>
                </div>
              )}
              <CloseParticipantWindow />
            </section>
          </div>
        )}
      </div>
    </main>
  )
}
