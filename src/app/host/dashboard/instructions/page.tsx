'use client'

import Link from 'next/link'
import { useI18n } from '@/lib/i18n'
import { QuizTemplate } from './quiz-template'

export default function Instructions() {
  const { locale } = useI18n()
  const isPt = locale === 'pt'

  return (
    <div className="mx-auto max-w-4xl pb-12 animate-in">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{isPt ? 'Criar quizzes' : 'Create quizzes'}</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
            {isPt ? 'Adicione seus próprios quizzes' : 'Add your own quizzes'}
          </h1>
          <p className="text-muted mt-3 max-w-2xl leading-relaxed">
            {isPt ? (
              <>
                Use o Editor Visual (arrastar e soltar, importação CSV/JSON, Gerador de Prompt para IA) ou adicione arquivos JSON em{' '}
                <code>data/&lt;categoria&gt;/</code>.
              </>
            ) : (
              <>
                Use the Visual Editor (drag-and-drop, CSV/JSON import, AI Prompt Generator) or drop JSON files into{' '}
                <code>data/&lt;category&gt;/</code>.
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link href="/host/dashboard/quizzes/editor" className="btn-primary btn-success text-sm">
            {isPt ? 'Abrir Editor Visual' : 'Open Visual Editor'}
          </Link>
          <Link href="/host/dashboard/quizzes/editor?tab=ai" className="btn-secondary text-sm">
            {isPt ? 'Gerador de Prompt IA' : 'AI Prompt Generator'}
          </Link>
        </div>
      </header>
      <ol className="mb-8 grid gap-4 sm:grid-cols-3">
        <li className="glass-soft p-5">
          <span className="eyebrow">{isPt ? '01 · Editor Visual' : '01 · Visual Editor'}</span>
          <p className="mt-3 font-semibold">
            {isPt
              ? 'Crie perguntas, reordene arrastando e soltando ou importe de CSV/JSON.'
              : 'Create questions, reorder with drag-and-drop, or import CSV/JSON.'}
          </p>
        </li>
        <li className="glass-soft p-5">
          <span className="eyebrow">{isPt ? '02 · Novos Formatos' : '02 · New Formats'}</span>
          <p className="mt-3 font-semibold">
            {isPt ? (
              <>
                Suporta <code>multiple_choice</code>, <code>true_false</code>, <code>multi_select</code>, imagens, blocos de código e bônus{' '}
                <code>2x</code>.
              </>
            ) : (
              <>
                Supports <code>multiple_choice</code>, <code>true_false</code>, <code>multi_select</code>, images, code blocks, and{' '}
                <code>2x</code> bonus points.
              </>
            )}
          </p>
        </li>
        <li className="glass-soft p-5">
          <span className="eyebrow">{isPt ? '03 · Prompt para IA' : '03 · AI Prompt'}</span>
          <p className="mt-3 font-semibold">
            {isPt
              ? 'Gere um prompt pronto para qualquer IA, cole o JSON gerado de volta e apresente ao vivo.'
              : 'Generate a tailored prompt for any AI, paste the JSON back, and launch live.'}
          </p>
        </li>
      </ol>
      <QuizTemplate />
      <p className="text-muted mt-5 text-sm">
        {isPt ? (
          <>
            Cada pergunta precisa de 2 a 6 alternativas (2 para <code>true_false</code>). Campos opcionais: <code>type</code>,{' '}
            <code>pointsMultiplier: 2</code>, <code>imageUrl</code>, <code>codeSnippet</code>, <code>codeLanguage</code>.
          </>
        ) : (
          <>
            Each question needs 2–6 choices (2 for <code>true_false</code>). Optional fields: <code>type</code>,{' '}
            <code>pointsMultiplier: 2</code>, <code>imageUrl</code>, <code>codeSnippet</code>, <code>codeLanguage</code>.
          </>
        )}
      </p>
      <section className="glass-soft mt-8 p-5 sm:p-6" aria-labelledby="session-limits-title">
        <h2 id="session-limits-title" className="text-lg font-bold">
          {isPt ? 'Tempo limite da sala' : 'Room time limit'}
        </h2>
        <p className="text-muted mt-2 leading-relaxed">
          {isPt
            ? 'Quizzes e enquetes são encerrados automaticamente após uma hora da criação. Os relatórios das partidas concluídas são salvos em Histórico & Relatórios (e sincronizados no Appwrite Cloud quando conectado).'
            : 'Quizzes and polls close automatically one hour after they are created. Completed quiz reports are saved to History & Reports (and synced to Appwrite Cloud when connected).'}
        </p>
      </section>
    </div>
  )
}
