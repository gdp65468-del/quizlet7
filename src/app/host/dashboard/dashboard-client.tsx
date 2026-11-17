'use client'

import Link from 'next/link'
import type { CSSProperties } from 'react'
import { useState } from 'react'
import { ArrowIcon, Delay } from '@/components/ui'
import type { QuizSummary } from '@/types/game'

const categoryIcons = [
  <svg key="book" viewBox="0 0 64 64" fill="none"><path d="M32 17c-6-4-14-5-22-3v34c8-2 16-1 22 3 6-4 14-5 22-3V14c-8-2-16-1-22 3ZM32 17v34M16 22c4-.5 8 0 11 1M37 23c3-1 7-1.5 11-1" /></svg>,
  <svg key="flask" viewBox="0 0 64 64" fill="none"><path d="M25 10h14M28 10v17L15 48a5 5 0 0 0 4 7h26a5 5 0 0 0 4-7L36 27V10M22 40h20M28 47h1M37 47h1" /></svg>,
  <svg key="globe" viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="23" /><path d="M9 32h46M32 9c-7 6-11 14-11 23s4 17 11 23M32 9c7 6 11 14 11 23s-4 17-11 23M16 18h32M16 46h32" /></svg>,
  <svg key="code" viewBox="0 0 64 64" fill="none"><rect x="8" y="12" width="48" height="40" rx="6" /><path d="M8 22h48M22 31l-7 7 7 7M42 31l7 7-7 7M37 29l-9 19" /></svg>,
  <svg key="atom" viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="4" /><ellipse cx="32" cy="32" rx="23" ry="9" /><ellipse cx="32" cy="32" rx="23" ry="9" transform="rotate(60 32 32)" /><ellipse cx="32" cy="32" rx="23" ry="9" transform="rotate(120 32 32)" /></svg>,
  <svg key="compass" viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="23" /><path d="m40 24-5 11-11 5 5-11 11-5ZM32 9v5M32 50v5M9 32h5M50 32h5" /></svg>,
  <svg key="nodes" viewBox="0 0 64 64" fill="none"><path d="M32 14v16M19 47l13-17 13 17" /><circle cx="32" cy="11" r="6" /><circle cx="16" cy="50" r="6" /><circle cx="48" cy="50" r="6" /></svg>,
  <svg key="chart" viewBox="0 0 64 64" fill="none"><path d="M10 52h44M15 45V31h10v14M27 45V22h10v23M39 45V13h10v32" /></svg>,
  <svg key="camera" viewBox="0 0 64 64" fill="none"><rect x="9" y="19" width="46" height="33" rx="6" /><path d="m20 19 4-7h16l4 7" /><circle cx="32" cy="35" r="10" /><circle cx="32" cy="35" r="3" /></svg>,
  <svg key="layers" viewBox="0 0 64 64" fill="none"><path d="m32 9 23 12-23 12L9 21 32 9ZM9 32l23 12 23-12M9 43l23 12 23-12" /></svg>,
  <svg key="puzzle" viewBox="0 0 64 64" fill="none"><path d="M12 15h15c-1-4 2-8 6-8s7 4 6 8h13v14c4-1 8 2 8 6s-4 7-8 6v12H39c1-4-2-8-6-8s-7 4-6 8H12V41c-4 1-8-2-8-6s4-7 8-6V15Z" /></svg>,
  <svg key="bulb" viewBox="0 0 64 64" fill="none"><path d="M22 42c-4-4-7-9-7-15a17 17 0 0 1 34 0c0 6-3 11-7 15l-2 6H24l-2-6ZM25 54h14M28 59h8M32 14v6" /></svg>,
  <svg key="shield" viewBox="0 0 64 64" fill="none"><path d="M32 7 52 15v15c0 14-8 22-20 28C20 52 12 44 12 30V15L32 7Z" /><path d="m23 32 6 6 13-14" /></svg>,
  <svg key="wave" viewBox="0 0 64 64" fill="none"><path d="M8 32h7l5-13 8 27 8-34 8 25 5-9h7" /></svg>,
  <svg key="cube" viewBox="0 0 64 64" fill="none"><path d="m32 7 22 12v26L32 57 10 45V19L32 7ZM10 19l22 13 22-13M32 32v25" /></svg>,
  <svg key="clock" viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="23" /><path d="M32 17v16l10 7M32 9v4M55 32h-4M32 55v-4M9 32h4" /></svg>,
]

type CategoryAppearance = { accent: string; start: string; end: string; icon: number }

// The first positions echo the original warm, coral, cyan, and violet palette.
const baseHues = [42, 158, 204, 14, 176, 30, 224, 140, 345, 192, 48, 260]

function seededUnit(position: number, salt: number) {
  let value = Math.imul(position + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b)
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d)
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b)
  return ((value ^ (value >>> 16)) >>> 0) / 0x100000000
}

function accentRgb(hue: number) {
  const saturation = .78
  const lightness = .72
  const amplitude = saturation * Math.min(lightness, 1 - lightness)
  const channel = (offset: number) => {
    const position = (offset + hue / 30) % 12
    return Math.round(255 * (lightness - amplitude * Math.max(-1, Math.min(position - 3, 9 - position, 1))))
  }
  return `${channel(0)}, ${channel(8)}, ${channel(4)}`
}

function appearanceForPosition(position: number): CategoryAppearance {
  const cycle = Math.floor(position / baseHues.length)
  const hue = (baseHues[position % baseHues.length] + cycle * 23 + Math.floor(seededUnit(position, 0) * 13) - 6) % 360
  const iconOffset = Math.floor(seededUnit(cycle, 2) * categoryIcons.length)
  return {
    accent: accentRgb(hue),
    start: `hsl(${hue} 48% 30%)`,
    end: `hsl(${hue} 40% 18%)`,
    icon: (iconOffset + position * 7) % categoryIcons.length,
  }
}

function TopicArt({ appearance }: { appearance: CategoryAppearance }) {
  const style = {
    '--art-rgb': appearance.accent,
    '--art-start': appearance.start,
    '--art-end': appearance.end,
  } as CSSProperties
  return <span className="topic-art" style={style} aria-hidden="true">
    <span className="topic-orbit topic-orbit-one" />
    <span className="topic-orbit topic-orbit-two" />
    <span className="topic-core">
      {categoryIcons[appearance.icon]}
    </span>
  </span>
}

const CATEGORY_LABELS: Record<string, string> = {
  'antigo-testamento': 'Antigo Testamento',
  'novo-testamento': 'Novo Testamento',
  'livros-da-biblia': 'Livros da Bíblia',
  'evangelhos-e-atos': 'Evangelhos e Atos',
  'parabolas-de-jesus': 'Parábolas de Jesus',
}

const LOWERCASE_CONNECTORS = new Set(['da', 'de', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'para'])
const UPPERCASE_ACRONYMS = new Set(['ia', 'ti', 'at', 'nt', 'pdf', 'csv', 'sql', 'api'])

function categoryLabel(category: string) {
  const mapped = CATEGORY_LABELS[category.toLowerCase()]
  if (mapped) return mapped
  return category
    .split(/[-_]/)
    .filter(Boolean)
    .map((word, idx) => {
      const lower = word.toLowerCase()
      if (UPPERCASE_ACRONYMS.has(lower)) return lower.toUpperCase()
      if (idx > 0 && LOWERCASE_CONNECTORS.has(lower)) return lower
      return lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join(' ')
}

import { BarChart3, Edit3, PlusCircle, Sparkles } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

export default function DashboardClient({ quizzes, categories }: { quizzes: QuizSummary[]; categories: string[] }) {
  const { t } = useI18n()
  const [starting, setStarting] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [classLabel, setClassLabel] = useState('')

  const startGame = async (quizId: string) => {
    setStarting(quizId)
    setError('')
    try {
      const response = await fetch('/api/games', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'admin', quizId, classLabel: classLabel.trim() }),
      })
      const game = await response.json()
      if (!response.ok) throw new Error(game.error)
      localStorage.setItem(`host:${game.id}`, game.hostToken)
      window.location.assign(`/host/game/${game.id}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start game')
      setStarting(null)
    }
  }

  const visibleQuizzes = selectedCategory === null
    ? quizzes
    : quizzes.filter((quiz) => quiz.id.split('/')[0] === selectedCategory)
  const questionCount = visibleQuizzes.reduce((total, quiz) => total + quiz.questionCount, 0)
  const quizCounts = new Map<string, number>()
  for (const quiz of quizzes) {
    const category = quiz.id.split('/')[0]
    quizCounts.set(category, (quizCounts.get(category) ?? 0) + 1)
  }
  const appearances = new Map(categories.map((category, position) => [category, appearanceForPosition(position)]))

  return <>
    <section className="dashboard-overview animate-in" aria-label="Dashboard overview">
      <div className="dashboard-greeting">
        <p className="eyebrow">{t.welcomeAdmin}</p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-[-.05em] sm:text-5xl">{t.welcomeTitle} <span className="gradient-text">admin.</span></h1>
        <div className="dashboard-stats">
          <div className="dashboard-stat dashboard-stat-categories">
            <strong className="dashboard-stat-number tabular-nums">{categories.length}</strong>
            <span className="dashboard-stat-label">{t.categories}</span>
          </div>
          <div className="dashboard-stat dashboard-stat-quizzes">
            <strong className="dashboard-stat-number tabular-nums">{quizzes.length}</strong>
            <span className="dashboard-stat-label">{t.quizzes}</span>
          </div>
        </div>
        <p className="text-muted mt-5 max-w-2xl leading-relaxed">{t.chooseQuizHint}</p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link className="btn-primary btn-success whitespace-nowrap" href="/host/dashboard/quizzes/editor">
            <PlusCircle className="h-4 w-4" /> {t.createQuizBtn}
          </Link>
          <Link className="btn-secondary whitespace-nowrap" href="/host/dashboard/quizzes/editor?tab=ai">
            <Sparkles className="h-4 w-4" /> {t.aiPromptBtn}
          </Link>
          <Link className="btn-secondary whitespace-nowrap" href="/host/dashboard/history">
            <BarChart3 className="h-4 w-4" /> {t.historyBtn}
          </Link>
          <Link className="btn-secondary whitespace-nowrap" href="/host/dashboard/polls/new">
            {t.createPollBtn} <ArrowIcon />
          </Link>
        </div>
      </div>
    </section>

    <section className="mt-10 sm:mt-12" aria-labelledby="library-title">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{selectedCategory === null ? t.browseCategory : t.quizLibrary}</p>
          <h2 id="library-title" className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            {selectedCategory === null ? t.quizLibrary : categoryLabel(selectedCategory)}
          </h2>
        </div>
        {selectedCategory === null
          ? <span className="text-muted text-sm tabular-nums">{quizzes.length} quizzes · {questionCount} {t.questionsReady}</span>
          : <div className="flex flex-wrap items-end gap-3">
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
            <button className="btn-secondary library-back" type="button" onClick={() => { setSelectedCategory(null); setError('') }}>
              <ArrowIcon /> {t.backToCategories}
            </button>
          </div>}
      </div>
      {error && <p role="alert" className="notice mb-6">{error}</p>}
      {selectedCategory === null ? <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4" aria-label="Quiz categories">
        {categories.length === 0 && <div className="glass p-10 text-center text-muted md:col-span-2 lg:col-span-4">Nenhum quiz encontrado. Use o Editor Visual para criar o primeiro!</div>}
        {categories.map((category, index) => {
          const count = quizCounts.get(category) ?? 0
          const appearance = appearances.get(category)!
          const style = { '--topic-accent': appearance.accent } as CSSProperties
          return <Delay key={category} index={index}>
            <button className="glass glass-hover topic-card category-card h-full w-full overflow-hidden text-left" style={style} type="button" onClick={() => { setSelectedCategory(category); setError('') }}>
              <TopicArt appearance={appearance} />
              <span className="category-card-content">
                <span className="category-card-heading">
                  <span className="text-xl font-bold tracking-tight">{categoryLabel(category)}</span>
                  <span className="category-card-arrow"><ArrowIcon /></span>
                </span>
                <span className="category-card-count tabular-nums">{count} {count === 1 ? 'quiz' : 'quizzes'}</span>
              </span>
            </button>
          </Delay>
        })}
      </div> : <>
        <p className="text-muted mb-6 text-sm tabular-nums">{visibleQuizzes.length} {visibleQuizzes.length === 1 ? 'quiz' : 'quizzes'} · {t.questionCountLabel(questionCount)}</p>
        {visibleQuizzes.length === 0 && <div className="glass p-10 text-center text-muted">Nenhum quiz nesta categoria ainda.</div>}
        <div className="quiz-list" aria-label={`${categoryLabel(selectedCategory)} quizzes`}>
          {visibleQuizzes.map((quiz, index) => <Delay key={quiz.id} index={index}>
            <article className="glass glass-hover quiz-list-item">
              <span className="quiz-list-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              <div className="quiz-list-details">
                <h3 className="text-xl font-bold tracking-tight">{quiz.name}</h3>
                <p className="text-muted mt-2 text-sm leading-relaxed">{quiz.description || 'Um novo desafio para seus participantes.'}</p>
                <span className="quiz-question-count tabular-nums">{t.questionCountLabel(quiz.questionCount)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <Link
                  href={`/host/dashboard/quizzes/editor?id=${encodeURIComponent(quiz.id)}`}
                  className="btn-secondary whitespace-nowrap px-4 py-3 text-sm"
                >
                  <Edit3 className="h-4 w-4" /> {t.editQuiz}
                </Link>
                <button className="btn-primary btn-success quiz-list-action whitespace-nowrap" disabled={starting !== null} onClick={() => startGame(quiz.id)}>
                  {starting === quiz.id ? t.openingRoom : t.hostThisQuiz} <ArrowIcon />
                </button>
              </div>
            </article>
          </Delay>)}
        </div>
      </>}
    </section>
  </>
}
