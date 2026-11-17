import { redirect } from 'next/navigation'
import { getCreatorSession } from '@/lib/creator-auth'
import { listCreatorQuizzes } from '@/lib/quizzes'
import CreatorDashboardClient from './creator-dashboard-client'

export const dynamic = 'force-dynamic'

export default async function PainelPage() {
  const creator = await getCreatorSession()
  if (!creator) redirect('/login')

  const quizzes = await listCreatorQuizzes(creator.userId).catch(() => [])

  return (
    <CreatorDashboardClient
      initialQuizzes={quizzes}
      creatorName={creator.name}
      creatorEmail={creator.email}
    />
  )
}
