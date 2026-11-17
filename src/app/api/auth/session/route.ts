import { NextRequest, NextResponse } from 'next/server'
import { buildCookieOptions } from '@/lib/cookie-utils'
import {
  CREATOR_COOKIE,
  CREATOR_SESSION_SECONDS,
  createCreatorSessionToken,
  getCreatorSession,
  verifyAppwriteJwt,
} from '@/lib/creator-auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getCreatorSession()
  return NextResponse.json(
    {
      authenticated: Boolean(session),
      user: session,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const jwt = typeof body?.jwt === 'string' ? body.jwt.trim() : ''
  if (!jwt) {
    return NextResponse.json(
      { error: 'Token Appwrite obrigatório.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const user = await verifyAppwriteJwt(jwt)
  if (!user) {
    return NextResponse.json(
      { error: 'Sessão Appwrite inválida ou expirada.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const response = NextResponse.json(
    { ok: true, user },
    { headers: { 'Cache-Control': 'no-store' } },
  )
  response.cookies.set(
    CREATOR_COOKIE,
    createCreatorSessionToken(user),
    buildCookieOptions(request, CREATOR_SESSION_SECONDS),
  )
  return response
}

export async function DELETE(request: NextRequest) {
  const response = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  response.cookies.set(CREATOR_COOKIE, '', buildCookieOptions(request, 0))
  return response
}
