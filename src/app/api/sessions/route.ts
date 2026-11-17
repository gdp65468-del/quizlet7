import { NextRequest } from 'next/server'
import { hasAdminSession } from '@/lib/admin-auth'
import { getCreatorFromRequest } from '@/lib/creator-auth'
import { listSessionReports, updateSessionClassLabel } from '@/lib/session-reports'

export const dynamic = 'force-dynamic'

async function resolveOwnerId(request: NextRequest, explicitScope?: string | null): Promise<string | null> {
  const [isAdmin, creator] = await Promise.all([hasAdminSession(), getCreatorFromRequest(request)])
  if (explicitScope === 'admin') {
    return isAdmin ? 'server' : null
  }
  if (explicitScope === 'creator') {
    return creator ? creator.session.userId : null
  }
  if (creator && !isAdmin) return creator.session.userId
  if (isAdmin) return 'server'
  return null
}

export async function GET(request: NextRequest) {
  const ownerId = await resolveOwnerId(request, request.nextUrl.searchParams.get('scope'))
  if (!ownerId) {
    return Response.json({ error: 'Autenticação necessária' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }
  return Response.json(await listSessionReports(ownerId), { headers: { 'Cache-Control': 'no-store' } })
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const scope = typeof body?.scope === 'string' ? body.scope : request.nextUrl.searchParams.get('scope')
  const ownerId = await resolveOwnerId(request, scope)
  if (!ownerId) {
    return Response.json({ error: 'Autenticação necessária' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }
  if (!body || typeof body.id !== 'string' || typeof body.classLabel !== 'string') {
    return Response.json({ error: 'Session ID and classLabel are required' }, { status: 400 })
  }
  const updated = await updateSessionClassLabel(body.id, body.classLabel, ownerId)
  if (!updated) return Response.json({ error: 'Session report not found' }, { status: 404 })
  return Response.json(updated, { headers: { 'Cache-Control': 'no-store' } })
}
