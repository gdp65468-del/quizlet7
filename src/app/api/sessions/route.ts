import { NextRequest } from 'next/server'
import { hasAdminSession } from '@/lib/admin-auth'
import { listSessionReports, updateSessionClassLabel } from '@/lib/session-reports'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!await hasAdminSession()) {
    return Response.json({ error: 'Admin sign in required' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }
  return Response.json(await listSessionReports(), { headers: { 'Cache-Control': 'no-store' } })
}

export async function PATCH(request: NextRequest) {
  if (!await hasAdminSession()) {
    return Response.json({ error: 'Admin sign in required' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }
  const body = await request.json().catch(() => null)
  if (!body || typeof body.id !== 'string' || typeof body.classLabel !== 'string') {
    return Response.json({ error: 'Session ID and classLabel are required' }, { status: 400 })
  }
  const updated = await updateSessionClassLabel(body.id, body.classLabel)
  if (!updated) return Response.json({ error: 'Session report not found' }, { status: 404 })
  return Response.json(updated, { headers: { 'Cache-Control': 'no-store' } })
}
