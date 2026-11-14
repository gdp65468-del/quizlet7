import type { Metadata } from 'next'
import DashboardNav from '@/components/dashboard-nav'

export const metadata: Metadata = {
  title: 'Host dashboard · Quizlet',
  description: 'Choose a quiz and bring everyone together.',
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <div className="app-shell">
    <div className="surface">
      <DashboardNav />
      <main className="container-wide pb-24">{children}</main>
    </div>
  </div>
}
