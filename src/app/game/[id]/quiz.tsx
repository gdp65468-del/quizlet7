'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Flame, Zap } from 'lucide-react'
import { CountdownBar } from '@/components/countdown'
import { QuestionMedia } from '@/components/question-media'
import { ProgressBar, StatPill } from '@/components/ui'
import { useI18n } from '@/lib/i18n'
import { soundEngine } from '@/lib/sound-engine'
import type { PlayerGameView } from '@/types/game'

const symbols = ['◆', '●', '▲', '■', '★', '✚']

export default function Quiz({
  view,
  selectedChoiceIds,
  onAnswer,
}: {
  view: PlayerGameView
  selectedChoiceIds: string[]
  onAnswer: (choiceIds: string[]) => void
}) {
  const { t, locale } = useI18n()
  const question = view.question!
  const isMultiSelect = question.type === 'multi_select'
  const [draftIds, setDraftIds] = useState<string[]>([])

  const elapsed = view.serverNow - (view.questionStartedAt ?? view.serverNow)
  const choicesVisible = elapsed >= view.choiceRevealMs || view.isAnswerRevealed
  const answerElapsedMs = Math.max(0, elapsed - view.choiceRevealMs)
  const secondsLeft = Math.max(0, Math.ceil((view.answerTimeMs - answerElapsedMs) / 1000))
  const questionPercent = ((view.questionIndex + 1) / view.questionCount) * 100

  const hasSubmitted = selectedChoiceIds.length > 0
  const selectedSet = new Set(selectedChoiceIds)

  const feedbackSoundRef = useRef<string>('')

  useEffect(() => {
    const timer = setTimeout(() => {
      setDraftIds([])
    }, 0)
    return () => clearTimeout(timer)
  }, [question.id])

  useEffect(() => {
    if (!view.isAnswerRevealed || !view.roundFeedback) return
    const key = `${question.id}:revealed`
    if (feedbackSoundRef.current === key) return
    feedbackSoundRef.current = key
    if (view.roundFeedback.isCorrect || view.roundFeedback.isPartial) {
      soundEngine.playPlayerCorrect(view.roundFeedback.streak)
    } else {
      soundEngine.playPlayerWrong()
    }
  }, [question.id, view.isAnswerRevealed, view.roundFeedback])

  const toggleDraft = (choiceId: string) => {
    soundEngine.unlock()
    setDraftIds((prev) =>
      prev.includes(choiceId) ? prev.filter((id) => id !== choiceId) : [...prev, choiceId],
    )
  }

  const fb = view.roundFeedback
  const selectedChoicesText = question.choices
    .filter((c) => selectedSet.has(c.id))
    .map((c) => c.body)
    .join(', ')

  const feedbackClass = fb
    ? fb.isCorrect
      ? 'answer-feedback-correct'
      : fb.isPartial
        ? 'answer-feedback-correct'
        : hasSubmitted
          ? 'answer-feedback-incorrect'
          : 'answer-feedback-timeout'
    : hasSubmitted
      ? 'answer-feedback-incorrect'
      : 'answer-feedback-timeout'

  return (
    <div className="container-game max-w-3xl pb-16" key={question.id}>
      <div className="mb-6 animate-in">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">{view.quizName}</p>
            <h1 className="mt-2 text-xl font-bold">
              {t.questionOf(view.questionIndex + 1, view.questionCount)}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {question.pointsMultiplier === 2 && (
              <span className="bonus-badge">
                <Zap className="h-3.5 w-3.5" /> {t.bonus2x}
              </span>
            )}
            {view.streak >= 2 && (
              <StatPill accent="amber">
                <Flame className="h-3.5 w-3.5" /> {t.streakLabel(view.streak)}
              </StatPill>
            )}
            <StatPill accent={view.isAnswerRevealed ? 'mint' : !choicesVisible ? 'violet' : secondsLeft <= 5 ? 'amber' : 'cyan'}>
              {view.isAnswerRevealed
                ? t.answerRevealed
                : !choicesVisible
                  ? locale === 'pt'
                    ? `Aguarde (${secondsLeft}s)`
                    : `Wait (${secondsLeft}s)`
                  : t.secondsLeft(secondsLeft)}
            </StatPill>
          </div>
        </div>
        <ProgressBar value={questionPercent} />
      </div>

      <section className="glass px-6 py-8 animate-in sm:px-9 sm:py-10 space-y-5" aria-labelledby="question-title">
        <span className="eyebrow">
          {view.isAnswerRevealed
            ? locale === 'pt'
              ? 'Confira a resposta'
              : 'Review the answer'
            : isMultiSelect
              ? t.multiSelectHint
              : question.type === 'true_false'
                ? t.trueFalseHint
                : locale === 'pt'
                  ? 'Escolha uma alternativa'
                  : 'Select one answer'}
        </span>
        <h2 id="question-title" className="text-3xl font-bold leading-snug tracking-tight sm:text-[2.4rem]">
          {question.body}
        </h2>
        <QuestionMedia
          imageUrl={question.imageUrl}
          codeSnippet={question.codeSnippet}
          codeLanguage={question.codeLanguage}
        />
        <div className="flex items-center gap-3 pt-2">
          <span className="text-muted whitespace-nowrap text-xs font-semibold">
            {view.isAnswerRevealed
              ? t.answerRevealed
              : !choicesVisible
                ? locale === 'pt'
                  ? 'Leia a pergunta'
                  : 'Read first'
                : locale === 'pt'
                  ? 'Tempo'
                  : 'Time left'}
          </span>
          <CountdownBar
            key={`${question.id}-${choicesVisible ? 'open' : 'wait'}`}
            elapsedMs={answerElapsedMs}
            durationMs={view.answerTimeMs}
            paused={!choicesVisible || view.isAnswerRevealed}
          />
        </div>
      </section>

      {!choicesVisible && !view.isAnswerRevealed && (
        <div className="glass-soft mt-5 flex min-h-44 flex-col items-center justify-center text-center animate-in">
          <div className="mb-4 flex gap-2">
            <span className="loading-dot" />
            <span className="loading-dot" />
            <span className="loading-dot" />
          </div>
          <p className="font-semibold">{t.readQuestionPlayer}</p>
          <p className="text-muted mt-1 text-sm">{t.choicesAppearSoon}</p>
        </div>
      )}

      {choicesVisible && !view.isAnswerRevealed && !hasSubmitted && (
        <div className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {question.choices.map((choice, index) => {
              const isPicked = draftIds.includes(choice.id)
              return (
                <button
                  key={choice.id}
                  type="button"
                  className={`choice-card choice-${index % 6} animate-in ${isPicked ? 'choice-multi-picked' : ''}`}
                  style={{ animationDelay: `${index * 80}ms` }}
                  onClick={() => {
                    if (isMultiSelect) {
                      toggleDraft(choice.id)
                    } else {
                      onAnswer([choice.id])
                    }
                  }}
                >
                  <span className="choice-symbol" aria-hidden="true">
                    {symbols[index % symbols.length]}
                  </span>
                  <span className="min-w-0 flex-1 text-lg font-semibold sm:text-xl">{choice.body}</span>
                  {isMultiSelect && (
                    <span
                      className={`ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${
                        isPicked ? 'border-white bg-white text-[#1b1033]' : 'border-white/35 bg-black/20 text-transparent'
                      }`}
                    >
                      <Check className="h-4 w-4" />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          {isMultiSelect && (
            <button
              type="button"
              disabled={draftIds.length === 0}
              onClick={() => onAnswer(draftIds)}
              className="btn-primary btn-success w-full py-4"
            >
              {t.submitAnswers} ({draftIds.length})
            </button>
          )}
        </div>
      )}

      {!view.isAnswerRevealed && hasSubmitted && (
        <div className="glass mt-5 p-6 text-center animate-in sm:p-8">
          <div className="mx-auto mb-4 flex h-13 w-13 items-center justify-center rounded-2xl bg-[rgba(165,139,255,.18)] text-2xl text-[#cbbdff]">
            ✓
          </div>
          <h3 className="text-xl font-bold">{t.answerLocked}</h3>
          <p className="text-muted mt-2">
            {locale === 'pt' ? 'Sua escolha:' : 'You chose'} <strong className="text-white">{selectedChoicesText}</strong>.{' '}
            {t.waitingReveal}
          </p>
        </div>
      )}

      {view.isAnswerRevealed && (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2" role="group" aria-label="Revealed answer choices">
            {question.choices.map((choice, index) => {
              const isCorrect = 'is_correct' in choice && choice.is_correct
              const isSelected = selectedSet.has(choice.id)
              const isSelectedWrong = isSelected && !isCorrect
              return (
                <div
                  key={choice.id}
                  className={`choice-card choice-${index % 6} animate-in ${
                    isCorrect ? 'choice-correct' : isSelectedWrong ? 'choice-incorrect' : 'choice-dim'
                  }`}
                  style={{ animationDelay: `${index * 80}ms` }}
                >
                  <span className="choice-symbol" aria-hidden="true">
                    {symbols[index % symbols.length]}
                  </span>
                  <span className="min-w-0 flex-1 text-lg font-semibold sm:text-xl">{choice.body}</span>
                  {(isCorrect || isSelectedWrong) && (
                    <span className="ml-auto text-xl font-extrabold" role="img" aria-label={isCorrect ? 'Correct' : 'Incorrect'}>
                      {isCorrect ? '✓' : '×'}
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          <div className={`answer-feedback mt-5 animate-in ${feedbackClass}`} role="status">
            <span className="answer-feedback-icon" aria-hidden="true">
              {fb?.isCorrect || fb?.isPartial ? '✓' : hasSubmitted ? '×' : '–'}
            </span>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-lg">
                  {fb?.isCorrect
                    ? t.correct
                    : fb?.isPartial
                      ? t.partialCorrect
                      : hasSubmitted
                        ? t.incorrect
                        : t.timeUp}
                </strong>
                {fb && fb.earnedScore > 0 && (
                  <span className="inline-flex items-center gap-2 rounded-full bg-black/25 px-3 py-1 text-sm font-extrabold text-[#ffe0a6]">
                    +{fb.earnedScore} pts
                    {fb.streak >= 2 && (
                      <span className="text-amber-200">({t.streakLabel(fb.streak)} 🔥)</span>
                    )}
                  </span>
                )}
              </div>

              {fb && fb.earnedScore > 0 && (
                <p className="text-xs font-semibold opacity-90">
                  Base: +{fb.baseScore} · {t.speedBonusLabel}: +{fb.speedBonus}
                  {fb.streakBonus > 0 ? ` · ${t.streakBonusLabel}: +${fb.streakBonus}` : ''}
                  {fb.multiplier === 2 ? ' · 2x Bônus!' : ''}
                </p>
              )}

              {fb && fb.totalPlayers > 0 && (
                <div className="rounded-xl bg-black/20 px-3.5 py-2.5 text-sm font-bold">
                  <span>{t.rankPosition(fb.rank, fb.totalPlayers)}</span>
                  {fb.pointsBehindNext !== null && fb.pointsBehindNext > 0 && (
                    <span className="opacity-90"> — {t.pointsBehind(fb.pointsBehindNext, fb.rank - 1)}</span>
                  )}
                  {fb.pointsAheadNext !== null && fb.pointsAheadNext > 0 && (
                    <span className="opacity-90"> — {t.pointsAhead(fb.pointsAheadNext)}</span>
                  )}
                  {fb.rankDelta !== 0 && (
                    <span className="ml-2 inline-block rounded-md bg-white/15 px-2 py-0.5 text-xs">
                      {fb.rankDelta > 0 ? `▲ ${t.rankUp(fb.rankDelta)}` : `▼ ${t.rankDown(fb.rankDelta)}`}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
