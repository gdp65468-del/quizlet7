import 'server-only'
import { randomBytes, randomInt, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
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

type GameAudience = 'host' | 'all'
type StoredGame = {
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
  completionPromise: Promise<void> | null
  phase: GamePhase
  questionIndex: number
  questionStartedAt: number | null
  isAnswerRevealed: boolean
  players: Player[]
  answers: Answer[]
  answersByQuestion: Map<string, Map<string, Answer>>
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

function isExpired(game: StoredGame, now: number) {
  return game.closedAt != null && now - game.closedAt > CLOSED_TTL_MS
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

function expireGameIfDue(game: StoredGame, now = Date.now()) {
  if (game.closedAt !== null || now < game.expiresAt) return
  clearRevealTimer(game)
  clearExpiryTimer(game)
  game.phase = 'expired'
  game.closedAt = now
  game.revision += 1
  publishGame(game, 'all')
}

function scheduleExpiry(game: StoredGame) {
  if (game.expiryTimer || game.closedAt !== null) return
  game.expiryTimer = setTimeout(() => {
    game.expiryTimer = null
    expireGameIfDue(game)
  }, Math.max(0, game.expiresAt - Date.now()))
  game.expiryTimer.unref()
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

export function createGame(quiz: QuizSet, origin: string | null, settings: QuizSettings, classLabel = '') {
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
  for (let offset = 0; offset < 9000; offset += 1) {
    const code = String(1000 + ((firstCode - 1000 + offset) % 9000))
    if (!games.has(code)) {
      id = code
      break
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
  games.set(game.id, game)
  scheduleExpiry(game)
  return { id: game.id, hostToken: game.hostToken }
}

export function getGame(id: string) {
  const game = games.get(id)
  if (!game) return undefined
  ensureRealtimeState(game)
  const now = Date.now()
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

function clearRevealTimer(game: StoredGame) {
  if (game.revealTimer) clearTimeout(game.revealTimer)
  game.revealTimer = null
}

function scheduleReveal(game: StoredGame) {
  clearRevealTimer(game)
  const questionIndex = game.questionIndex
  const revealAt = (game.questionStartedAt ?? Date.now()) + game.choiceRevealMs + game.answerTimeMs
  game.revealTimer = setTimeout(() => {
    game.revealTimer = null
    if (game.phase === 'quiz' && game.questionIndex === questionIndex) updateTimedState(game)
  }, Math.max(0, revealAt - Date.now()))
  game.revealTimer.unref()
}

function sortedStandings(game: StoredGame) {
  return [...game.players].sort(
    (a, b) => b.totalScore - a.totalScore || b.correctCount - a.correctCount || a.nickname.localeCompare(b.nickname),
  )
}

function snapshotPreRoundRanks(game: StoredGame) {
  const sorted = sortedStandings(game)
  sorted.forEach((player, idx) => {
    player.previousRank = game.questionIndex === 0 ? null : idx + 1
  })
}

function finalizeQuestionReveal(game: StoredGame) {
  if (game.isAnswerRevealed) return
  game.isAnswerRevealed = true
  clearRevealTimer(game)

  const question = game.quiz.questions[game.questionIndex]
  const qAnswers = game.answersByQuestion.get(question.id)
  const qRoundScores = game.roundScoresByQuestion.get(question.id)

  for (const player of game.players) {
    if (!qAnswers?.has(player.id)) {
      player.streak = 0
    }
  }

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

  game.lastRoundFeedback = nextFeedback
  game.revision += 1
  publishGame(game, 'all')
}

function updateTimedState(game: StoredGame) {
  if (
    game.phase === 'quiz' &&
    !game.isAnswerRevealed &&
    game.questionStartedAt !== null &&
    Date.now() >= game.questionStartedAt + game.choiceRevealMs + game.answerTimeMs
  ) {
    finalizeQuestionReveal(game)
  }
}

export function isHost(game: StoredGame, hostToken: string | null) {
  return !!hostToken && hostToken === game.hostToken
}

export function closeGame(game: StoredGame) {
  expireGameIfDue(game)
  if (game.phase !== 'result') throw new Error('This session has not finished yet')
  clearRevealTimer(game)
  clearExpiryTimer(game)
  game.subscribers.clear()
  games.delete(game.id)
}

export function cancelGame(game: StoredGame) {
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
}

export function joinGame(game: StoredGame, nickname: string) {
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
    totalScore: 0,
    correctCount: 0,
    streak: 0,
    bestStreak: 0,
    previousRank: null,
    rankDelta: 0,
  }
  game.players.push(player)
  game.revision += 1
  publishGame(game, 'host')
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

  if (!game.saveSession) return
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
    return
  }
  if (action === 'reveal' && game.phase === 'quiz') {
    finalizeQuestionReveal(game)
    return
  }
  if (action === 'leaderboard' && game.phase === 'quiz' && game.isAnswerRevealed) {
    if (game.questionIndex + 1 < game.quiz.questions.length) {
      game.phase = 'leaderboard'
      game.revision += 1
      publishGame(game, 'all')
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
    return
  }
  throw new Error('Action is unavailable in the current game phase')
}

export function submitAnswer(game: StoredGame, player: Player, rawChoiceInput: string | string[]) {
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

  const answer: Answer = {
    participantId: player.id,
    questionId: question.id,
    choiceId: uniqueIds[0],
    choiceIds: uniqueIds,
    score,
    isCorrect: isFullCorrect,
    streak: player.streak,
  }
  game.answers.push(answer)

  if (!questionAnswers) {
    questionAnswers = new Map()
    game.answersByQuestion.set(question.id, questionAnswers)
  }
  questionAnswers.set(player.id, answer)

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
