import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import DashboardNav from '@/components/dashboard-nav'
import SiteFooter from '@/components/site-footer'
import { hasAdminSession } from '@/lib/admin-auth'
import { getCreatorSession } from '@/lib/creator-auth'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Painel do criador · Arena Bíblica',
  description: 'Crie, gerencie e apresente seus próprios quizzes bíblicos.',
}

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const creator = await getCreatorSession()
  if (!creator) {
    if (await hasAdminSession()) redirect('/host/dashboard')
    redirect('/login')
  }

  return (
    <div className="app-shell">
      <div className="surface flex min-h-screen flex-col">
        <DashboardNav mode="creator" creatorEmail={creator.email || creator.name} />
        <main className="container-wide flex-1 pb-20">{children}</main>
        <SiteFooter />
      </div>
    </div>
  )
}
