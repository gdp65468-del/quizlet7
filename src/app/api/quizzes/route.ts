import { NextRequest } from 'next/server'
import { deleteQuizFile, getQuizById, listQuizzes, saveQuizFile } from '@/lib/quizzes'
import { hasAdminSession } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  if (!await hasAdminSession()) {
    return Response.json({ error: 'Admin sign in required' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }
  const id = request.nextUrl.searchParams.get('id')
  if (id) {
    const quiz = await getQuizById(id)
    if (!quiz) return Response.json({ error: 'Quiz not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
    return Response.json(quiz, { headers: { 'Cache-Control': 'no-store' } })
  }
  return Response.json(await listQuizzes(), { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  if (!await hasAdminSession()) {
    return Response.json({ error: 'Admin sign in required' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }
  const body = await request.json().catch(() => null)
  if (!body || typeof body.name !== 'string' || typeof body.category !== 'string' || !Array.isArray(body.questions)) {
    return Response.json({ error: 'Category, name, and questions are required' }, { status: 400 })
  }
  try {
    const saved = await saveQuizFile({
      category: body.category,
      slug: typeof body.slug === 'string' ? body.slug : undefined,
      name: body.name,
      description: typeof body.description === 'string' ? body.description : '',
      questions: body.questions,
    })
    return Response.json(saved, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not save quiz' }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest) {
  if (!await hasAdminSession()) {
    return Response.json({ error: 'Admin sign in required' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return Response.json({ error: 'Quiz ID is required' }, { status: 400 })
  const deleted = await deleteQuizFile(id)
  if (!deleted) return Response.json({ error: 'Quiz not found' }, { status: 404 })
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
