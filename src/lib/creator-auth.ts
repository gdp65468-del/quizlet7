import 'server-only'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import { APPWRITE_CONFIG } from '@/lib/appwrite'

export const CREATOR_COOKIE = 'ab_creator_session'
export const CREATOR_SESSION_SECONDS = 7 * 24 * 60 * 60

export type CreatorSession = {
  userId: string
  email: string
  name: string
}

type CreatorTokenPayload = CreatorSession & {
  exp: number
  nonce: string
}

function sessionSecret(): string {
  return (
    process.env.CREATOR_SESSION_SECRET ||
    process.env.APPWRITE_API_KEY ||
    process.env.QUIZ_ADMIN_PASSWORD ||
    'arena-biblica-creator-session-secret-v1'
  ).trim()
}

function signPayload(encodedPayload: string): string {
  return createHmac('sha256', sessionSecret())
    .update(`ab-creator-session-v1:${encodedPayload}`)
    .digest('base64url')
}

export function createCreatorSessionToken(user: CreatorSession): string {
  const payload: CreatorTokenPayload = {
    userId: user.userId,
    email: user.email,
    name: user.name,
    exp: Math.floor(Date.now() / 1000) + CREATOR_SESSION_SECONDS,
    nonce: randomBytes(12).toString('base64url'),
  }
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  return `${encoded}.${signPayload(encoded)}`
}

export function parseCreatorSessionToken(value: string | undefined): CreatorSession | null {
  if (!value) return null
  const parts = value.split('.')
  if (parts.length !== 2) return null
  const [encoded, sig] = parts
  if (!encoded || !sig) return null

  const actualSig = Buffer.from(sig, 'base64url')
  const expectedSig = Buffer.from(signPayload(encoded), 'base64url')
  if (actualSig.length !== expectedSig.length || !timingSafeEqual(actualSig, expectedSig)) {
    return null
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<CreatorTokenPayload>
    if (
      typeof parsed.userId !== 'string' ||
      !parsed.userId.trim() ||
      typeof parsed.exp !== 'number' ||
      parsed.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null
    }
    return {
      userId: parsed.userId.trim(),
      email: typeof parsed.email === 'string' ? parsed.email : '',
      name: typeof parsed.name === 'string' ? parsed.name : '',
    }
  } catch {
    return null
  }
}

export async function getCreatorSession(): Promise<CreatorSession | null> {
  const cookieValue = (await cookies()).get(CREATOR_COOKIE)?.value
  return parseCreatorSessionToken(cookieValue)
}

export async function verifyAppwriteJwt(jwt: string): Promise<CreatorSession | null> {
  const cleanJwt = jwt.trim()
  if (!cleanJwt || !APPWRITE_CONFIG.projectId) return null

  const base = APPWRITE_CONFIG.endpoint.replace(/\/+$/, '')
  try {
    const response = await fetch(`${base}/account`, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'X-Appwrite-Project': APPWRITE_CONFIG.projectId,
        'X-Appwrite-JWT': cleanJwt,
        Accept: 'application/json',
      },
    })
    if (!response.ok) return null
    const account = (await response.json()) as { $id?: string; email?: string; name?: string; status?: boolean }
    if (!account || typeof account.$id !== 'string' || !account.$id.trim()) return null
    if (account.status === false) return null
    return {
      userId: account.$id.trim(),
      email: typeof account.email === 'string' ? account.email : '',
      name: typeof account.name === 'string' && account.name.trim() ? account.name.trim() : account.email || 'Criador',
    }
  } catch {
    return null
  }
}

export async function getCreatorFromRequest(
  request: Request | NextRequest,
): Promise<{ session: CreatorSession; jwt?: string } | null> {
  const jwt = request.headers.get('x-appwrite-jwt')?.trim() || undefined
  const cookieSession = await getCreatorSession()
  if (cookieSession) {
    return { session: cookieSession, jwt }
  }
  if (jwt) {
    const verified = await verifyAppwriteJwt(jwt)
    if (verified) {
      return { session: verified, jwt }
    }
  }
  return null
}
