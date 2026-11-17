import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import DashboardNav from '@/components/dashboard-nav'
import SiteFooter from '@/components/site-footer'
import { hasAdminSession } from '@/lib/admin-auth'
import { getCreatorSession } from '@/lib/creator-auth'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Painel administrativo · Arena Bíblica',
  description: 'Quizzes interativos ao vivo e enquetes em tempo real',
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  if (!(await hasAdminSession())) {
    if (await getCreatorSession()) redirect('/painel')
    redirect('/login')
  }

  return (
    <div className="app-shell">
      <div className="surface flex min-h-screen flex-col">
        <DashboardNav mode="admin" />
        <main className="container-wide flex-1 pb-20">{children}</main>
        <SiteFooter />
      </div>
    </div>
  )
}
