import type { Metadata } from 'next'
import DashboardNav from '@/components/dashboard-nav'
import SiteFooter from '@/components/site-footer'

export const metadata: Metadata = {
  title: 'Painel do apresentador · Arena Bíblica',
  description: 'Quizzes interativos ao vivo e enquetes em tempo real',
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <div className="app-shell">
    <div className="surface flex min-h-screen flex-col">
      <DashboardNav />
      <main className="container-wide flex-1 pb-20">{children}</main>
      <SiteFooter />
    </div>
  </div>
}
