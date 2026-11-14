import { listQuizCategories, listQuizzes } from '@/lib/quizzes'
import DashboardClient from './dashboard-client'

export const dynamic = 'force-dynamic'

export default async function Dashboard() {
  const [quizzes, categories] = await Promise.all([listQuizzes(), listQuizCategories()])
  return <DashboardClient quizzes={quizzes} categories={categories} />
}
