import { NextRequest } from 'next/server'
import { hasAdminSession } from '@/lib/admin-auth'
import { getCreatorFromRequest } from '@/lib/creator-auth'
import {
  deleteCreatorQuiz,
  deleteQuizFile,
  getCreatorQuizById,
  getQuizById,
  listCreatorQuizzes,
  listQuizzes,
  QuizQuotaError,
  QuizValidationError,
  saveCreatorQuiz,
  saveQuizFile,
} from '@/lib/quizzes'

export const dynamic = 'force-dynamic'

async function resolveActor(request: NextRequest, explicitScope?: string | null) {
  const [isAdmin, creator] = await Promise.all([hasAdminSession(), getCreatorFromRequest(request)])
  if (explicitScope === 'admin') {
    if (!isAdmin) return { kind: 'unauthorized' as const }
    return { kind: 'admin' as const }
  }
  if (explicitScope === 'creator') {
    if (!creator) return { kind: 'unauthorized' as const }
    return { kind: 'creator' as const, userId: creator.session.userId, jwt: creator.jwt }
  }
  if (creator && !isAdmin) {
    return { kind: 'creator' as const, userId: creator.session.userId, jwt: creator.jwt }
  }
  if (isAdmin) {
    return { kind: 'admin' as const }
  }
  return { kind: 'unauthorized' as const }
}

export async function GET(request: NextRequest) {
  const scope = request.nextUrl.searchParams.get('scope')
  const actor = await resolveActor(request, scope)
  if (actor.kind === 'unauthorized') {
    return Response.json({ error: 'Autenticação necessária' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }

  const id = request.nextUrl.searchParams.get('id')
  if (actor.kind === 'creator') {
    if (id) {
      const quiz = await getCreatorQuizById(actor.userId, id, actor.jwt)
      if (!quiz) return Response.json({ error: 'Quiz não encontrado' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
      return Response.json(quiz, { headers: { 'Cache-Control': 'no-store' } })
    }
    return Response.json(await listCreatorQuizzes(actor.userId, actor.jwt), {
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  if (id) {
    const quiz = await getQuizById(id)
    if (!quiz) return Response.json({ error: 'Quiz não encontrado' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
    return Response.json(quiz, { headers: { 'Cache-Control': 'no-store' } })
  }
  return Response.json(await listQuizzes(), { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const scope =
    typeof body?.scope === 'string' ? body.scope : request.nextUrl.searchParams.get('scope')
  const actor = await resolveActor(request, scope)
  if (actor.kind === 'unauthorized') {
    return Response.json({ error: 'Autenticação necessária' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }

  if (!body || typeof body.name !== 'string' || typeof body.category !== 'string' || !Array.isArray(body.questions)) {
    return Response.json({ error: 'Categoria, título e perguntas são obrigatórios' }, { status: 400 })
  }

  try {
    if (actor.kind === 'creator') {
      const saved = await saveCreatorQuiz({
        userId: actor.userId,
        jwt: actor.jwt,
        previousId: typeof body.previousId === 'string' ? body.previousId : undefined,
        category: body.category,
        slug: typeof body.slug === 'string' ? body.slug : undefined,
        name: body.name,
        description: typeof body.description === 'string' ? body.description : '',
        questions: body.questions,
      })
      return Response.json(saved, { status: 201, headers: { 'Cache-Control': 'no-store' } })
    }

    const saved = await saveQuizFile({
      category: body.category,
      slug: typeof body.slug === 'string' ? body.slug : undefined,
      name: body.name,
      description: typeof body.description === 'string' ? body.description : '',
      questions: body.questions,
    })
    return Response.json(saved, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof QuizQuotaError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.status, headers: { 'Cache-Control': 'no-store' } },
      )
    }
    if (error instanceof QuizValidationError) {
      return Response.json(
        { error: error.message },
        { status: error.status, headers: { 'Cache-Control': 'no-store' } },
      )
    }
    return Response.json(
      { error: error instanceof Error ? error.message : 'Não foi possível salvar o quiz' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export async function DELETE(request: NextRequest) {
  const scope = request.nextUrl.searchParams.get('scope')
  const actor = await resolveActor(request, scope)
  if (actor.kind === 'unauthorized') {
    return Response.json({ error: 'Autenticação necessária' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }

  const id = request.nextUrl.searchParams.get('id')
  if (!id) return Response.json({ error: 'Quiz ID is required' }, { status: 400 })

  const deleted =
    actor.kind === 'creator'
      ? await deleteCreatorQuiz(actor.userId, id, actor.jwt)
      : await deleteQuizFile(id)
  if (!deleted) return Response.json({ error: 'Quiz não encontrado' }, { status: 404 })
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
