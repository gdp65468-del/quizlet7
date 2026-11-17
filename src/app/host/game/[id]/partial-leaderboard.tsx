'use client'

import type { CSSProperties } from 'react'
import { useEffect } from 'react'
import { Flame, LogOut, TrendingUp, Trophy } from 'lucide-react'
import { ArrowIcon, StatPill } from '@/components/ui'
import { useI18n } from '@/lib/i18n'
import { soundEngine } from '@/lib/sound-engine'
import type { HostGameView } from '@/types/game'

export default function PartialLeaderboard({
  view,
  onNext,
  onRequestCancel,
}: {
  view: HostGameView
  onNext: () => void
  onRequestCancel: () => void
}) {
  const { t, locale } = useI18n()

  useEffect(() => {
    soundEngine.playLeaderboardSwoosh()
  }, [])

  return (
    <div className="container-game max-w-4xl pb-20">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4 animate-in">
        <div>
          <StatPill accent="amber">
            <Trophy className="h-3.5 w-3.5" /> {t.partialStandingsTitle}
          </StatPill>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-5xl">
            {t.top5Players}
          </h1>
          <p className="text-muted mt-2 text-sm">
            {view.quizName} · {t.questionOf(view.questionIndex + 1, view.questionCount)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onRequestCancel}
            className="btn-cancel min-w-0 px-4 py-3 text-xs"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {t.endQuizEarly}
          </button>
          <button type="button" onClick={onNext} className="btn-primary btn-success min-w-48">
            {t.nextQuestion} <ArrowIcon />
          </button>
        </div>
      </div>

      {(view.topStreakPlayer || view.topClimber) && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 animate-in">
          {view.topStreakPlayer && (
            <div className="glass-soft flex items-center gap-4 border border-amber-400/30 p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-400/20 text-amber-300">
                <Flame className="h-6 w-6" />
              </div>
              <div>
                <p className="eyebrow text-amber-200">{t.highestStreak}</p>
                <p className="mt-1 text-xl font-extrabold text-white">{view.topStreakPlayer.nickname}</p>
                <p className="text-sm font-semibold text-amber-200">
                  {t.streakLabel(view.topStreakPlayer.streak)} 🔥
                </p>
              </div>
            </div>
          )}

          {view.topClimber && (
            <div className="glass-soft flex items-center gap-4 border border-emerald-400/30 p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-400/20 text-emerald-300">
                <TrendingUp className="h-6 w-6" />
              </div>
              <div>
                <p className="eyebrow text-emerald-200">{t.biggestClimber}</p>
                <p className="mt-1 text-xl font-extrabold text-white">{view.topClimber.nickname}</p>
                <p className="text-sm font-semibold text-emerald-300">
                  +{view.topClimber.rankDelta}{' '}
                  {locale === 'pt'
                    ? view.topClimber.rankDelta === 1
                      ? 'posição'
                      : 'posições'
                    : view.topClimber.rankDelta === 1
                      ? 'spot'
                      : 'spots'}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      <section className="glass p-6 sm:p-8">
        {view.partialLeaderboard.length === 0 ? (
          <p className="text-muted py-8 text-center">
            {locale === 'pt' ? 'Nenhum participante pontuou ainda.' : 'No participants scored yet.'}
          </p>
        ) : (
          <ol className="space-y-3">
            {view.partialLeaderboard.map((entry, idx) => (
              <li
                key={entry.id}
                style={{ '--delay': `${Math.min(idx, 8) * 80}ms` } as CSSProperties}
                className={`glass-soft leaderboard-row animate-in flex items-center gap-4 p-4 sm:p-5 ${
                  idx === 0 ? 'leaderboard-first' : ''
                }`}
              >
                <span className="rank-badge">{String(entry.rank).padStart(2, '0')}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-lg font-extrabold text-white">{entry.nickname}</span>
                    {entry.streak >= 2 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/20 px-2.5 py-0.5 text-xs font-extrabold text-amber-200">
                        <Flame className="h-3.5 w-3.5" /> {entry.streak}x
                      </span>
                    )}
                    {entry.rankDelta > 0 && (
                      <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-bold text-emerald-300">
                        ▲ +{entry.rankDelta}
                      </span>
                    )}
                    {entry.rankDelta < 0 && (
                      <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-xs font-bold text-rose-300">
                        ▼ {Math.abs(entry.rankDelta)}
                      </span>
                    )}
                  </div>
                </div>
                <strong className="shrink-0 text-xl font-extrabold tabular-nums text-[#ffe0a6]">
                  {entry.totalScore} <span className="text-muted text-xs font-medium">pts</span>
                </strong>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
