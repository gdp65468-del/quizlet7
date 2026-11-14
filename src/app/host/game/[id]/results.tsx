'use client'

import { useEffect, useRef, useState } from 'react'
import confetti from 'canvas-confetti'
import { Cloud, Download, Eye, FileText, Flame, RotateCcw, TrendingUp, Trophy } from 'lucide-react'
import { Delay, StatPill } from '@/components/ui'
import { useCloudSync } from '@/lib/cloud-sync'
import { exportReportCsv, exportReportPdf } from '@/lib/export-reports'
import { useI18n } from '@/lib/i18n'
import { soundEngine } from '@/lib/sound-engine'
import type { HostGameView } from '@/types/game'

const plotHeight = 170

function CorrectAnswersHistogram({ distribution }: { distribution: number[] }) {
  const { t, locale } = useI18n()
  const highestFrequency = distribution.reduce((highest, frequency) => Math.max(highest, frequency), 1)
  const tickStep = highestFrequency <= 5 ? 1 : Math.ceil(highestFrequency / 4)
  const axisMax = Math.ceil(highestFrequency / tickStep) * tickStep
  const ticks = Array.from({ length: axisMax / tickStep + 1 }, (_, index) => index * tickStep)
  const columns = `repeat(${distribution.length}, minmax(0, 1fr))`

  return (
    <section className="glass mt-10 p-6 sm:p-8 animate-in" aria-labelledby="correct-distribution-title">
      <p className="eyebrow">{locale === 'pt' ? 'Desempenho da turma' : 'Class results'}</p>
      <h2 id="correct-distribution-title" className="mt-2 text-2xl font-bold">
        {t.correctDistributionTitle}
      </h2>
      <p className="text-muted mt-2 text-sm">
        {locale === 'pt'
          ? 'Quantas pessoas acertaram cada quantidade de perguntas.'
          : 'How many people answered each number of questions correctly.'}
      </p>
      <p className="text-muted mt-7 text-xs font-semibold uppercase tracking-wider">
        {locale === 'pt' ? 'Número de participantes' : 'Number of people'}
      </p>
      <div className="histogram-chart mt-3" role="group">
        <div className="histogram-y-axis" aria-hidden="true">
          {ticks.map((tick) => (
            <span key={tick} style={{ bottom: `${(tick / axisMax) * plotHeight}px` }}>
              {tick}
            </span>
          ))}
        </div>
        <div className="histogram-scroll">
          <div style={{ minWidth: `${Math.max(280, distribution.length * 50)}px` }}>
            <div className="histogram-plot">
              {ticks.map((tick) => (
                <span
                  key={tick}
                  className="histogram-gridline"
                  aria-hidden="true"
                  style={{ bottom: `${(tick / axisMax) * plotHeight}px` }}
                />
              ))}
              <div className="histogram-columns" style={{ gridTemplateColumns: columns }}>
                {distribution.map((frequency, correct) => {
                  const height = (frequency / axisMax) * plotHeight
                  const countInside = height >= 32
                  return (
                    <div className="histogram-column" key={correct} tabIndex={0}>
                      {frequency > 0 && (
                        <span className="histogram-bar" aria-hidden="true" style={{ height: `${height}px` }} />
                      )}
                      <strong
                        className={`histogram-frequency ${countInside ? 'is-inside' : ''}`}
                        aria-hidden="true"
                        style={{ bottom: `${countInside ? height - 27 : height + 7}px` }}
                      >
                        {frequency}
                      </strong>
                      <span
                        className="histogram-tooltip"
                        aria-hidden="true"
                        style={{ bottom: `${countInside ? height + 8 : height + 27}px` }}
                      >
                        {frequency}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="histogram-x-ticks" aria-hidden="true" style={{ gridTemplateColumns: columns }}>
              {distribution.map((_, correct) => (
                <span key={correct}>{correct}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
      <p className="text-muted mt-3 text-center text-xs font-semibold uppercase tracking-wider">
        {locale === 'pt' ? 'Perguntas respondidas corretamente' : 'Questions answered correctly'}
      </p>
    </section>
  )
}

export default function Results({
  view,
  onReturnHome,
  closing,
}: {
  view: HostGameView
  onReturnHome: () => void
  closing: boolean
}) {
  const { t, locale } = useI18n()
  const { user, saveSessionToCloud } = useCloudSync()
  const hidden = view.leaderboardVisibility === 'hide'
  const showLeaderboard = !hidden && view.leaderboardVisibility !== 'top1'
  const leaderboardLabel =
    view.leaderboardVisibility === 'top3'
      ? 'Top 3'
      : view.leaderboardVisibility === 'top10'
        ? 'Top 10'
        : t.finalStandings

  const podiumCount = Math.min(3, view.results.length)
  const [revealStep, setRevealStep] = useState(() => (hidden || podiumCount === 0 ? 3 : 0))
  const [replayKey, setReplayKey] = useState(0)
  const [cloudSynced, setCloudSynced] = useState(false)
  const syncedReportIdRef = useRef<string | null>(null)

  // Auto-sync session report to Appwrite when connected
  useEffect(() => {
    const report = view.sessionReport
    if (!report || !user) return
    if (syncedReportIdRef.current === report.id) return
    syncedReportIdRef.current = report.id
    void saveSessionToCloud(report)
      .then(() => setCloudSynced(true))
      .catch(() => {})
  }, [view.sessionReport, user, saveSessionToCloud])

  // Sequential podium reveal (3rd -> 2nd -> 1st)
  useEffect(() => {
    if (hidden || podiumCount === 0) return

    const reducedMotion =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const timers: ReturnType<typeof setTimeout>[] = []
    if (reducedMotion) {
      timers.push(setTimeout(() => setRevealStep(3), 0))
      return () => timers.forEach(clearTimeout)
    }

    timers.push(setTimeout(() => setRevealStep(1), 350))
    timers.push(setTimeout(() => setRevealStep(2), 1200))
    timers.push(
      setTimeout(() => {
        setRevealStep(3)
        soundEngine.playPodiumFanfare()
        confetti({ particleCount: 90, spread: 75, origin: { y: 0.62 } })
        setTimeout(() => {
          confetti({ particleCount: 50, angle: 60, spread: 55, origin: { x: 0.15, y: 0.65 } })
          confetti({ particleCount: 50, angle: 120, spread: 55, origin: { x: 0.85, y: 0.65 } })
        }, 280)
      }, 2150),
    )

    return () => timers.forEach(clearTimeout)
  }, [hidden, podiumCount, replayKey])

  const first = view.results[0]
  const second = view.results[1]
  const third = view.results[2]

  const podiumVisible1 = revealStep >= 3
  const podiumVisible2 = revealStep >= 2
  const podiumVisible3 = revealStep >= 1

  return (
    <div className="container-game pb-20">
      <section className="glass relative overflow-hidden px-6 py-10 text-center sm:px-10 sm:py-14 animate-in">
        <div className="hero-aura" aria-hidden="true" />
        <div className="relative z-10">
          {!hidden && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <StatPill accent="amber">✦ &nbsp; {t.gameComplete}</StatPill>
              {view.classLabel && <StatPill accent="violet">{view.classLabel}</StatPill>}
              {cloudSynced && (
                <StatPill accent="mint">
                  <Cloud className="h-3.5 w-3.5" /> {t.cloudConnected}
                </StatPill>
              )}
            </div>
          )}
          <h1 className="mt-5 text-4xl font-extrabold tracking-[-.055em] sm:text-6xl">
            {hidden ? (
              t.thankYouPlaying
            ) : (
              <>
                {t.podiumTitle} <span className="gradient-text">✦</span>
              </>
            )}
          </h1>

          {!hidden && (
            <>
              <p className="text-muted mt-4">
                {view.quizName} · {t.questionCountLabel(view.questionCount)}
              </p>

              {view.results.length > 0 ? (
                <>
                  <div className="podium-grid mx-auto max-w-3xl">
                    {/* 2nd Place (Left) */}
                    <div className={`podium-step ${podiumVisible2 && second ? 'is-visible' : ''}`}>
                      {second && (
                        <>
                          <div className="glass-soft mb-3 w-full p-4">
                            <span className="text-xs font-extrabold uppercase tracking-widest text-[#cbd5e1]">
                              2º {locale === 'pt' ? 'Lugar' : 'Place'}
                            </span>
                            <p className="mt-1 truncate text-xl font-extrabold text-white">{second.nickname}</p>
                            <p className="text-sm font-bold text-[#a5ecf6]">{second.totalScore} pts</p>
                          </div>
                          <div className="podium-pedestal podium-2">2</div>
                        </>
                      )}
                    </div>

                    {/* 1st Place (Center) */}
                    <div className={`podium-step ${podiumVisible1 && first ? 'is-visible' : ''}`}>
                      {first && (
                        <>
                          <div className="winner-card glass-soft mb-3 w-full p-5">
                            <div className="winner-crown mx-auto mb-2" aria-hidden="true">
                              <Trophy className="h-6 w-6" />
                            </div>
                            <span className="text-xs font-extrabold uppercase tracking-widest text-[#ffe0a6]">
                              1º {locale === 'pt' ? 'Campeão' : 'Champion'}
                            </span>
                            <p className="mt-1 truncate text-2xl font-extrabold text-white">{first.nickname}</p>
                            <p className="text-base font-extrabold text-[#ffe0a6]">{first.totalScore} pts</p>
                            <p className="text-muted text-xs">
                              {first.correctCount}/{view.questionCount} {locale === 'pt' ? 'acertos' : 'correct'}
                            </p>
                          </div>
                          <div className="podium-pedestal podium-1">1</div>
                        </>
                      )}
                    </div>

                    {/* 3rd Place (Right) */}
                    <div className={`podium-step ${podiumVisible3 && third ? 'is-visible' : ''}`}>
                      {third && (
                        <>
                          <div className="glass-soft mb-3 w-full p-4">
                            <span className="text-xs font-extrabold uppercase tracking-widest text-[#fdba74]">
                              3º {locale === 'pt' ? 'Lugar' : 'Place'}
                            </span>
                            <p className="mt-1 truncate text-xl font-extrabold text-white">{third.nickname}</p>
                            <p className="text-sm font-bold text-[#fdba74]">{third.totalScore} pts</p>
                          </div>
                          <div className="podium-pedestal podium-3">3</div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
                    {revealStep < 3 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setRevealStep(3)
                          soundEngine.playPodiumFanfare()
                          confetti({ particleCount: 70, spread: 70, origin: { y: 0.65 } })
                        }}
                        className="btn-secondary px-4 py-2 text-xs"
                      >
                        <Eye className="h-4 w-4" /> {t.revealAllPodium}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setRevealStep(0)
                          setReplayKey((k) => k + 1)
                        }}
                        className="btn-ghost px-4 py-2 text-xs"
                      >
                        <RotateCcw className="h-4 w-4" /> {t.replayPodium}
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-muted mt-8">
                  {locale === 'pt' ? 'Nenhum participante entrou nesta partida.' : 'No participants joined this game.'}
                </p>
              )}
            </>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {view.sessionReport && (
              <>
                <button
                  type="button"
                  onClick={() => exportReportCsv(view.sessionReport!)}
                  className="btn-secondary"
                >
                  <Download className="h-4 w-4" /> {t.exportCsv}
                </button>
                <button
                  type="button"
                  onClick={() => exportReportPdf(view.sessionReport!)}
                  className="btn-secondary"
                >
                  <FileText className="h-4 w-4" /> {t.exportPdf}
                </button>
              </>
            )}
            <button className="btn-primary btn-success min-w-48" type="button" onClick={onReturnHome} disabled={closing}>
              {closing ? t.closingSession : t.returnHome}
            </button>
          </div>
        </div>
      </section>

      {!hidden && (view.topStreakPlayer || view.topClimber) && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 animate-in">
          {view.topStreakPlayer && (
            <div className="glass-soft flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-400/20 text-amber-300">
                <Flame className="h-6 w-6" />
              </div>
              <div>
                <p className="eyebrow text-amber-200">{t.highestStreak}</p>
                <p className="mt-1 text-xl font-extrabold">{view.topStreakPlayer.nickname}</p>
                <p className="text-sm font-semibold text-amber-200">{t.streakLabel(view.topStreakPlayer.streak)} 🔥</p>
              </div>
            </div>
          )}
          {view.topClimber && (
            <div className="glass-soft flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-400/20 text-emerald-300">
                <TrendingUp className="h-6 w-6" />
              </div>
              <div>
                <p className="eyebrow text-emerald-200">{t.biggestClimber}</p>
                <p className="mt-1 text-xl font-extrabold">{view.topClimber.nickname}</p>
                <p className="text-sm font-semibold text-emerald-300">+{view.topClimber.rankDelta}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {showLeaderboard && (
        <section className="mt-10" aria-labelledby="leaderboard-title">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow">{locale === 'pt' ? 'Classificação completa' : 'The final standings'}</p>
              <h2 id="leaderboard-title" className="mt-2 text-2xl font-bold">
                {leaderboardLabel}
              </h2>
            </div>
            <StatPill accent="cyan">
              {view.participants.length} {locale === 'pt' ? 'participantes' : 'participants'}
            </StatPill>
          </div>
          {view.results.length ? (
            <ol className="space-y-3">
              {view.results.map((result, index) => (
                <Delay key={result.id} index={index}>
                  <li
                    className={`glass-soft leaderboard-row flex items-center gap-4 p-4 sm:p-5 ${
                      index === 0 ? 'leaderboard-first' : ''
                    }`}
                  >
                    <span className="rank-badge">{String(index + 1).padStart(2, '0')}</span>
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-base font-bold sm:text-lg">{result.nickname}</span>
                      {result.bestStreak >= 2 && (
                        <span className="text-xs font-bold text-amber-200">
                          🔥 {t.streakLabel(result.bestStreak)}
                        </span>
                      )}
                    </div>
                    <span className="flex shrink-0 flex-wrap items-baseline justify-end gap-x-4 gap-y-1 text-right">
                      <span className="text-sm font-semibold text-[#a5ecf6]">
                        {result.correctCount}/{view.questionCount}{' '}
                        {locale === 'pt' ? 'acertos' : 'correct'}
                      </span>
                      <strong className="font-extrabold tabular-nums text-[#cbbdff]">
                        {result.totalScore} <span className="text-muted text-xs font-medium">pts</span>
                      </strong>
                    </span>
                  </li>
                </Delay>
              ))}
            </ol>
          ) : (
            <div className="glass p-8 text-center text-muted">
              {locale === 'pt' ? 'Nenhum participante entrou nesta partida.' : 'No participants joined this game.'}
            </div>
          )}
        </section>
      )}

      {view.showDistribution && view.correctDistribution.some((frequency) => frequency > 0) && (
        <CorrectAnswersHistogram distribution={view.correctDistribution} />
      )}
    </div>
  )
}
