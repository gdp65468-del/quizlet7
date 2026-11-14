import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, ADMIN_SESSION_SECONDS, checkAdminPassword, createAdminSession, hasAdminSession, isAdminConfigured } from '@/lib/admin-auth'
import { buildCookieOptions } from '@/lib/cookie-utils'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ authenticated: await hasAdminSession() }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: 'Set QUIZ_ADMIN_PASSWORD in .env.local before signing in.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
  const body = await request.json().catch(() => null)
  if (!checkAdminPassword(body?.password)) {
    return NextResponse.json({ error: 'Incorrect password.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }
  const response = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  response.cookies.set(ADMIN_COOKIE, createAdminSession(), buildCookieOptions(request, ADMIN_SESSION_SECONDS))
  return response
}

export async function DELETE(request: NextRequest) {
  const response = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  response.cookies.set(ADMIN_COOKIE, '', buildCookieOptions(request, 0))
  return response
}
