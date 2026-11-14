import 'server-only'
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { APPWRITE_CONFIG } from '@/lib/appwrite'
import {
  AppwriteRestError,
  createDoc,
  deleteDoc,
  getDoc,
  isAppwriteServerEnabled,
  isServerlessRuntime,
  listDocs,
  Query,
  toAppwriteDocId,
  upsertDoc,
} from '@/lib/appwrite-server'
import type { HostPollView, PlayerPollView, PollOption, PollPhase } from '@/types/poll'

type Audience = 'host' | 'all'
type PersistedPollState = {
  id: string
  revision: number
  lastAccessedAt: number
  expiresAt: number
  endedAt: number | null
  endedAutomatically: boolean
  closedAt: number | null
  hostToken: string
  joinUrl: string | null
  question: string
  type: 'multiple_choice'
  options: PollOption[]
  phase: PollPhase
}

export type StoredPoll = PersistedPollState & {
  votes: Map<string, string>
  subscribers: Set<(audience: Audience) => void>
  expiryTimer: ReturnType<typeof setTimeout> | null
}

const globalPolls = globalThis as typeof globalThis & {
  livePolls?: Map<string, StoredPoll>
}
const polls = (globalPolls.livePolls ??= new Map<string, StoredPoll>())
const POLL_MAX_AGE_MS = 60 * 60 * 1000
const ENDED_TTL_MS = 60 * 60 * 1000
const CLOSED_TTL_MS = 10 * 60 * 1000
export const POLL_VISITOR_COOKIE = 'poll_visitor'

function visitorSecret(): Buffer {
  const seed = process.env.APPWRITE_API_KEY || process.env.QUIZ_ADMIN_PASSWORD || 'quizlet-poll-visitor-secret-v1'
  return createHash('sha256').update(`poll-visitor:${seed}`).digest()
}

function pollDocId(pollId: string) {
  return toAppwriteDocId(`p_${pollId}`)
}

function pollVoteDocId(pollId: string, visitorId: string) {
  return toAppwriteDocId(`pv_${pollId}_${visitorId}`)
}

function serializePoll(poll: StoredPoll): PersistedPollState {
  return {
    id: poll.id,
    revision: poll.revision,
    lastAccessedAt: poll.lastAccessedAt,
    expiresAt: poll.expiresAt,
    endedAt: poll.endedAt,
    endedAutomatically: poll.endedAutomatically,
    closedAt: poll.closedAt,
    hostToken: poll.hostToken,
    joinUrl: poll.joinUrl,
    question: poll.question,
    type: poll.type,
    options: poll.options,
    phase: poll.phase,
  }
}

async function persistPoll(poll: StoredPoll): Promise<void> {
  if (!isAppwriteServerEnabled()) return
  await upsertDoc(APPWRITE_CONFIG.liveRoomsCollectionId, pollDocId(poll.id), {
    roomId: poll.id,
    kind: 'poll',
    revision: poll.revision,
    expiresAt: poll.expiresAt,
    payloadJson: JSON.stringify(serializePoll(poll)),
    updatedAt: new Date().toISOString(),
  })
}

async function deleteAllPollDocs(pollId: string): Promise<void> {
  if (!isAppwriteServerEnabled()) return
  try {
    const resp = await listDocs(APPWRITE_CONFIG.liveRoomsCollectionId, [
      Query.equal('roomId', [pollId]),
      Query.limit(500),
    ])
    await Promise.all(
      resp.documents.map((doc) => deleteDoc(APPWRITE_CONFIG.liveRoomsCollectionId, doc.$id).catch(() => false)),
    )
  } catch (err) {
    console.warn(`Could not delete Appwrite docs for poll ${pollId}:`, err)
  }
}

function expired(poll: Pick<PersistedPollState, 'closedAt' | 'endedAt'>, now: number) {
  if (poll.closedAt !== null) return now - poll.closedAt > CLOSED_TTL_MS
  if (poll.endedAt !== null) return now - poll.endedAt > ENDED_TTL_MS
  return false
}

function clearExpiryTimer(poll: StoredPoll) {
  if (poll.expiryTimer) clearTimeout(poll.expiryTimer)
  poll.expiryTimer = null
}

function expirePollIfDue(poll: StoredPoll, now = Date.now()): boolean {
  if (poll.phase === 'open' && now >= poll.expiresAt) {
    clearExpiryTimer(poll)
    poll.phase = 'ended'
    poll.endedAt = now
    poll.endedAutomatically = true
    poll.revision += 1
    publish(poll, 'all')
    return true
  }
  return false
}

function scheduleExpiry(poll: StoredPoll) {
  if (isAppwriteServerEnabled() || isServerlessRuntime()) return
  if (poll.phase !== 'open' || poll.expiryTimer) return
  poll.expiryTimer = setTimeout(() => {
    poll.expiryTimer = null
    expirePollIfDue(poll)
  }, Math.max(0, poll.expiresAt - Date.now()))
  poll.expiryTimer.unref()
}

function signature(id: string) {
  return createHmac('sha256', visitorSecret()).update(id).digest('hex').slice(0, 32)
}

export function createVisitorCookie() {
  const id = randomBytes(16).toString('hex')
  return `${id}.${signature(id)}`
}

export function visitorIdFromCookie(value: string | undefined): string | null {
  const match = /^([a-f0-9]{32})\.([a-f0-9]{32})$/.exec(value ?? '')
  if (!match) return null
  const expected = signature(match[1])
  return timingSafeEqual(Buffer.from(match[2]), Buffer.from(expected)) ? match[1] : null
}

export async function createPoll(input: unknown, origin: string | null) {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new Error('Poll details are required')
  const { question, type, options } = input as Record<string, unknown>
  if (typeof question !== 'string' || !question.trim() || question.trim().length > 500) {
    throw new Error('Poll question must be 1 to 500 characters')
  }
  if (type !== 'multiple_choice') throw new Error('Unsupported poll type')
  if (!Array.isArray(options) || options.length < 2 || options.length > 8 ||
      options.some((option) => typeof option !== 'string' || !option.trim() || option.trim().length > 200)) {
    throw new Error('Add 2 to 8 options, each 1 to 200 characters')
  }
  const now = Date.now()
  for (const [id, poll] of polls) {
    poll.expiryTimer ??= null
    poll.expiresAt ??= poll.lastAccessedAt + POLL_MAX_AGE_MS
    poll.endedAutomatically ??= false
    expirePollIfDue(poll, now)
    if (expired(poll, now)) {
      clearExpiryTimer(poll)
      polls.delete(id)
    }
  }

  const firstCode = randomInt(1000, 10000)
  let id = ''

  if (isAppwriteServerEnabled()) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const code = String(1000 + ((firstCode - 1000 + attempt * 19) % 9000))
      const existing = await getDoc<{ payloadJson?: string }>(APPWRITE_CONFIG.liveRoomsCollectionId, pollDocId(code))
      if (!existing) {
        id = code
        break
      }
      if (typeof existing.payloadJson === 'string') {
        try {
          const parsed = JSON.parse(existing.payloadJson) as PersistedPollState
          if (expired(parsed, now) || now > parsed.expiresAt + ENDED_TTL_MS) {
            await deleteAllPollDocs(code)
            id = code
            break
          }
        } catch {
          await deleteAllPollDocs(code)
          id = code
          break
        }
      }
    }
  } else {
    for (let offset = 0; offset < 9000; offset += 1) {
      const code = String(1000 + ((firstCode - 1000 + offset) % 9000))
      if (!polls.has(code)) { id = code; break }
    }
  }

  if (!id) throw new Error('No poll codes are available')
  const poll: StoredPoll = {
    id, revision: 1, lastAccessedAt: now, expiresAt: now + POLL_MAX_AGE_MS,
    endedAt: null, endedAutomatically: false, closedAt: null,
    hostToken: randomBytes(32).toString('hex'),
    joinUrl: origin ? `${origin}/poll/${id}` : null,
    question: question.trim(), type: 'multiple_choice',
    options: options.map((option: string, index: number) => ({ id: String(index + 1), text: option.trim() })),
    phase: 'open', votes: new Map(), subscribers: new Set(), expiryTimer: null,
  }

  if (isAppwriteServerEnabled()) {
    await persistPoll(poll)
  } else {
    polls.set(id, poll)
    scheduleExpiry(poll)
  }

  return { id, hostToken: poll.hostToken }
}

export async function getPoll(id: string): Promise<StoredPoll | undefined> {
  const now = Date.now()

  if (isAppwriteServerEnabled()) {
    const resp = await listDocs<{ kind?: string; payloadJson?: string }>(APPWRITE_CONFIG.liveRoomsCollectionId, [
      Query.equal('roomId', [id]),
      Query.limit(500),
    ])

    const pollDoc = resp.documents.find((d) => d.kind === 'poll')
    if (!pollDoc || typeof pollDoc.payloadJson !== 'string') return undefined

    let state: PersistedPollState
    try {
      state = JSON.parse(pollDoc.payloadJson) as PersistedPollState
    } catch {
      return undefined
    }

    const votes = new Map<string, string>()
    for (const doc of resp.documents) {
      if (doc.kind !== 'poll_vote' || typeof doc.payloadJson !== 'string') continue
      try {
        const v = JSON.parse(doc.payloadJson) as { visitorId: string; optionId: string }
        if (v.visitorId && v.optionId) votes.set(v.visitorId, v.optionId)
      } catch {
        // Ignore malformed vote docs
      }
    }

    const poll: StoredPoll = {
      ...state,
      votes,
      subscribers: new Set(),
      expiryTimer: null,
    }
    const didExpire = expirePollIfDue(poll, now)
    if (expired(poll, now)) {
      await deleteAllPollDocs(id)
      return undefined
    }
    if (didExpire) {
      await persistPoll(poll)
    }
    return poll
  }

  const poll = polls.get(id)
  if (!poll) return undefined
  poll.subscribers ??= new Set()
  poll.expiryTimer ??= null
  poll.expiresAt ??= poll.lastAccessedAt + POLL_MAX_AGE_MS
  poll.endedAutomatically ??= false
  expirePollIfDue(poll, now)
  if (expired(poll, now)) { clearExpiryTimer(poll); polls.delete(id); return undefined }
  if (poll.phase === 'open') poll.lastAccessedAt = now
  scheduleExpiry(poll)
  return poll
}

export function isPollHost(poll: StoredPoll, token: string | null) {
  return !!token && token === poll.hostToken
}

function counts(poll: StoredPoll) {
  const result: Record<string, number> = Object.fromEntries(poll.options.map((option) => [option.id, 0]))
  for (const optionId of poll.votes.values()) {
    if (optionId in result) result[optionId] += 1
  }
  return result
}

export function hostPollView(poll: StoredPoll): HostPollView {
  return {
    id: poll.id, revision: poll.revision, phase: poll.phase,
    endedAutomatically: poll.endedAutomatically,
    question: poll.question, type: poll.type, options: poll.options,
    joinUrl: poll.joinUrl, submissionCount: poll.votes.size, voteCounts: counts(poll),
  }
}

export function playerPollView(poll: StoredPoll, visitorId: string | null): PlayerPollView {
  return {
    id: poll.id, revision: poll.revision, phase: poll.phase,
    endedAutomatically: poll.endedAutomatically,
    question: poll.question, type: poll.type, options: poll.options,
    selectedOptionId: visitorId ? poll.votes.get(visitorId) ?? null : null,
    submissionCount: poll.phase === 'ended' ? poll.votes.size : null,
    voteCounts: poll.phase === 'ended' ? counts(poll) : null,
  }
}

export function subscribePoll(poll: StoredPoll, listener: (audience: Audience) => void) {
  poll.subscribers.add(listener)
  return () => { poll.subscribers.delete(listener); poll.lastAccessedAt = Date.now() }
}

function publish(poll: StoredPoll, audience: Audience) {
  for (const subscriber of poll.subscribers) {
    try { subscriber(audience) } catch { poll.subscribers.delete(subscriber) }
  }
}

export async function submitPollVote(poll: StoredPoll, visitorId: string, optionId: string) {
  expirePollIfDue(poll)
  if (poll.phase !== 'open') throw new Error('This poll has ended')
  if (poll.votes.has(visitorId)) throw new Error('You already submitted this poll')
  if (!poll.options.some((option) => option.id === optionId)) throw new Error('Choose a valid option')

  if (isAppwriteServerEnabled()) {
    try {
      await createDoc(APPWRITE_CONFIG.liveRoomsCollectionId, pollVoteDocId(poll.id, visitorId), {
        roomId: poll.id,
        kind: 'poll_vote',
        revision: 1,
        expiresAt: poll.expiresAt,
        payloadJson: JSON.stringify({ visitorId, optionId }),
        updatedAt: new Date().toISOString(),
      })
    } catch (err) {
      if (err instanceof AppwriteRestError && err.status === 409) {
        throw new Error('You already submitted this poll')
      }
      throw err
    }
    poll.votes.set(visitorId, optionId)
    poll.revision += 1
    await persistPoll(poll)
  } else {
    poll.votes.set(visitorId, optionId)
    poll.revision += 1
    publish(poll, 'host')
  }
}

export async function endPoll(poll: StoredPoll, automatically = false) {
  if (!automatically) expirePollIfDue(poll)
  if (poll.phase !== 'open') throw new Error('This poll has already ended')
  clearExpiryTimer(poll)
  poll.phase = 'ended'
  poll.endedAt = Date.now()
  poll.endedAutomatically = automatically
  poll.revision += 1
  publish(poll, 'all')
  if (isAppwriteServerEnabled()) {
    await persistPoll(poll)
  }
}

export async function closePoll(poll: StoredPoll) {
  if (poll.phase !== 'ended') throw new Error('End the poll before closing it')
  clearExpiryTimer(poll)
  poll.hostToken = ''
  poll.closedAt = Date.now()
  polls.delete(poll.id)
  if (isAppwriteServerEnabled()) {
    await deleteAllPollDocs(poll.id)
  }
}
