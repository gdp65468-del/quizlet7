import { NextRequest, NextResponse } from 'next/server'
import { buildCookieOptions } from '@/lib/cookie-utils'
import { closePoll, createVisitorCookie, endPoll, getPoll, hostPollView, isPollHost, playerPollView, POLL_VISITOR_COOKIE, submitPollVote, visitorIdFromCookie } from '@/lib/poll-store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
type Context = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Context) {
  const poll = await getPoll((await params).id)
  if (!poll) return NextResponse.json({ error: 'Poll not found' }, { status: 404 })
  const hostToken = request.headers.get('x-host-token')
  if (hostToken) {
    if (!isPollHost(poll, hostToken)) return NextResponse.json({ error: 'Invalid host credentials' }, { status: 403 })
    const etag = `"poll-${poll.id}-host-${poll.revision}"`
    const headers = { 'Cache-Control': 'private, no-store', ETag: etag }
    if (request.headers.get('if-none-match') === etag) return new NextResponse(null, { status: 304, headers })
    return NextResponse.json(hostPollView(poll), { headers })
  }
  const visitorId = visitorIdFromCookie(request.cookies.get(POLL_VISITOR_COOKIE)?.value)
  if (visitorId) {
    const etag = `"poll-${poll.id}-${visitorId}-${poll.revision}"`
    const headers = { 'Cache-Control': 'private, no-store', ETag: etag }
    if (request.headers.get('if-none-match') === etag) return new NextResponse(null, { status: 304, headers })
    return NextResponse.json(playerPollView(poll, visitorId), { headers })
  }
  const response = NextResponse.json(playerPollView(poll, null), { headers: { 'Cache-Control': 'no-store' } })
  const cookie = createVisitorCookie()
  response.cookies.set(POLL_VISITOR_COOKIE, cookie, buildCookieOptions(request, 30 * 24 * 60 * 60))
  return response
}

export async function POST(request: NextRequest, { params }: Context) {
  const poll = await getPoll((await params).id)
  if (!poll) return NextResponse.json({ error: 'Poll not found' }, { status: 404 })
  const body = await request.json().catch(() => null)
  try {
    if (body?.action === 'vote') {
      const visitorId = visitorIdFromCookie(request.cookies.get(POLL_VISITOR_COOKIE)?.value)
      if (!visitorId) return NextResponse.json({ error: 'Open the poll link again to join' }, { status: 403 })
      if (typeof body.optionId !== 'string') throw new Error('Choose an option')
      await submitPollVote(poll, visitorId, body.optionId)
      return NextResponse.json(playerPollView(poll, visitorId), { headers: { 'Cache-Control': 'no-store' } })
    }
    if (body?.action === 'end' || body?.action === 'close') {
      if (!isPollHost(poll, request.headers.get('x-host-token'))) {
        return NextResponse.json({ error: 'Invalid host credentials' }, { status: 403 })
      }
      if (body.action === 'end') {
        await endPoll(poll)
        return NextResponse.json(hostPollView(poll))
      }
      await closePoll(poll)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not update poll' }, { status: 400 })
  }
}
