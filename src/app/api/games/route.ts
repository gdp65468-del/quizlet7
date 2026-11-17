import { createGame } from '@/lib/game-store'
import { DEMO_QUIZ, DEMO_QUIZ_ID } from '@/lib/demo-quiz'
import { getCreatorQuizById, getQuizById } from '@/lib/quizzes'
import { joinOrigin } from '@/lib/network'
import { hasAdminSession } from '@/lib/admin-auth'
import { getCreatorFromRequest } from '@/lib/creator-auth'
import { getCreatorQuizSettings, getQuizSettings } from '@/lib/quiz-settings'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (typeof body?.quizId !== 'string') return Response.json({ error: 'Quiz ID is required' }, { status: 400 })

  const explicitScope = typeof body?.scope === 'string' ? body.scope : null
  const [isAdmin, creator] = await Promise.all([hasAdminSession(), getCreatorFromRequest(request)])

  let useAdmin = false
  if (explicitScope === 'admin') {
    if (!isAdmin) return Response.json({ error: 'Admin sign in required' }, { status: 401 })
    useAdmin = true
  } else if (explicitScope === 'creator') {
    if (!creator) return Response.json({ error: 'Autenticação necessária' }, { status: 401 })
    useAdmin = false
  } else if (creator && !isAdmin) {
    useAdmin = false
  } else if (isAdmin) {
    useAdmin = true
  } else {
    return Response.json({ error: 'Autenticação necessária' }, { status: 401 })
  }

  const classLabel = typeof body.classLabel === 'string' ? body.classLabel : ''
  const isDemoQuiz = body.quizId === DEMO_QUIZ_ID

  try {
    if (useAdmin) {
      const quiz = isDemoQuiz ? DEMO_QUIZ : await getQuizById(body.quizId)
      if (!quiz) return Response.json({ error: 'Quiz not found' }, { status: 404 })
      const settings = await getQuizSettings()
      return Response.json(await createGame(quiz, joinOrigin(request), settings, classLabel, 'server'), {
        status: 201,
      })
    }

    const userId = creator!.session.userId
    const quiz = isDemoQuiz ? DEMO_QUIZ : await getCreatorQuizById(userId, body.quizId, creator!.jwt)
    if (!quiz) {
      return Response.json({ error: 'Quiz não encontrado na sua conta' }, { status: 404 })
    }
    const settings = await getCreatorQuizSettings(userId)
    return Response.json(await createGame(quiz, joinOrigin(request), settings, classLabel, userId), {
      status: 201,
    })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not create game or read quiz settings' },
      { status: 500 },
    )
  }
}
