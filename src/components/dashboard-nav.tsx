'use client'

import Link from 'next/link'
import { Cloud, CloudOff } from 'lucide-react'
import { Brand } from '@/components/ui'
import SignOutButton from '@/components/sign-out-button'
import SettingsButton from '@/components/settings-button'
import { LanguageToggle, useI18n } from '@/lib/i18n'
import { useCloudSync } from '@/lib/cloud-sync'

export default function DashboardNav() {
  const { t } = useI18n()
  const { user, openCloudAuth } = useCloudSync()

  return (
    <header className="container-wide flex flex-wrap items-center justify-between gap-4 py-6 sm:py-8">
      <Link href="/host/dashboard" aria-label="Quizlet dashboard" className="shrink-0">
        <Brand />
      </Link>
      <nav className="glass-soft flex flex-wrap items-center gap-1 p-1.5" aria-label="Dashboard navigation">
        <Link className="btn-ghost whitespace-nowrap px-3.5 py-2 text-sm" href="/host/dashboard">
          {t.navHome}
        </Link>
        <Link className="btn-ghost whitespace-nowrap px-3.5 py-2 text-sm" href="/host/dashboard/quizzes/editor">
          {t.navEditor}
        </Link>
        <Link className="btn-ghost whitespace-nowrap px-3.5 py-2 text-sm" href="/host/dashboard/history">
          {t.navHistory}
        </Link>
        <Link className="btn-ghost whitespace-nowrap px-3.5 py-2 text-sm" href="/host/dashboard/instructions">
          {t.navInstructions}
        </Link>
        <SettingsButton />
        {user ? (
          <button
            type="button"
            onClick={openCloudAuth}
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-[13px] border border-emerald-400/55 bg-emerald-500/15 px-3.5 py-2 text-xs font-extrabold text-[#a8f6df] transition hover:border-emerald-300 hover:bg-emerald-500/25"
            title={user.email || t.cloudConnected}
          >
            <Cloud className="h-4 w-4 shrink-0" />
            <span>{t.cloudConnected}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={openCloudAuth}
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-[13px] border border-[#f02e65]/60 bg-[#f02e65]/20 px-3.5 py-2 text-xs font-extrabold text-[#ffd3e0] transition hover:border-[#ff5b89] hover:bg-[#f02e65]/30"
          >
            <CloudOff className="h-4 w-4 shrink-0" />
            <span>{t.connectCloud}</span>
          </button>
        )}
        <LanguageToggle className="mx-1" />
        <SignOutButton />
      </nav>
    </header>
  )
}
