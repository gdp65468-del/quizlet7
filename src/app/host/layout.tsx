import { redirect } from 'next/navigation'
import { hasAdminSession } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export default async function HostLayout({ children }: { children: React.ReactNode }) {
  if (!await hasAdminSession()) redirect('/login')
  return children
}
