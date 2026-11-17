'use client'

import { useI18n } from '@/lib/i18n'

export default function SiteFooter() {
  const { locale } = useI18n()
  const isPt = locale === 'pt'

  return (
    <footer className="mt-auto border-t border-white/10 py-5 text-xs text-slate-300/80">
      <div className="container-wide flex flex-col items-center justify-between gap-2 text-center sm:flex-row sm:text-left">
        <p>
          © 2026 <strong className="font-semibold text-slate-100">Arena Bíblica</strong> · Alan Soares Silva
        </p>
        <p className="text-slate-400">
          {isPt
            ? 'Quizzes interativos ao vivo e enquetes em tempo real'
            : 'Live interactive Bible quizzes and real-time polls'}
        </p>
      </div>
    </footer>
  )
}
