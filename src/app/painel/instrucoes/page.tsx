'use client'

import Link from 'next/link'
import { QuizTemplate } from '@/app/host/dashboard/instructions/quiz-template'
import { useI18n } from '@/lib/i18n'
import {
  INACTIVITY_POLICY_TEXT_EN,
  INACTIVITY_POLICY_TEXT_PT,
  MAX_QUESTIONS_PER_QUIZ,
  MAX_QUIZZES_PER_USER,
} from '@/lib/quiz-limits'

export default function CreatorInstructionsPage() {
  const { locale } = useI18n()
  const isPt = locale === 'pt'

  return (
    <div className="mx-auto max-w-4xl pb-12 animate-in">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{isPt ? 'Guia do criador' : 'Creator guide'}</p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
            {isPt ? 'Como criar seus quizzes bíblicos' : 'How to create your Bible quizzes'}
          </h1>
          <p className="text-muted mt-3 max-w-2xl leading-relaxed">
            {isPt
              ? `Sua conta tem um espaço isolado no Appwrite para armazenar até ${MAX_QUIZZES_PER_USER} quizzes, com no máximo ${MAX_QUESTIONS_PER_QUIZ} perguntas por quiz.`
              : `Your account has an isolated Appwrite workspace for up to ${MAX_QUIZZES_PER_USER} quizzes, with at most ${MAX_QUESTIONS_PER_QUIZ} questions per quiz.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link href="/painel/editor" className="btn-primary btn-success text-sm">
            {isPt ? 'Abrir Editor Visual' : 'Open Visual Editor'}
          </Link>
          <Link href="/painel/editor?tab=ai" className="btn-secondary text-sm">
            {isPt ? 'Gerador de Prompt IA' : 'AI Prompt Generator'}
          </Link>
        </div>
      </header>

      <ol className="mb-8 grid gap-4 sm:grid-cols-3">
        <li className="glass-soft p-5">
          <span className="eyebrow">{isPt ? '01 · Limite de quizzes' : '01 · Quiz quota'}</span>
          <p className="mt-3 font-semibold">
            {isPt
              ? `Você pode manter até ${MAX_QUIZZES_PER_USER} quizzes salvos. Ao atingir o limite, edite ou exclua um existente para criar outro.`
              : `You can keep up to ${MAX_QUIZZES_PER_USER} saved quizzes. Edit or delete an existing quiz when the limit is reached.`}
          </p>
        </li>
        <li className="glass-soft p-5">
          <span className="eyebrow">{isPt ? '02 · Até 25 perguntas' : '02 · Up to 25 questions'}</span>
          <p className="mt-3 font-semibold">
            {isPt ? (
              <>
                Cada quiz aceita até <strong>{MAX_QUESTIONS_PER_QUIZ} perguntas</strong> nos formatos{' '}
                <code>multiple_choice</code>, <code>true_false</code> e <code>multi_select</code>.
              </>
            ) : (
              <>
                Each quiz supports up to <strong>{MAX_QUESTIONS_PER_QUIZ} questions</strong> across{' '}
                <code>multiple_choice</code>, <code>true_false</code>, and <code>multi_select</code>.
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

      <section className="glass-soft mt-8 space-y-3 p-5 sm:p-6" aria-labelledby="creator-policy-title">
        <h2 id="creator-policy-title" className="text-lg font-bold">
          {isPt ? 'Regras da conta e política de inatividade' : 'Account rules & inactivity policy'}
        </h2>
        <p className="text-muted text-sm leading-relaxed">
          {isPt
            ? 'Salas ao vivo são encerradas automaticamente após 1 hora. Os relatórios das partidas podem ser consultados na aba Histórico.'
            : 'Live rooms automatically close after 1 hour. Completed match reports can be viewed in History.'}
        </p>
        <p className="rounded-xl border border-amber-300/30 bg-amber-400/10 p-3 text-xs leading-relaxed text-amber-100">
          {isPt ? INACTIVITY_POLICY_TEXT_PT : INACTIVITY_POLICY_TEXT_EN}
        </p>
      </section>
    </div>
  )
}
