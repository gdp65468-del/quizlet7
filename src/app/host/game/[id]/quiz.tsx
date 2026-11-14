'use client'

import { useEffect, useRef } from 'react'
import { BarChart2, LogOut, Zap } from 'lucide-react'
import { CountdownRing } from '@/components/countdown'
import { QuestionMedia } from '@/components/question-media'
import { ArrowIcon, Delay, ProgressBar, StatPill } from '@/components/ui'
import { useI18n } from '@/lib/i18n'
import { soundEngine } from '@/lib/sound-engine'
import type { HostGameView } from '@/types/game'

const symbols = ['◆', '●', '▲', '■', '★', '✚']

export default function Quiz({
  view,
  onAction,
  onRequestCancel,
}: {
  view: HostGameView
  onAction: (action: string) => void
  onRequestCancel: () => void
}) {
  const { t, locale } = useI18n()
  const question = view.question!
  const elapsed = view.serverNow - (view.questionStartedAt ?? view.serverNow)
  const choicesVisible = elapsed >= view.choiceRevealMs || view.isAnswerRevealed
  const secondsLeft = Math.max(0, Math.ceil((view.choiceRevealMs + view.answerTimeMs - elapsed) / 1000))
  const answerPercent = view.participants.length ? (view.answers.length / view.participants.length) * 100 : 0
  const questionPercent = ((view.questionIndex + 1) / view.questionCount) * 100

  const choiceCounts = new Map<string, number>()
  for (const answer of view.answers) {
    const pickedIds = answer.choiceIds?.length ? answer.choiceIds : [answer.choiceId]
    for (const cid of pickedIds) {
      choiceCounts.set(cid, (choiceCounts.get(cid) ?? 0) + 1)
    }
  }
  const highestCount = Math.max(1, ...choiceCounts.values())

  const lastTickRef = useRef<string>('')
  const prevRevealedRef = useRef<{ qid: string; revealed: boolean }>({ qid: question.id, revealed: view.isAnswerRevealed })

  useEffect(() => {
    if (view.isAnswerRevealed || !choicesVisible) return
    if (secondsLeft >= 1 && secondsLeft <= 5) {
      const key = `${question.id}:${secondsLeft}`
      if (lastTickRef.current !== key) {
        lastTickRef.current = key
        soundEngine.playCountdownTick(secondsLeft)
      }
    }
  }, [question.id, secondsLeft, view.isAnswerRevealed, choicesVisible])

  useEffect(() => {
    const prev = prevRevealedRef.current
    if (prev.qid !== question.id) {
      prevRevealedRef.current = { qid: question.id, revealed: view.isAnswerRevealed }
      return
    }
    if (!prev.revealed && view.isAnswerRevealed) {
      soundEngine.playRevealSound(true)
    }
    prevRevealedRef.current = { qid: question.id, revealed: view.isAnswerRevealed }
  }, [question.id, view.isAnswerRevealed])

  const hasMoreQuestions = view.questionIndex + 1 < view.questionCount
  const typeLabel =
    question.type === 'true_false'
      ? t.trueFalseHint
      : question.type === 'multi_select'
        ? t.multiSelectHint
        : null

  return (
    <div className="container-game pb-16">
      <div className="mb-7 animate-in">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">{t.liveQuestion}</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{view.quizName}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {question.pointsMultiplier === 2 && (
              <span className="bonus-badge">
                <Zap className="h-3.5 w-3.5" /> {t.bonus2x}
              </span>
            )}
            <StatPill accent={view.isAnswerRevealed ? 'mint' : 'violet'}>
              {view.isAnswerRevealed ? t.answerRevealed : t.questionOf(view.questionIndex + 1, view.questionCount)}
            </StatPill>
          </div>
        </div>
        <ProgressBar className="mt-5" value={questionPercent} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-5">
          <Delay index={1}>
            <section className="glass p-6 sm:p-9 space-y-5" aria-labelledby="question-title">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="eyebrow">
                  {locale === 'pt' ? 'Pergunta' : 'Question'} {String(view.questionIndex + 1).padStart(2, '0')}
                </span>
                {typeLabel && (
                  <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-bold text-[#d6def5]">
                    {typeLabel}
                  </span>
                )}
              </div>
              <h2 id="question-title" className="text-3xl font-bold leading-snug tracking-tight sm:text-[2.4rem]">
                {question.body}
              </h2>
              <QuestionMedia
                imageUrl={question.imageUrl}
                codeSnippet={question.codeSnippet}
                codeLanguage={question.codeLanguage}
              />
            </section>
          </Delay>

          <div className="grid gap-3 sm:grid-cols-2" key={question.id}>
            {choicesVisible ? (
              question.choices.map((choice, index) => (
                <div
                  key={choice.id}
                  className={`choice-card choice-${index % 6} animate-in ${
                    view.isAnswerRevealed && choice.is_correct ? 'choice-correct' : ''
                  } ${view.isAnswerRevealed && !choice.is_correct ? 'choice-dim' : ''}`}
                  style={{ animationDelay: `${(index + 2) * 80}ms` }}
                >
                  <span className="choice-symbol" aria-hidden="true">
                    {symbols[index % symbols.length]}
                  </span>
                  <span className="min-w-0 flex-1 text-lg font-semibold sm:text-xl">{choice.body}</span>
                  {view.isAnswerRevealed && choice.is_correct && (
                    <span className="ml-auto text-lg font-bold" role="img" aria-label="Correct answer">
                      ✓
                    </span>
                  )}
                </div>
              ))
            ) : (
              <div className="glass-soft col-span-full flex min-h-48 flex-col items-center justify-center text-center animate-in">
                <div className="mb-5 flex gap-2">
                  <span className="loading-dot" />
                  <span className="loading-dot" />
                  <span className="loading-dot" />
                </div>
                <p className="font-semibold">{t.choicesComing}</p>
                <p className="text-muted mt-1 text-sm">{t.readQuestionHint}</p>
              </div>
            )}
          </div>

          {view.isAnswerRevealed && (
            <section className="glass-soft distribution-card p-6 animate-in sm:p-8" aria-labelledby="distribution-title">
              <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="eyebrow">{locale === 'pt' ? 'Respostas da turma' : 'How everyone answered'}</p>
                  <h3 id="distribution-title" className="mt-2 text-xl font-bold">
                    {locale === 'pt' ? 'Distribuição das respostas' : 'Answer distribution'}
                  </h3>
                </div>
                <span className="text-muted text-[0.95rem]">
                  {view.answers.length}{' '}
                  {view.answers.length === 1
                    ? locale === 'pt'
                      ? 'resposta'
                      : 'response'
                    : locale === 'pt'
                      ? 'respostas'
                      : 'responses'}
                </span>
              </div>
              <div
                className="distribution-chart"
                style={{ gridTemplateColumns: `repeat(${question.choices.length}, minmax(0, 1fr))` }}
              >
                {question.choices.map((choice, index) => {
                  const count = choiceCounts.get(choice.id) ?? 0
                  return (
                    <div
                      key={choice.id}
                      className={`distribution-column choice-${index % 6} ${
                        choice.is_correct ? 'distribution-column-correct' : ''
                      }`}
                    >
                      <span className="sr-only">
                        {choice.body}: {count}
                      </span>
                      <div className="distribution-plot" aria-hidden="true">
                        <div className="distribution-bar-group" style={{ height: `${(count / highestCount) * 148}px` }}>
                          <strong className="distribution-value">
                            {count}
                            {choice.is_correct && <span className="distribution-check">✓</span>}
                          </strong>
                          <span className="distribution-bar" />
                        </div>
                      </div>
                      <span className="distribution-symbol" aria-hidden="true">
                        {symbols[index % symbols.length]}
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </div>

        <Delay index={2}>
          <aside className="glass p-6 sm:p-7" aria-label="Question status">
            <p className="eyebrow">{locale === 'pt' ? 'Pulso da rodada' : 'Round pulse'}</p>
            <div className="mt-7 flex justify-center">
              <CountdownRing
                key={question.id}
                elapsedMs={elapsed}
                durationMs={view.choiceRevealMs + view.answerTimeMs}
                paused={view.isAnswerRevealed}
              >
                <div className="text-center">
                  <div className="text-4xl font-extrabold tabular-nums">{view.isAnswerRevealed ? '✓' : secondsLeft}</div>
                  <div className="text-muted text-xs font-bold uppercase tracking-widest">
                    {view.isAnswerRevealed ? (locale === 'pt' ? 'fim' : 'done') : locale === 'pt' ? 'seg' : 'seconds'}
                  </div>
                </div>
              </CountdownRing>
            </div>
            <div className="rule my-7" />
            <div className="flex items-end justify-between">
              <span className="text-muted text-sm">{t.answersCount}</span>
              <strong className="text-2xl tabular-nums">
                {view.answers.length}
                <span className="text-muted text-base">/{view.participants.length}</span>
              </strong>
            </div>
            <ProgressBar className="mt-3" value={answerPercent} />
            <p className="text-muted mt-3 text-xs">
              {view.isAnswerRevealed
                ? locale === 'pt'
                  ? 'Pronto para continuar.'
                  : 'Ready for the next question.'
                : locale === 'pt'
                  ? 'Atualizando em tempo real.'
                  : 'Updates live as players respond.'}
            </p>
            <div className="rule my-7" />
            {view.isAnswerRevealed ? (
              <div className="space-y-3">
                {hasMoreQuestions && (
                  <button
                    type="button"
                    className="btn-secondary w-full"
                    onClick={() => onAction('leaderboard')}
                  >
                    <BarChart2 className="h-4 w-4" /> {t.showPartialRank}
                  </button>
                )}
                <button className="btn-primary btn-success w-full" onClick={() => onAction('next')}>
                  {hasMoreQuestions ? t.nextQuestion : t.seeResults} <ArrowIcon />
                </button>
              </div>
            ) : (
              <button className="btn-secondary w-full" onClick={() => onAction('reveal')}>
                {t.revealNow}
              </button>
            )}
            <div className="rule my-5" />
            <button
              type="button"
              onClick={onRequestCancel}
              className="btn-cancel w-full min-w-0 py-2.5 text-xs"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              {t.endQuizEarly}
            </button>
          </aside>
        </Delay>
      </div>
    </div>
  )
}
