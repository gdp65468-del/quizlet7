import { NextRequest } from 'next/server'
import { getCreatorFromRequest } from '@/lib/creator-auth'
import { getCreatorQuizSettings, saveCreatorQuizSettings } from '@/lib/quiz-settings'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const creator = await getCreatorFromRequest(request)
  if (!creator) {
    return Response.json({ error: 'Autenticação necessária' }, { status: 401 })
  }
  try {
    return Response.json(await getCreatorQuizSettings(creator.session.userId), {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch {
    return Response.json({ error: 'Não foi possível carregar suas configurações' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const creator = await getCreatorFromRequest(request)
  if (!creator) {
    return Response.json({ error: 'Autenticação necessária' }, { status: 401 })
  }
  const body = await request.json().catch(() => null)
  try {
    return Response.json(await saveCreatorQuizSettings(creator.session.userId, body), {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    if (
      error instanceof Error &&
      /^(Invalid quiz settings|Choice reveal delay|Answer time|Choose a valid leaderboard|Choose whether to show|Choose whether to save)/.test(
        error.message,
      )
    ) {
      return Response.json({ error: error.message }, { status: 400 })
    }
    return Response.json({ error: 'Não foi possível salvar suas configurações' }, { status: 500 })
  }
}
