import type { NextRequest } from 'next/server'

export function isHttpsRequest(request: NextRequest): boolean {
  const host = (request.headers.get('host') ?? request.nextUrl.host ?? '').toLowerCase()
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase()
  const forwardedSsl = request.headers.get('x-forwarded-ssl')?.trim().toLowerCase()
  const origin = request.headers.get('origin') ?? ''
  const referer = request.headers.get('referer') ?? ''

  const isLocalDirect =
    (host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('[::1]')) &&
    request.nextUrl.protocol !== 'https:' &&
    !forwardedProto &&
    forwardedSsl !== 'on' &&
    !origin.startsWith('https://') &&
    !referer.startsWith('https://')

  if (isLocalDirect) return false

  return (
    request.nextUrl.protocol === 'https:' ||
    forwardedProto === 'https' ||
    forwardedSsl === 'on' ||
    origin.startsWith('https://') ||
    referer.startsWith('https://') ||
    (process.env.APP_URL?.startsWith('https://') ?? false)
  )
}

export function buildCookieOptions(request: NextRequest, maxAge: number) {
  const isHttps = isHttpsRequest(request)
  return {
    httpOnly: true,
    sameSite: (isHttps ? 'none' : 'lax') as 'none' | 'lax',
    secure: isHttps,
    ...(isHttps ? { partitioned: true } : {}),
    path: '/',
    maxAge,
  }
}
