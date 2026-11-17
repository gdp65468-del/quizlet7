import 'server-only'
import { randomBytes, randomInt, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
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
import type { QuizSettings } from '@/lib/quiz-settings'
import { saveSessionReport } from '@/lib/session-reports'
import type {
  Answer,
  GamePhase,
  GameResult,
  HostGameView,
  PartialLeaderboardEntry,
  Participant,
  PlayerGameView,
  PlayerRoundFeedback,
  QuizSet,
  SessionReport,
} from '@/types/game'

type Player = Participant & {
  token: string
  joinedAt: number
  totalScore: number
  correctCount: number
  streak: number
  bestStreak: number
  previousRank: number | null
  rankDelta: number
}

type RawRoundScore = {
  earnedScore: number
  baseScore: number
  speedBonus: number
  streakBonus: number
  streak: number
  isCorrect: boolean
  isPartial: boolean
  multiplier: number
}

type PersistedAnswerRecord = Answer & {
  questionOrder: number
  baseScore: number
  speedBonus: number
  streakBonus: number
  isCorrect: boolean
  isPartial: boolean
  multiplier: number
  streak: number
  answeredAt: number
}

type PersistedGameState = {
  id: string
  revision: number
  lastAccessedAt: number
  closedAt: number | null
  expiresAt: number
  joinUrl: string | null
  hostToken: string
  quiz: QuizSet
  classLabel: string
  choiceRevealMs: number
  answerTimeMs: number
  leaderboardVisibility: QuizSettings['leaderboardVisibility']
  showDistribution: boolean
  saveSession: boolean
  finalResults: GameResult[] | null
  sessionReport: SessionReport | null
  phase: GamePhase
  questionIndex: number
  questionStartedAt: number | null
  isAnswerRevealed: boolean
}

type GameAudience = 'host' | 'all'
export type StoredGame = PersistedGameState & {
  completionPromise: Promise<void> | null
  players: Player[]
  answers: PersistedAnswerRecord[]
  answersByQuestion: Map<string, Map<string, PersistedAnswerRecord>>
  roundScoresByQuestion: Map<string, Map<string, RawRoundScore>>
  lastRoundFeedback: Map<string, PlayerRoundFeedback>
  subscribers: Set<(audience: GameAudience) => void>
  revealTimer: ReturnType<typeof setTimeout> | null
  expiryTimer: ReturnType<typeof setTimeout> | null
}

const globalGames = globalThis as typeof globalThis & { quizGames?: Map<string, StoredGame> }
const games = (globalGames.quizGames ??= new Map<string, StoredGame>())
const token = () => randomBytes(32).toString('hex')
const GAME_MAX_AGE_MS = 60 * 60 * 1000
const CLOSED_TTL_MS = 10 * 60 * 1000

function isExpired(game: Pick<PersistedGameState, 'closedAt'>, now: number) {
  return game.closedAt != null && now - game.closedAt > CLOSED_TTL_MS
}

function gameRoomDocId(gameId: string) {
  return toAppwriteDocId(`g_${gameId}`)
}

function gamePlayerDocId(gameId: string, playerId: string) {
  return toAppwriteDocId(`gp_${gameId}_${playerId}`)
}

function gameAnswerDocId(gameId: string, questionOrder: number, playerId: string) {
  return toAppwriteDocId(`ga_${gameId}_${questionOrder}_${playerId}`)
}

function serializeGameState(game: StoredGame): PersistedGameState {
  return {
    id: game.id,
    revision: game.revision,
    lastAccessedAt: game.lastAccessedAt,
    closedAt: game.closedAt,
    expiresAt: game.expiresAt,
    joinUrl: game.joinUrl,
    hostToken: game.hostToken,
    quiz: game.quiz,
    classLabel: game.classLabel,
    choiceRevealMs: game.choiceRevealMs,
    answerTimeMs: game.answerTimeMs,
    leaderboardVisibility: game.leaderboardVisibility,
    showDistribution: game.showDistribution,
    saveSession: game.saveSession,
    finalResults: game.finalResults,
    sessionReport: game.sessionReport,
    phase: game.phase,
    questionIndex: game.questionIndex,
    questionStartedAt: game.questionStartedAt,
    isAnswerRevealed: game.isAnswerRevealed,
  }
}

async function persistGameRoom(game: StoredGame): Promise<void> {
  if (!isAppwriteServerEnabled()) return
  await upsertDoc(APPWRITE_CONFIG.liveRoomsCollectionId, gameRoomDocId(game.id), {
    roomId: game.id,
    kind: 'game',
    revision: game.revision,
    expiresAt: game.expiresAt,
    payloadJson: JSON.stringify(serializeGameState(game)),
    updatedAt: new Date().toISOString(),
  })
}

async function deleteAllGameDocs(gameId: string): Promise<void> {
  if (!isAppwriteServerEnabled()) return
  try {
    const resp = await listDocs(APPWRITE_CONFIG.liveRoomsCollectionId, [
      Query.equal('roomId', [gameId]),
      Query.limit(500),
    ])
    await Promise.all(
      resp.documents.map((doc) => deleteDoc(APPWRITE_CONFIG.liveRoomsCollectionId, doc.$id).catch(() => false)),
    )
  } catch (err) {
    console.warn(`Could not delete Appwrite docs for game ${gameId}:`, err)
  }
}

function ensureRealtimeState(game: StoredGame) {
  game.subscribers ??= new Set()
  game.revealTimer ??= null
  game.expiryTimer ??= null
  game.closedAt ??= null
  game.expiresAt ??= game.lastAccessedAt + GAME_MAX_AGE_MS
  game.leaderboardVisibility ??= 'all'
  game.showDistribution ??= true
  game.saveSession ??= true
  game.finalResults ??= null
  game.sessionReport ??= null
  game.completionPromise ??= null
  game.classLabel ??= ''
  game.roundScoresByQuestion ??= new Map()
  game.lastRoundFeedback ??= new Map()
}

function clearExpiryTimer(game: StoredGame) {
  if (game.expiryTimer) clearTimeout(game.expiryTimer)
  game.expiryTimer = null
}

function clearRevealTimer(game: StoredGame) {
  if (game.revealTimer) clearTimeout(game.revealTimer)
  game.revealTimer = null
}

function sortedStandings(game: StoredGame) {
  return [...game.players].sort(
    (a, b) => b.totalScore - a.totalScore || b.correctCount - a.correctCount || a.nickname.localeCompare(b.nickname),
  )
}

function snapshotPreRoundRanks(game: StoredGame, questionIdx = game.questionIndex) {
  const sorted = sortedStandings(game)
  sorted.forEach((player, idx) => {
    player.previousRank = questionIdx === 0 ? null : idx + 1
  })
}

function buildRoundFeedbackMap(game: StoredGame, questionIdx = game.questionIndex) {
  const question = game.quiz.questions[questionIdx]
  if (!question) return new Map<string, PlayerRoundFeedback>()
  const qRoundScores = game.roundScoresByQuestion.get(question.id)
  const standings = sortedStandings(game)
  const nextFeedback = new Map<string, PlayerRoundFeedback>()

  standings.forEach((player, index) => {
    const rank = index + 1
    const delta = player.previousRank !== null ? player.previousRank - rank : 0
    player.rankDelta = delta
    const raw = qRoundScores?.get(player.id)
    const playerAbove = index > 0 ? standings[index - 1] : null
    const playerBelow = index === 0 && standings.length > 1 ? standings[1] : null

    nextFeedback.set(player.id, {
      earnedScore: raw?.earnedScore ?? 0,
      baseScore: raw?.baseScore ?? 0,
      speedBonus: raw?.speedBonus ?? 0,
      streakBonus: raw?.streakBonus ?? 0,
      streak: raw ? raw.streak : player.streak,
      isCorrect: raw?.isCorrect ?? false,
      isPartial: raw?.isPartial ?? false,
      multiplier: raw?.multiplier ?? (question.pointsMultiplier === 2 ? 2 : 1),
      rank,
      totalPlayers: standings.length,
      pointsBehindNext: playerAbove ? Math.max(0, playerAbove.totalScore - player.totalScore) : null,
      pointsAheadNext: playerBelow ? Math.max(0, player.totalScore - playerBelow.totalScore) : null,
      rankDelta: delta,
    })
  })

  return nextFeedback
}

function rebuildDerivedPlayerState(game: StoredGame) {
  for (const player of game.players) {
    player.totalScore = 0
    player.correctCount = 0
    player.streak = 0
    player.bestStreak = 0
    player.previousRank = null
    player.rankDelta = 0
  }

  game.answersByQuestion = new Map()
  game.roundScoresByQuestion = new Map()
  game.lastRoundFeedback = new Map()

  const answersByOrder = new Map<number, PersistedAnswerRecord[]>()
  for (const ans of game.answers) {
    const list = answersByOrder.get(ans.questionOrder) ?? []
    list.push(ans)
    answersByOrder.set(ans.questionOrder, list)
  }

  const maxQuestionIdx = Math.min(game.questionIndex, Math.max(0, game.quiz.questions.length - 1))
  const playersById = new Map(game.players.map((p) => [p.id, p]))

  for (let qIdx = 0; qIdx <= maxQuestionIdx; qIdx += 1) {
    const question = game.quiz.questions[qIdx]
    if (!question) continue

    snapshotPreRoundRanks(game, qIdx)

    const qAnswersMap = new Map<string, PersistedAnswerRecord>()
    const qRoundScoresMap = new Map<string, RawRoundScore>()
    const roundAnswers = answersByOrder.get(qIdx) ?? []

    for (const ans of roundAnswers) {
      const streak = ans.streak ?? 0
      const isCorrect = Boolean(ans.isCorrect)
      qAnswersMap.set(ans.participantId, ans)
      qRoundScoresMap.set(ans.participantId, {
        earnedScore: ans.score,
        baseScore: ans.baseScore,
        speedBonus: ans.speedBonus,
        streakBonus: ans.streakBonus,
        streak,
        isCorrect,
        isPartial: Boolean(ans.isPartial),
        multiplier: ans.multiplier || 1,
      })

      const player = playersById.get(ans.participantId)
      if (player) {
        player.totalScore += ans.score
        if (isCorrect) player.correctCount += 1
        player.streak = streak
        player.bestStreak = Math.max(player.bestStreak, streak)
      }
    }

    game.answersByQuestion.set(question.id, qAnswersMap)
    game.roundScoresByQuestion.set(question.id, qRoundScoresMap)

    const roundFinished = qIdx < game.questionIndex || game.isAnswerRevealed || game.phase === 'leaderboard' || game.phase === 'result'
    if (roundFinished) {
      for (const player of game.players) {
        if (!qAnswersMap.has(player.id)) {
          player.streak = 0
        }
      }
    }

    if (qIdx === game.questionIndex && (game.isAnswerRevealed || game.phase === 'leaderboard')) {
      game.lastRoundFeedback = buildRoundFeedbackMap(game, qIdx)
    }
  }
}

function expireGameIfDue(game: StoredGame, now = Date.now()): boolean {
  if (game.closedAt !== null || now < game.expiresAt) return false
  clearRevealTimer(game)
  clearExpiryTimer(game)
  game.phase = 'expired'
  game.closedAt = now
  game.revision += 1
  publishGame(game, 'all')
  return true
}

function scheduleExpiry(game: StoredGame) {
  if (isAppwriteServerEnabled() || isServerlessRuntime()) return
  if (game.expiryTimer || game.closedAt !== null) return
  game.expiryTimer = setTimeout(() => {
    game.expiryTimer = null
    expireGameIfDue(game)
  }, Math.max(0, game.expiresAt - Date.now()))
  game.expiryTimer.unref()
}

function scheduleReveal(game: StoredGame) {
  if (isAppwriteServerEnabled() || isServerlessRuntime()) return
  clearRevealTimer(game)
  const questionIndex = game.questionIndex
  const revealAt = (game.questionStartedAt ?? Date.now()) + game.choiceRevealMs + game.answerTimeMs
  game.revealTimer = setTimeout(() => {
    game.revealTimer = null
    if (game.phase === 'quiz' && game.questionIndex === questionIndex) updateTimedState(game)
  }, Math.max(0, revealAt - Date.now()))
  game.revealTimer.unref()
}

function shuffledQuiz(quiz: QuizSet): QuizSet {
  return {
    ...quiz,
    questions: quiz.questions.map((question) => {
      if (question.type === 'true_false') {
        return { ...question, choices: [...question.choices] }
      }
      const choices = [...question.choices]
      for (let index = choices.length - 1; index > 0; index -= 1) {
        const randomIndex = randomInt(index + 1)
        const selected = choices[index]
        choices[index] = choices[randomIndex]
        choices[randomIndex] = selected
      }
      return { ...question, choices }
    }),
  }
}

export async function createGame(quiz: QuizSet, origin: string | null, settings: QuizSettings, classLabel = '') {
  if (isServerlessRuntime() && !isAppwriteServerEnabled()) {
    throw new Error(
      'Configuração pendente no servidor: adicione APPWRITE_API_KEY nas variáveis de ambiente da Vercel/Netlify e faça um Redeploy para criar salas ao vivo.',
    )
  }
  const now = Date.now()
  for (const [id, game] of games) {
    ensureRealtimeState(game)
    expireGameIfDue(game, now)
    if (isExpired(game, now)) {
      clearRevealTimer(game)
      clearExpiryTimer(game)
      games.delete(id)
    }
  }

  const firstCode = randomInt(1000, 10000)
  let id = ''

  if (isAppwriteServerEnabled()) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const code = String(1000 + ((firstCode - 1000 + attempt * 17) % 9000))
      const existing = await getDoc<{ expiresAt?: number; payloadJson?: string }>(
        APPWRITE_CONFIG.liveRoomsCollectionId,
        gameRoomDocId(code),
      )
      if (!existing) {
        id = code
        break
      }
      if (typeof existing.payloadJson === 'string') {
        try {
          const parsed = JSON.parse(existing.payloadJson) as PersistedGameState
          if (isExpired(parsed, now) || now > parsed.expiresAt + CLOSED_TTL_MS) {
            await deleteAllGameDocs(code)
            id = code
            break
          }
        } catch {
          await deleteAllGameDocs(code)
          id = code
          break
        }
      }
    }
  } else {
    for (let offset = 0; offset < 9000; offset += 1) {
      const code = String(1000 + ((firstCode - 1000 + offset) % 9000))
      if (!games.has(code)) {
        id = code
        break
      }
    }
  }

  if (!id) throw new Error('No game codes are available')

  const game: StoredGame = {
    id,
    revision: 1,
    lastAccessedAt: now,
    closedAt: null,
    expiresAt: now + GAME_MAX_AGE_MS,
    joinUrl: origin ? `${origin}/game/${id}` : null,
    hostToken: token(),
    quiz: shuffledQuiz(quiz),
    classLabel: classLabel.trim().slice(0, 80),
    choiceRevealMs: settings.choiceRevealSeconds * 1000,
    answerTimeMs: settings.answerTimeSeconds * 1000,
    leaderboardVisibility: settings.leaderboardVisibility,
    showDistribution: settings.showDistribution,
    saveSession: settings.saveSession,
    finalResults: null,
    sessionReport: null,
    completionPromise: null,
    phase: 'lobby',
    questionIndex: 0,
    questionStartedAt: null,
    isAnswerRevealed: false,
    players: [],
    answers: [],
    answersByQuestion: new Map(),
    roundScoresByQuestion: new Map(),
    lastRoundFeedback: new Map(),
    subscribers: new Set(),
    revealTimer: null,
    expiryTimer: null,
  }

  if (isAppwriteServerEnabled()) {
    await persistGameRoom(game)
  } else {
    games.set(game.id, game)
    scheduleExpiry(game)
  }

  return { id: game.id, hostToken: game.hostToken }
}

export async function getGame(id: string): Promise<StoredGame | undefined> {
  const now = Date.now()

  if (isAppwriteServerEnabled()) {
    const resp = await listDocs<{ kind?: string; payloadJson?: string }>(APPWRITE_CONFIG.liveRoomsCollectionId, [
      Query.equal('roomId', [id]),
      Query.limit(500),
    ])

    const roomDoc = resp.documents.find((d) => d.kind === 'game')
    if (!roomDoc || typeof roomDoc.payloadJson !== 'string') return undefined

    let roomState: PersistedGameState
    try {
      roomState = JSON.parse(roomDoc.payloadJson) as PersistedGameState
    } catch {
      return undefined
    }

    const players: Player[] = []
    const answers: PersistedAnswerRecord[] = []

    for (const doc of resp.documents) {
      if (typeof doc.payloadJson !== 'string') continue
      try {
        if (doc.kind === 'game_player') {
          const p = JSON.parse(doc.payloadJson) as { id: string; token: string; nickname: string; joinedAt?: number }
          players.push({
            id: p.id,
            token: p.token,
            nickname: p.nickname,
            joinedAt: p.joinedAt ?? 0,
            totalScore: 0,
            correctCount: 0,
            streak: 0,
            bestStreak: 0,
            previousRank: null,
            rankDelta: 0,
          })
        } else if (doc.kind === 'game_answer') {
          answers.push(JSON.parse(doc.payloadJson) as PersistedAnswerRecord)
        }
      } catch {
        // Ignore malformed child docs
      }
    }

    players.sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id))

    const game: StoredGame = {
      ...roomState,
      completionPromise: null,
      players,
      answers,
      answersByQuestion: new Map(),
      roundScoresByQuestion: new Map(),
      lastRoundFeedback: new Map(),
      subscribers: new Set(),
      revealTimer: null,
      expiryTimer: null,
    }
    ensureRealtimeState(game)
    rebuildDerivedPlayerState(game)

    const didExpire = expireGameIfDue(game, now)
    if (isExpired(game, now)) {
      await deleteAllGameDocs(id)
      return undefined
    }
    const didReveal = updateTimedState(game)
    if (didExpire || didReveal) {
      await persistGameRoom(game)
    }
    return game
  }

  const game = games.get(id)
  if (!game) return undefined
  ensureRealtimeState(game)
  expireGameIfDue(game, now)
  if (isExpired(game, now)) {
    clearRevealTimer(game)
    clearExpiryTimer(game)
    games.delete(id)
    return undefined
  }
  if (game.closedAt == null) game.lastAccessedAt = now
  updateTimedState(game)
  if (game.phase === 'quiz' && !game.isAnswerRevealed && !game.revealTimer) scheduleReveal(game)
  scheduleExpiry(game)
  return game
}

export function gameRevision(game: StoredGame) {
  return game.revision
}

export function subscribeGame(game: StoredGame, listener: (audience: GameAudience) => void) {
  ensureRealtimeState(game)
  game.subscribers.add(listener)
  return () => {
    game.subscribers.delete(listener)
    game.lastAccessedAt = Date.now()
  }
}

function publishGame(game: StoredGame, audience: GameAudience) {
  for (const subscriber of game.subscribers) {
    try {
      subscriber(audience)
    } catch {
      game.subscribers.delete(subscriber)
    }
  }
}

function finalizeQuestionReveal(game: StoredGame) {
  if (game.isAnswerRevealed) return
  game.isAnswerRevealed = true
  clearRevealTimer(game)

  const question = game.quiz.questions[game.questionIndex]
  const qAnswers = game.answersByQuestion.get(question.id)

  for (const player of game.players) {
    if (!qAnswers?.has(player.id)) {
      player.streak = 0
    }
  }

  game.lastRoundFeedback = buildRoundFeedbackMap(game, game.questionIndex)
  game.revision += 1
  publishGame(game, 'all')
}

function updateTimedState(game: StoredGame): boolean {
  if (
    game.phase === 'quiz' &&
    !game.isAnswerRevealed &&
    game.questionStartedAt !== null &&
    Date.now() >= game.questionStartedAt + game.choiceRevealMs + game.answerTimeMs
  ) {
    finalizeQuestionReveal(game)
    return true
  }
  return false
}

export function isHost(game: StoredGame, hostToken: string | null) {
  return !!hostToken && hostToken === game.hostToken
}

export async function closeGame(game: StoredGame) {
  expireGameIfDue(game)
  if (game.phase !== 'result') throw new Error('This session has not finished yet')
  clearRevealTimer(game)
  clearExpiryTimer(game)
  game.subscribers.clear()
  games.delete(game.id)
  if (isAppwriteServerEnabled()) {
    await deleteAllGameDocs(game.id)
  }
}

export async function cancelGame(game: StoredGame) {
  expireGameIfDue(game)
  if (game.phase !== 'lobby' && game.phase !== 'quiz' && game.phase !== 'leaderboard') {
    throw new Error('This session has already ended')
  }
  clearRevealTimer(game)
  clearExpiryTimer(game)
  game.phase = 'cancelled'
  game.closedAt = Date.now()
  game.revision += 1
  publishGame(game, 'all')
  if (isAppwriteServerEnabled()) {
    await persistGameRoom(game)
  }
}

export async function joinGame(game: StoredGame, nickname: string) {
  expireGameIfDue(game)
  if (game.phase !== 'lobby') {
    throw new Error(
      game.phase === 'cancelled'
        ? 'This quiz was cancelled'
        : game.phase === 'expired'
          ? 'This quiz closed after one hour'
          : 'This game has already started',
    )
  }
  const name = nickname.trim()
  if (!name || name.length > 20) throw new Error('Nickname must be 1 to 20 characters')
  if (game.players.some((player) => player.nickname.toLowerCase() === name.toLowerCase())) {
    throw new Error('That nickname is already taken')
  }
  const player: Player = {
    id: randomUUID(),
    token: token(),
    nickname: name,
    joinedAt: Date.now(),
    totalScore: 0,
    correctCount: 0,
    streak: 0,
    bestStreak: 0,
    previousRank: null,
    rankDelta: 0,
  }

  if (isAppwriteServerEnabled()) {
    await createDoc(APPWRITE_CONFIG.liveRoomsCollectionId, gamePlayerDocId(game.id, player.id), {
      roomId: game.id,
      kind: 'game_player',
      revision: 1,
      expiresAt: game.expiresAt,
      payloadJson: JSON.stringify({
        id: player.id,
        token: player.token,
        nickname: player.nickname,
        joinedAt: player.joinedAt,
      }),
      updatedAt: new Date().toISOString(),
    })
    game.players.push(player)
    game.revision += 1
    await persistGameRoom(game)
  } else {
    game.players.push(player)
    game.revision += 1
    publishGame(game, 'host')
  }

  return { id: player.id, token: player.token, nickname: player.nickname }
}

export function authenticatePlayer(game: StoredGame, id: string | null, playerToken: string | null) {
  return game.players.find((player) => player.id === id && player.token === playerToken)
}

function gameResults(game: StoredGame): GameResult[] {
  if (game.finalResults) return game.finalResults
  game.finalResults = sortedStandings(game).map(({ id, nickname, totalScore, correctCount, bestStreak, rankDelta }) => ({
    id,
    nickname,
    totalScore,
    correctCount,
    bestStreak,
    rankDelta,
  }))
  return game.finalResults
}

function partialLeaderboardEntries(game: StoredGame, limit = 5): PartialLeaderboardEntry[] {
  return sortedStandings(game)
    .slice(0, limit)
    .map((p, index) => ({
      id: p.id,
      nickname: p.nickname,
      totalScore: p.totalScore,
      streak: p.streak,
      rank: index + 1,
      rankDelta: p.rankDelta,
    }))
}

function buildSessionReport(game: StoredGame): SessionReport {
  const results = gameResults(game)
  const questionCount = game.quiz.questions.length
  const participantCount = results.length
  const totalPossible = participantCount * questionCount
  const totalCorrect = results.reduce((sum, r) => sum + r.correctCount, 0)
  const averageAccuracy = totalPossible > 0 ? Number(((totalCorrect / totalPossible) * 100).toFixed(1)) : 0
  const category = game.quiz.id.split('/')[0] || 'general'

  const questionStats = game.quiz.questions.map((question) => {
    const qAnswers = [...(game.answersByQuestion.get(question.id)?.values() ?? [])]
    const totalAnswers = qAnswers.length
    const correctCount = qAnswers.filter((a) => a.isCorrect).length
    const accuracyPercent = totalAnswers > 0 ? Number(((correctCount / totalAnswers) * 100).toFixed(1)) : 0
    return {
      questionId: question.id,
      questionBody: question.body,
      correctCount,
      totalAnswers,
      accuracyPercent,
    }
  })

  return {
    id: `${Date.now()}-${game.id}`,
    quizId: game.quiz.id,
    quizName: game.quiz.name,
    category,
    classLabel: game.classLabel,
    completedAt: new Date().toISOString(),
    questionCount,
    participantCount,
    averageAccuracy,
    topScorer: results[0]?.nickname ?? '',
    leaderboard: results.map(({ id, nickname, totalScore, correctCount, bestStreak }) => ({
      id,
      nickname,
      totalScore,
      correctCount,
      bestStreak,
    })),
    questionStats,
  }
}

function safePathSegment(value: string): string {
  const segment = value.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '')
  return segment && segment !== '..' ? segment : 'Untitled'
}

function singleLine(value: string): string {
  return value.replace(/[\r\n\t]+/g, ' ').trim()
}

async function archiveResults(game: StoredGame): Promise<void> {
  const report = (game.sessionReport ??= buildSessionReport(game))
  await saveSessionReport(report).catch((err) => {
    console.warn('Could not write session JSON report:', err)
  })

  if (!game.saveSession || isServerlessRuntime()) return
  const category = safePathSegment(game.quiz.id.split('/')[0] || 'Uncategorized')
  const directory = path.join(process.cwd(), 'data', 'sessions', category, safePathSegment(game.quiz.name))
  const completedAt = new Date()
  const timestamp = completedAt.toISOString().replace(/:/g, '-')
  const questionCount = game.quiz.questions.length
  const rows = gameResults(game).map(
    (result, index) =>
      `${index + 1}. ${singleLine(result.nickname)} | ${result.totalScore} points | ${result.correctCount}/${questionCount} correct | best streak ${result.bestStreak}x`,
  )
  const contents = [
    `Quiz: ${singleLine(game.quiz.name)}`,
    `Category: ${singleLine(category)}`,
    ...(game.classLabel ? [`Class: ${singleLine(game.classLabel)}`] : []),
    `Completed: ${completedAt.toISOString()}`,
    `Questions: ${questionCount}`,
    '',
    'Leaderboard (highest points first)',
    ...rows,
    ...(rows.length ? [] : ['No participants joined.']),
    '',
  ].join('\n')
  try {
    await mkdir(directory, { recursive: true })
    try {
      await writeFile(path.join(directory, `${timestamp}.txt`), contents, { flag: 'wx', mode: 0o600 })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      await writeFile(path.join(directory, `${timestamp}-${game.id}-${randomUUID().slice(0, 8)}.txt`), contents, {
        flag: 'wx',
        mode: 0o600,
      })
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'EROFS' && code !== 'EACCES') throw error
  }
}

export class SessionArchiveError extends Error {}

function currentGamePhase(game: StoredGame): GamePhase {
  return game.phase
}

export async function hostAction(game: StoredGame, action: string) {
  expireGameIfDue(game)
  updateTimedState(game)
  if (action === 'start' && game.phase === 'lobby') {
    game.phase = 'quiz'
    game.questionStartedAt = Date.now()
    snapshotPreRoundRanks(game)
    game.revision += 1
    scheduleReveal(game)
    publishGame(game, 'all')
    if (isAppwriteServerEnabled()) await persistGameRoom(game)
    return
  }
  if (action === 'reveal' && game.phase === 'quiz') {
    finalizeQuestionReveal(game)
    if (isAppwriteServerEnabled()) await persistGameRoom(game)
    return
  }
  if (action === 'leaderboard' && game.phase === 'quiz' && game.isAnswerRevealed) {
    if (game.questionIndex + 1 < game.quiz.questions.length) {
      game.phase = 'leaderboard'
      game.revision += 1
      publishGame(game, 'all')
      if (isAppwriteServerEnabled()) await persistGameRoom(game)
      return
    }
  }
  if (action === 'next' && ((game.phase === 'quiz' && game.isAnswerRevealed) || game.phase === 'leaderboard')) {
    if (game.questionIndex + 1 === game.quiz.questions.length) {
      if (!game.completionPromise) {
        game.completionPromise = archiveResults(game).catch(() => {
          game.completionPromise = null
          throw new SessionArchiveError('Could not save the leaderboard. Check server storage and try again.')
        })
      }
      await game.completionPromise
      const currentPhase = currentGamePhase(game)
      if (currentPhase === 'result') return
      if (currentPhase !== 'quiz' && currentPhase !== 'leaderboard') throw new Error('This room has closed')
      game.phase = 'result'
    } else {
      game.phase = 'quiz'
      game.questionIndex += 1
      game.questionStartedAt = Date.now()
      game.isAnswerRevealed = false
      game.lastRoundFeedback = new Map()
      snapshotPreRoundRanks(game)
    }
    game.revision += 1
    if (game.phase === 'quiz') scheduleReveal(game)
    else clearRevealTimer(game)
    publishGame(game, 'all')
    if (isAppwriteServerEnabled()) await persistGameRoom(game)
    return
  }
  throw new Error('Action is unavailable in the current game phase')
}

export async function submitAnswer(game: StoredGame, player: Player, rawChoiceInput: string | string[]) {
  expireGameIfDue(game)
  updateTimedState(game)
  if (game.phase !== 'quiz' || game.isAnswerRevealed || game.questionStartedAt === null) {
    throw new Error('This question is closed')
  }
  const elapsed = Date.now() - game.questionStartedAt - game.choiceRevealMs
  if (elapsed < 0 || elapsed >= game.answerTimeMs) throw new Error('Choices are not open')

  const question = game.quiz.questions[game.questionIndex]
  const uniqueIds = Array.from(
    new Set(Array.isArray(rawChoiceInput) ? rawChoiceInput : [rawChoiceInput]),
  ).filter((id) => typeof id === 'string' && id.length > 0)

  if (uniqueIds.length === 0) throw new Error('Select at least one choice')
  if (question.type !== 'multi_select' && uniqueIds.length > 1) {
    throw new Error('Only one choice can be selected for this question')
  }

  for (const id of uniqueIds) {
    if (!question.choices.some((item) => item.id === id)) {
      throw new Error('Invalid choice')
    }
  }

  let questionAnswers = game.answersByQuestion.get(question.id)
  if (questionAnswers?.has(player.id)) {
    throw new Error('You already answered this question')
  }

  const correctChoiceIds = question.choices.filter((c) => c.is_correct).map((c) => c.id)
  const selectedCorrect = uniqueIds.filter((id) => correctChoiceIds.includes(id)).length
  const selectedWrong = uniqueIds.length - selectedCorrect
  const isFullCorrect = selectedWrong === 0 && selectedCorrect === correctChoiceIds.length
  const isPartial = question.type === 'multi_select' && selectedWrong === 0 && selectedCorrect > 0 && selectedCorrect < correctChoiceIds.length

  const multiplier = question.pointsMultiplier === 2 ? 2 : 1
  const speedRatio = Math.max(0, Math.min(1, 1 - elapsed / game.answerTimeMs))
  let baseScore = 0
  let speedBonus = 0
  let streakBonus = 0
  let score = 0

  if (isFullCorrect) {
    player.streak += 1
    player.bestStreak = Math.max(player.bestStreak, player.streak)
    player.correctCount += 1
    baseScore = 500
    speedBonus = Math.round(500 * speedRatio)
    streakBonus = player.streak >= 2 ? Math.min(500, (player.streak - 1) * 100) : 0
    score = (baseScore + speedBonus + streakBonus) * multiplier
  } else if (isPartial) {
    player.streak = 0
    const ratio = selectedCorrect / correctChoiceIds.length
    baseScore = Math.round(500 * ratio)
    speedBonus = Math.round(500 * ratio * speedRatio)
    score = (baseScore + speedBonus) * multiplier
  } else {
    player.streak = 0
  }

  player.totalScore += score

  const answerRecord: PersistedAnswerRecord = {
    participantId: player.id,
    questionId: question.id,
    questionOrder: game.questionIndex,
    choiceId: uniqueIds[0],
    choiceIds: uniqueIds,
    score,
    baseScore,
    speedBonus,
    streakBonus,
    isCorrect: isFullCorrect,
    isPartial,
    multiplier,
    streak: player.streak,
    answeredAt: Date.now(),
  }

  if (isAppwriteServerEnabled()) {
    try {
      await createDoc(
        APPWRITE_CONFIG.liveRoomsCollectionId,
        gameAnswerDocId(game.id, game.questionIndex, player.id),
        {
          roomId: game.id,
          kind: 'game_answer',
          revision: 1,
          expiresAt: game.expiresAt,
          payloadJson: JSON.stringify(answerRecord),
          updatedAt: new Date().toISOString(),
        },
      )
    } catch (err) {
      if (err instanceof AppwriteRestError && err.status === 409) {
        throw new Error('You already answered this question')
      }
      throw err
    }
  }

  game.answers.push(answerRecord)

  if (!questionAnswers) {
    questionAnswers = new Map()
    game.answersByQuestion.set(question.id, questionAnswers)
  }
  questionAnswers.set(player.id, answerRecord)

  let qRoundScores = game.roundScoresByQuestion.get(question.id)
  if (!qRoundScores) {
    qRoundScores = new Map()
    game.roundScoresByQuestion.set(question.id, qRoundScores)
  }
  qRoundScores.set(player.id, {
    earnedScore: score,
    baseScore,
    speedBonus,
    streakBonus,
    streak: player.streak,
    isCorrect: isFullCorrect,
    isPartial,
    multiplier,
  })

  game.revision += 1
  if (questionAnswers.size === game.players.length) {
    finalizeQuestionReveal(game)
  } else {
    publishGame(game, 'host')
  }

  if (isAppwriteServerEnabled()) {
    // Re-check authoritative answer count in Appwrite in case two players answered at the exact same moment
    if (!game.isAnswerRevealed) {
      try {
        const latest = await listDocs<{ kind?: string; payloadJson?: string }>(APPWRITE_CONFIG.liveRoomsCollectionId, [
          Query.equal('roomId', [game.id]),
          Query.limit(500),
        ])
        const playerCount = latest.documents.filter((d) => d.kind === 'game_player').length
        const roundAnswers = latest.documents.filter((d) => {
          if (d.kind !== 'game_answer' || typeof d.payloadJson !== 'string') return false
          try {
            return (JSON.parse(d.payloadJson) as PersistedAnswerRecord).questionOrder === game.questionIndex
          } catch {
            return false
          }
        }).length
        if (playerCount > 0 && roundAnswers >= playerCount) {
          const fresh = await getGame(game.id)
          if (fresh && !fresh.isAnswerRevealed && fresh.phase === 'quiz') {
            finalizeQuestionReveal(fresh)
            await persistGameRoom(fresh)
            return
          }
        }
      } catch {
        // Non-fatal: still persist below
      }
    }
    await persistGameRoom(game)
  }
}

export function playerView(game: StoredGame, player?: Player): PlayerGameView {
  const question = game.phase === 'quiz' ? game.quiz.questions[game.questionIndex] : null
  const results = game.phase === 'result' && player ? gameResults(game) : null
  const playerRankIndex = results ? results.findIndex((result) => result.id === player?.id) : -1
  const playerResult = playerRankIndex >= 0 && results ? results[playerRankIndex] : null
  const answer = player && question ? game.answersByQuestion.get(question.id)?.get(player.id) : undefined

  return {
    revision: game.revision,
    serverNow: Date.now(),
    phase: game.phase,
    quizName: game.quiz.name,
    questionCount: game.quiz.questions.length,
    questionIndex: game.questionIndex,
    questionStartedAt: game.questionStartedAt,
    choiceRevealMs: game.choiceRevealMs,
    answerTimeMs: game.answerTimeMs,
    isAnswerRevealed: game.isAnswerRevealed,
    question: question
      ? {
          id: question.id,
          order: question.order,
          type: question.type ?? 'multiple_choice',
          body: question.body,
          ...(question.imageUrl ? { imageUrl: question.imageUrl } : {}),
          ...(question.codeSnippet ? { codeSnippet: question.codeSnippet } : {}),
          ...(question.codeLanguage ? { codeLanguage: question.codeLanguage } : {}),
          ...(question.pointsMultiplier === 2 ? { pointsMultiplier: 2 as const } : {}),
          choices: question.choices.map((choice) =>
            game.isAnswerRevealed ? choice : { id: choice.id, body: choice.body },
          ),
        }
      : null,
    selectedChoiceId: answer?.choiceId ?? null,
    selectedChoiceIds: answer?.choiceIds ?? (answer?.choiceId ? [answer.choiceId] : []),
    streak: player?.streak ?? 0,
    roundFeedback:
      player && (game.isAnswerRevealed || game.phase === 'leaderboard')
        ? game.lastRoundFeedback.get(player.id) ?? null
        : null,
    partialLeaderboard: game.phase === 'leaderboard' ? partialLeaderboardEntries(game, 5) : [],
    result: playerResult
      ? {
          totalScore: playerResult.totalScore,
          correctCount: playerResult.correctCount,
          bestStreak: playerResult.bestStreak,
          rank: playerRankIndex + 1,
        }
      : null,
  }
}

export function hostView(game: StoredGame): HostGameView {
  const currentQuestion = game.quiz.questions[game.questionIndex]
  let results: HostGameView['results'] = []
  let correctDistribution: number[] = []
  if (game.phase === 'result') {
    const allResults = gameResults(game)
    const limit =
      game.leaderboardVisibility === 'hide'
        ? 0
        : game.leaderboardVisibility === 'top1'
          ? 1
          : game.leaderboardVisibility === 'top3'
            ? 3
            : game.leaderboardVisibility === 'top10'
              ? 10
              : allResults.length
    results = allResults.slice(0, limit)
    if (game.showDistribution) {
      correctDistribution = Array(game.quiz.questions.length + 1).fill(0) as number[]
      for (const result of allResults) correctDistribution[result.correctCount] += 1
    }
  }

  const topStreakCandidate = [...game.players].sort((a, b) => b.bestStreak - a.bestStreak)[0]
  const topStreakPlayer =
    topStreakCandidate && topStreakCandidate.bestStreak >= 2
      ? { nickname: topStreakCandidate.nickname, streak: topStreakCandidate.bestStreak }
      : null

  const topClimberCandidate = [...game.players].sort((a, b) => b.rankDelta - a.rankDelta)[0]
  const topClimber =
    topClimberCandidate && topClimberCandidate.rankDelta > 0
      ? { nickname: topClimberCandidate.nickname, rankDelta: topClimberCandidate.rankDelta }
      : null

  return {
    revision: game.revision,
    serverNow: Date.now(),
    joinUrl: game.joinUrl,
    phase: game.phase,
    quizName: game.quiz.name,
    classLabel: game.classLabel,
    questionCount: game.quiz.questions.length,
    question: game.phase === 'quiz' ? currentQuestion : null,
    questionIndex: game.questionIndex,
    questionStartedAt: game.questionStartedAt,
    isAnswerRevealed: game.isAnswerRevealed,
    choiceRevealMs: game.choiceRevealMs,
    answerTimeMs: game.answerTimeMs,
    participants:
      game.phase === 'result' && game.leaderboardVisibility === 'hide'
        ? []
        : game.players.map(({ id, nickname }) => ({ id, nickname })),
    answers:
      game.phase === 'result' || game.phase === 'leaderboard' || game.phase === 'cancelled' || game.phase === 'expired'
        ? []
        : [...(game.answersByQuestion.get(currentQuestion.id)?.values() ?? [])],
    results,
    partialLeaderboard: game.phase === 'leaderboard' ? partialLeaderboardEntries(game, 5) : [],
    topStreakPlayer,
    topClimber,
    leaderboardVisibility: game.leaderboardVisibility,
    showDistribution: game.showDistribution,
    correctDistribution,
    sessionReport: game.phase === 'result' ? game.sessionReport : null,
  }
}
