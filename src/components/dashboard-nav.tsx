'use client'

import Link from 'next/link'
import { Cloud, ShieldCheck, User } from 'lucide-react'
import { Brand } from '@/components/ui'
import SignOutButton from '@/components/sign-out-button'
import SettingsButton from '@/components/settings-button'
import { LanguageToggle, useI18n } from '@/lib/i18n'
import { useCloudSync } from '@/lib/cloud-sync'

export default function DashboardNav({
  mode = 'admin',
  creatorEmail,
}: {
  mode?: 'admin' | 'creator'
  creatorEmail?: string
}) {
  const { locale, t } = useI18n()
  const { user } = useCloudSync()

  const isCreator = mode === 'creator'
  const homeHref = isCreator ? '/painel' : '/host/dashboard'
  const editorHref = isCreator ? '/painel/editor' : '/host/dashboard/quizzes/editor'
  const historyHref = isCreator ? '/painel/historico' : '/host/dashboard/history'
  const instructionsHref = isCreator ? '/painel/instrucoes' : '/host/dashboard/instructions'
  const displayEmail = creatorEmail || user?.email || ''

  return (
    <header className="container-wide flex flex-wrap items-center justify-between gap-4 py-6 sm:py-8">
      <Link href={homeHref} aria-label="Painel Arena Bíblica" className="shrink-0">
        <Brand />
      </Link>
      <nav className="glass-soft flex flex-wrap items-center gap-1 p-1.5" aria-label="Dashboard navigation">
        <Link className="btn-ghost whitespace-nowrap px-3.5 py-2 text-sm" href={homeHref}>
          {t.navHome}
        </Link>
        <Link className="btn-ghost whitespace-nowrap px-3.5 py-2 text-sm" href={editorHref}>
          {t.navEditor}
        </Link>
        <Link className="btn-ghost whitespace-nowrap px-3.5 py-2 text-sm" href={historyHref}>
          {t.navHistory}
        </Link>
        <Link className="btn-ghost whitespace-nowrap px-3.5 py-2 text-sm" href={instructionsHref}>
          {t.navInstructions}
        </Link>
        <SettingsButton mode={mode} />

        {isCreator ? (
          <span
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-[13px] border border-emerald-400/45 bg-emerald-500/15 px-3 py-2 text-xs font-extrabold text-[#a8f6df]"
            title={displayEmail || t.cloudConnected}
          >
            {user ? <Cloud className="h-3.5 w-3.5 shrink-0" /> : <User className="h-3.5 w-3.5 shrink-0" />}
            <span className="max-w-40 truncate">{displayEmail || t.cloudConnected}</span>
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-[13px] border border-amber-300/45 bg-amber-400/15 px-3 py-2 text-xs font-extrabold text-amber-100"
          >
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-amber-300" />
            <span>{locale === 'pt' ? 'Admin exclusivo' : 'Principal Admin'}</span>
          </span>
        )}

        <LanguageToggle className="mx-1" />
        <SignOutButton mode={mode} />
      </nav>
    </header>
  )
}
