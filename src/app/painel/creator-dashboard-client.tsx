'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Edit3,
  PlusCircle,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { ArrowIcon, Delay, StatPill } from '@/components/ui'
import { useCloudSync } from '@/lib/cloud-sync'
import { useI18n } from '@/lib/i18n'
import { MAX_QUESTIONS_PER_QUIZ, MAX_QUIZZES_PER_USER } from '@/lib/quiz-limits'
import type { QuizSummary } from '@/types/game'

export default function CreatorDashboardClient({
  initialQuizzes,
  creatorName,
  creatorEmail,
}: {
  initialQuizzes: QuizSummary[]
  creatorName: string
  creatorEmail: string
}) {
  const { locale, t } = useI18n()
  const { user, authReady, getJwt } = useCloudSync()
  const isPt = locale === 'pt'

  const [quizzes, setQuizzes] = useState<QuizSummary[]>(initialQuizzes)
  const [loadingList, setLoadingList] = useState(false)
  const [starting, setStarting] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [classLabel, setClassLabel] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const authHeaders = useCallback(
    async (withJson = false): Promise<HeadersInit> => {
      const headers: Record<string, string> = {}
      if (withJson) headers['Content-Type'] = 'application/json'
      const jwt = await getJwt()
      if (jwt) headers['x-appwrite-jwt'] = jwt
      return headers
    },
    [getJwt],
  )

  const refreshQuizzes = useCallback(async () => {
    setLoadingList(true)
    try {
      const res = await fetch('/api/quizzes?scope=creator', {
        cache: 'no-store',
        credentials: 'include',
        headers: await authHeaders(false),
      })
      if (res.ok) {
        const list = (await res.json()) as QuizSummary[]
        setQuizzes(list)
      }
    } catch {
      // keep existing state
    } finally {
      setLoadingList(false)
    }
  }, [authHeaders])

  useEffect(() => {
    if (!authReady) return
    if (user) {
      const timer = setTimeout(() => {
        void refreshQuizzes()
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [authReady, user, refreshQuizzes])

  const quizCount = quizzes.length
  const quotaReached = quizCount >= MAX_QUIZZES_PER_USER
  const totalQuestions = useMemo(
    () => quizzes.reduce((sum, item) => sum + item.questionCount, 0),
    [quizzes],
  )
  const categoryCount = useMemo(
    () => new Set(quizzes.map((q) => q.id.split('/')[0]).filter(Boolean)).size,
    [quizzes],
  )

  const startGame = async (quizId: string) => {
    setStarting(quizId)
    setError('')
    try {
      const response = await fetch('/api/games', {
        method: 'POST',
        credentials: 'include',
        headers: await authHeaders(true),
        body: JSON.stringify({ scope: 'creator', quizId, classLabel: classLabel.trim() }),
      })
      const game = await response.json()
      if (!response.ok) throw new Error(game.error || 'Could not start game')
      localStorage.setItem(`host:${game.id}`, game.hostToken)
      window.location.assign(`/host/game/${game.id}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start game')
      setStarting(null)
    }
  }

  const deleteQuiz = async (quizId: string) => {
    setDeletingId(quizId)
    setError('')
    setNotice('')
    try {
      const response = await fetch(`/api/quizzes?scope=creator&id=${encodeURIComponent(quizId)}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: await authHeaders(false),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || 'Não foi possível excluir o quiz')
      setConfirmDeleteId(null)
      setNotice(isPt ? 'Quiz excluído da sua conta.' : 'Quiz deleted from your account.')
      await refreshQuizzes()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Erro ao excluir quiz')
    } finally {
      setDeletingId(null)
    }
  }

  const displayName = creatorName || user?.name || creatorEmail || (isPt ? 'criador' : 'creator')

  return (
    <>
      <section className="dashboard-overview animate-in" aria-label="Creator dashboard overview">
        <div className="dashboard-greeting">
          <p className="eyebrow">{t.welcomeCreator}</p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-[-.05em] sm:text-5xl">
            {t.welcomeTitle} <span className="gradient-text">{displayName}.</span>
          </h1>

          <div className="dashboard-stats">
            <div className="dashboard-stat dashboard-stat-quizzes">
              <strong className="dashboard-stat-number tabular-nums">
                {quizCount}/{MAX_QUIZZES_PER_USER}
              </strong>
              <span className="dashboard-stat-label">{t.quizzes}</span>
            </div>
            <div className="dashboard-stat dashboard-stat-categories">
              <strong className="dashboard-stat-number tabular-nums">{categoryCount}</strong>
              <span className="dashboard-stat-label">{t.categories}</span>
            </div>
          </div>

          <p className="text-muted mt-5 max-w-2xl leading-relaxed">{t.chooseCreatorQuizHint}</p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {quotaReached ? (
              <button
                type="button"
                disabled
                className="btn-primary cursor-not-allowed opacity-50 whitespace-nowrap"
                title={
                  isPt
                    ? `Limite de ${MAX_QUIZZES_PER_USER} quizzes atingido`
                    : `Limit of ${MAX_QUIZZES_PER_USER} quizzes reached`
                }
              >
                <PlusCircle className="h-4 w-4" /> {t.createQuizBtn} ({quizCount}/{MAX_QUIZZES_PER_USER})
              </button>
            ) : (
              <>
                <Link className="btn-primary btn-success whitespace-nowrap" href="/painel/editor">
                  <PlusCircle className="h-4 w-4" /> {t.createQuizBtn}
                </Link>
                <Link className="btn-secondary whitespace-nowrap" href="/painel/editor?tab=ai">
                  <Sparkles className="h-4 w-4" /> {t.aiPromptBtn}
                </Link>
              </>
            )}

            <Link className="btn-secondary whitespace-nowrap" href="/painel/historico">
              <BarChart3 className="h-4 w-4" /> {t.historyBtn}
            </Link>
            <Link className="btn-secondary whitespace-nowrap" href="/painel/enquete">
              {t.createPollBtn} <ArrowIcon />
            </Link>
          </div>
        </div>
      </section>

      {quotaReached && (
        <div
          className="mt-6 rounded-2xl border border-amber-300/40 bg-amber-400/12 p-5 text-sm text-amber-100 animate-in"
          role="alert"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden="true" />
            <div>
              <p className="font-bold text-amber-200">
                {isPt
                  ? `Limite de ${MAX_QUIZZES_PER_USER} quizzes atingido (${quizCount}/${MAX_QUIZZES_PER_USER})`
                  : `Limit of ${MAX_QUIZZES_PER_USER} quizzes reached (${quizCount}/${MAX_QUIZZES_PER_USER})`}
              </p>
              <p className="mt-1 text-xs leading-relaxed">
                {isPt
                  ? `Você já atingiu o máximo de ${MAX_QUIZZES_PER_USER} quizzes salvos na sua conta. Edite ou exclua um dos quizzes listados abaixo para liberar espaço antes de criar um novo.`
                  : `You have reached the maximum of ${MAX_QUIZZES_PER_USER} saved quizzes on your account. Edit or delete one of the quizzes below before creating a new one.`}
              </p>
            </div>
          </div>
        </div>
      )}

      <section className="mt-10 sm:mt-12" aria-labelledby="creator-library-title">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">{isPt ? 'Conta isolada · Appwrite Auth' : 'Isolated account · Appwrite Auth'}</p>
            <h2 id="creator-library-title" className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              {t.myQuizzes}
            </h2>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="label mb-1 text-xs">{t.classLabelInput}</span>
              <input
                type="text"
                className="field py-2.5 text-sm"
                maxLength={80}
                value={classLabel}
                onChange={(e) => setClassLabel(e.target.value)}
                placeholder={t.classLabelPlaceholder}
              />
            </label>
            <StatPill accent={quotaReached ? 'amber' : 'mint'}>
              {quizCount}/{MAX_QUIZZES_PER_USER} quizzes · {totalQuestions} {isPt ? 'perguntas' : 'questions'}
            </StatPill>
          </div>
        </div>

        {error && (
          <p role="alert" className="notice mb-6">
            {error}
          </p>
        )}

        {notice && (
          <p role="status" className="mb-6 rounded-2xl border border-emerald-400/35 bg-emerald-500/15 px-4 py-3 text-sm font-semibold text-emerald-200">
            {notice}
          </p>
        )}

        {loadingList && quizzes.length === 0 ? (
          <div className="glass flex min-h-48 items-center justify-center">
            <div className="flex gap-2">
              <span className="loading-dot" />
              <span className="loading-dot" />
              <span className="loading-dot" />
            </div>
          </div>
        ) : quizzes.length === 0 ? (
          <div className="glass p-10 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/15 bg-white/5 text-[#f5cf70]">
              <BookOpen className="h-6 w-6" aria-hidden="true" />
            </div>
            <h3 className="text-xl font-bold">
              {isPt ? 'Você ainda não criou nenhum quiz' : 'You have not created any quizzes yet'}
            </h3>
            <p className="text-muted mx-auto max-w-lg text-sm">
              {isPt
                ? `Crie até ${MAX_QUIZZES_PER_USER} quizzes privados com até ${MAX_QUESTIONS_PER_QUIZ} perguntas cada um e apresente ao vivo para sua igreja, célula ou turma.`
                : `Create up to ${MAX_QUIZZES_PER_USER} private quizzes with up to ${MAX_QUESTIONS_PER_QUIZ} questions each and host live sessions.`}
            </p>
            <Link href="/painel/editor" className="btn-primary btn-success inline-flex">
              <PlusCircle className="h-4 w-4" /> {t.createQuizBtn}
            </Link>
          </div>
        ) : (
          <div className="quiz-list" aria-label={t.myQuizzes}>
            {quizzes.map((quiz, index) => {
              const categorySlug = quiz.id.split('/')[0] || 'geral'
              const isConfirming = confirmDeleteId === quiz.id
              return (
                <Delay key={quiz.id} index={index}>
                  <article className="glass glass-hover quiz-list-item">
                    <span className="quiz-list-number" aria-hidden="true">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div className="quiz-list-details">
                      <p className="eyebrow text-[11px]">{categorySlug}</p>
                      <h3 className="mt-1 text-xl font-bold tracking-tight">{quiz.name}</h3>
                      <p className="text-muted mt-2 text-sm leading-relaxed">
                        {quiz.description || (isPt ? 'Um novo desafio para seus participantes.' : 'A new challenge for your participants.')}
                      </p>
                      <span className="quiz-question-count tabular-nums">
                        {t.questionCountLabel(quiz.questionCount)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      {isConfirming ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={deletingId === quiz.id}
                            onClick={() => void deleteQuiz(quiz.id)}
                            className="btn-cancel min-w-0 px-3.5 py-2.5 text-xs"
                          >
                            {deletingId === quiz.id
                              ? '...'
                              : isPt
                                ? 'Confirmar exclusão'
                                : 'Confirm delete'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="btn-ghost px-2.5 py-2 text-xs"
                          >
                            {isPt ? 'Cancelar' : 'Cancel'}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(quiz.id)}
                          className="btn-cancel min-w-0 px-3.5 py-3 text-xs"
                          title={isPt ? 'Excluir quiz' : 'Delete quiz'}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}

                      <Link
                        href={`/painel/editor?id=${encodeURIComponent(quiz.id)}`}
                        className="btn-secondary whitespace-nowrap px-4 py-3 text-sm"
                      >
                        <Edit3 className="h-4 w-4" /> {t.editQuiz}
                      </Link>

                      <button
                        type="button"
                        className="btn-primary btn-success quiz-list-action whitespace-nowrap"
                        disabled={starting !== null}
                        onClick={() => startGame(quiz.id)}
                      >
                        {starting === quiz.id ? t.openingRoom : t.hostThisQuiz} <ArrowIcon />
                      </button>
                    </div>
                  </article>
                </Delay>
              )
            })}
          </div>
        )}
      </section>
    </>
  )
}
