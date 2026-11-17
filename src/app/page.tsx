import { redirect } from 'next/navigation'
import { hasAdminSession } from '@/lib/admin-auth'
import { getCreatorSession } from '@/lib/creator-auth'

export const dynamic = 'force-dynamic'

export default async function Home() {
  if (await hasAdminSession()) redirect('/host/dashboard')
  if (await getCreatorSession()) redirect('/painel')
  redirect('/login')
}
