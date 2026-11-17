'use client'

import { useEffect, useState } from 'react'
import { FileText, ShieldAlert, X } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import {
  INACTIVITY_POLICY_TEXT_EN,
  INACTIVITY_POLICY_TEXT_PT,
  MAX_QUESTIONS_PER_QUIZ,
  MAX_QUIZZES_PER_USER,
} from '@/lib/quiz-limits'

export default function SiteFooter() {
  const { locale } = useI18n()
  const isPt = locale === 'pt'
  const [termsOpen, setTermsOpen] = useState(false)

  useEffect(() => {
    if (!termsOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTermsOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [termsOpen])

  return (
    <>
      <footer className="mt-auto border-t border-white/10 py-5 text-xs text-slate-300/80">
        <div className="container-wide space-y-3">
          <div className="flex flex-col items-center justify-between gap-2 text-center sm:flex-row sm:text-left">
            <p>
              © 2026 <strong className="font-semibold text-slate-100">Arena Bíblica</strong> · Alan Soares Silva
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <span className="text-slate-400">
                {isPt
                  ? 'Quizzes interativos ao vivo e enquetes em tempo real'
                  : 'Live interactive Bible quizzes and real-time polls'}
              </span>
              <button
                type="button"
                onClick={() => setTermsOpen(true)}
                className="inline-flex items-center gap-1.5 font-semibold text-[#f5cf70] underline decoration-[#f5cf70]/50 underline-offset-4 transition hover:text-white"
              >
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                {isPt ? 'Termos de Uso e Política de Inatividade' : 'Terms of Use & Inactivity Policy'}
              </button>
            </div>
          </div>

          <p className="rounded-xl border border-amber-300/20 bg-amber-400/5 px-3.5 py-2 text-center text-[11px] leading-relaxed text-amber-100/90 sm:text-left">
            <ShieldAlert className="mr-1.5 inline h-3.5 w-3.5 align-text-bottom text-amber-300" aria-hidden="true" />
            {isPt ? INACTIVITY_POLICY_TEXT_PT : INACTIVITY_POLICY_TEXT_EN}
          </p>
        </div>
      </footer>

      {termsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={() => setTermsOpen(false)}
        >
          <section
            className="glass w-full max-w-xl border border-white/25 bg-[#10203a] p-6 sm:p-7 animate-in max-h-[90vh] overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="terms-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="eyebrow">Arena Bíblica</p>
                <h2 id="terms-modal-title" className="mt-1 text-2xl font-extrabold text-white">
                  {isPt ? 'Termos de Uso & Política de Dados' : 'Terms of Use & Data Policy'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setTermsOpen(false)}
                className="settings-close"
                aria-label={isPt ? 'Fechar' : 'Close'}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-5 space-y-4 text-sm leading-relaxed text-[#d7e2f2]">
              <div className="rounded-2xl border border-amber-300/35 bg-amber-400/10 p-4 text-amber-100">
                <p className="font-bold text-amber-200">
                  {isPt ? 'Política de Inatividade (1 ano)' : 'Inactivity Policy (1 year)'}
                </p>
                <p className="mt-1.5 text-xs leading-relaxed">
                  {isPt ? INACTIVITY_POLICY_TEXT_PT : INACTIVITY_POLICY_TEXT_EN}
                </p>
              </div>

              <div className="glass-soft space-y-2 p-4 text-xs leading-relaxed">
                <p className="font-bold text-white">
                  {isPt ? 'Isolamento e limites da conta de criador' : 'Creator account isolation & quotas'}
                </p>
                <ul className="list-disc space-y-1.5 pl-4">
                  <li>
                    {isPt
                      ? 'Cada conta possui painel isolado: seus quizzes, salas e histórico pertencem exclusivamente ao seu usuário autenticado via Appwrite Auth (e-mail e senha).'
                      : 'Each account has an isolated dashboard: your quizzes, rooms, and history belong exclusively to your Appwrite Auth email/password account.'}
                  </li>
                  <li>
                    {isPt
                      ? `Limite de armazenamento por criador: até ${MAX_QUIZZES_PER_USER} quizzes salvos simultaneamente.`
                      : `Per-creator quota: up to ${MAX_QUIZZES_PER_USER} saved quizzes at a time.`}
                  </li>
                  <li>
                    {isPt
                      ? `Limite por quiz: até ${MAX_QUESTIONS_PER_QUIZ} perguntas por quiz e tamanho seguro de documento no banco de dados.`
                      : `Per-quiz limit: up to ${MAX_QUESTIONS_PER_QUIZ} questions per quiz within safe database payload size limits.`}
                  </li>
                </ul>
              </div>

              <p className="text-muted text-xs">
                {isPt
                  ? '© 2026 Arena Bíblica · Alan Soares Silva. Licenciado nos termos do arquivo LICENSE do projeto.'
                  : '© 2026 Arena Bíblica · Alan Soares Silva. Licensed under the project LICENSE.'}
              </p>
            </div>

            <div className="mt-6 flex justify-end">
              <button type="button" onClick={() => setTermsOpen(false)} className="btn-primary px-5 py-2.5 text-sm">
                {isPt ? 'Fechar' : 'Close'}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  )
}
