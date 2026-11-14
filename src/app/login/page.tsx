import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Brand } from '@/components/ui'
import { hasAdminSession, isUsingDefaultAdminPassword } from '@/lib/admin-auth'
import { LanguageToggle } from '@/lib/i18n'
import LoginForm from './login-form'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Admin sign in · Quizlet',
  description: 'Sign in to manage and host quizzes.',
}

export default async function LoginPage() {
  if (await hasAdminSession()) redirect('/host/dashboard')
  const showDefaultHint = isUsingDefaultAdminPassword()

  return <main className="app-shell min-h-screen">
    <div className="surface container-wide flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-4 py-7 sm:py-9">
        <Brand />
        <LanguageToggle />
      </header>
      <div className="flex flex-1 items-center justify-center pb-20 pt-10">
        <section className="glass login-panel w-full max-w-md px-7 py-9 animate-in sm:px-10 sm:py-11" aria-labelledby="login-title">
          <div className="login-icon" aria-hidden="true">◆</div>
          <LoginForm showDefaultHint={showDefaultHint} />
        </section>
      </div>
    </div>
  </main>
}
