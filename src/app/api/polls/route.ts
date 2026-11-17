import { hasAdminSession } from '@/lib/admin-auth'
import { getCreatorFromRequest } from '@/lib/creator-auth'
import { joinOrigin } from '@/lib/network'
import { createPoll } from '@/lib/poll-store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const [isAdmin, creator] = await Promise.all([hasAdminSession(), getCreatorFromRequest(request)])
  if (!isAdmin && !creator) {
    return Response.json({ error: 'Autenticação necessária' }, { status: 401 })
  }
  const input = await request.json().catch(() => null)
  try {
    return Response.json(await createPoll(input, joinOrigin(request)), { status: 201 })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not create poll' }, { status: 400 })
  }
}
