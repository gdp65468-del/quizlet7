import { redirect } from 'next/navigation'
import { hasAdminSession } from '@/lib/admin-auth'
import { getCreatorSession } from '@/lib/creator-auth'

export const dynamic = 'force-dynamic'

export default async function HostLayout({ children }: { children: React.ReactNode }) {
  const isAdmin = await hasAdminSession()
  const creator = isAdmin ? null : await getCreatorSession()
  if (!isAdmin && !creator) redirect('/login')
  return children
}
