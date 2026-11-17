import { BookOpen } from 'lucide-react'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import SiteFooter from '@/components/site-footer'
import { Brand } from '@/components/ui'
import { hasAdminSession } from '@/lib/admin-auth'
import { getCreatorSession } from '@/lib/creator-auth'
import { LanguageToggle } from '@/lib/i18n'
import LoginForm from './login-form'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Entrar ou criar conta · Arena Bíblica',
  description: 'Acesse sua conta via Appwrite Auth para criar e apresentar seus quizzes bíblicos.',
}

export default async function LoginPage() {
  if (await hasAdminSession()) redirect('/host/dashboard')
  if (await getCreatorSession()) redirect('/painel')

  return (
    <main className="app-shell min-h-screen">
      <div className="surface container-wide flex min-h-screen flex-col">
        <header className="flex items-center justify-between gap-4 py-7 sm:py-9">
          <Brand />
          <LanguageToggle />
        </header>
        <div className="flex flex-1 items-center justify-center pb-20 pt-6">
          <section className="glass login-panel w-full max-w-md px-7 py-9 animate-in sm:px-10 sm:py-11" aria-labelledby="login-title">
            <div className="login-icon" aria-hidden="true">
              <BookOpen className="h-6 w-6" strokeWidth={2.25} />
            </div>
            <LoginForm />
          </section>
        </div>
        <SiteFooter />
      </div>
    </main>
  )
}
