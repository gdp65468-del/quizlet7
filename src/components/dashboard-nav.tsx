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
            className="btn-ghost whitespace-nowrap px-3 py-2 text-xs font-bold text-[#a8f6df]"
            title={user.email || t.cloudConnected}
          >
            <Cloud className="h-4 w-4" />
            <span className="hidden sm:inline">{t.cloudConnected}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={openCloudAuth}
            className="btn-ghost whitespace-nowrap px-3 py-2 text-xs font-bold text-[#a5ecf6]"
          >
            <CloudOff className="h-4 w-4" />
            <span className="hidden sm:inline">{t.connectCloud}</span>
          </button>
        )}
        <LanguageToggle className="mx-1" />
        <SignOutButton />
      </nav>
    </header>
  )
}
