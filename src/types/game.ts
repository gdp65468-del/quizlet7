export type QuestionType = 'multiple_choice' | 'true_false' | 'multi_select'
export type Choice = { id: string; body: string; is_correct: boolean }
export type Question = {
  id: string
  order: number
  type?: QuestionType
  body: string
  imageUrl?: string
  codeSnippet?: string
  codeLanguage?: string
  pointsMultiplier?: 1 | 2
  choices: Choice[]
}
export type QuizSet = { id: string; name: string; description: string; questions: Question[] }
export type QuizSummary = Pick<QuizSet, 'id' | 'name' | 'description'> & { questionCount: number }
export type Participant = { id: string; nickname: string }
export type Answer = {
  participantId: string
  questionId: string
  choiceId: string
  choiceIds?: string[]
  score: number
  isCorrect?: boolean
  streak?: number
}
export type GameResult = Participant & {
  totalScore: number
  correctCount: number
  bestStreak: number
  rankDelta: number
}
export type PlayerResult = { totalScore: number; correctCount: number; bestStreak: number; rank: number }
export type LeaderboardVisibility = 'hide' | 'top1' | 'top3' | 'top10' | 'all'
export type GamePhase = 'lobby' | 'quiz' | 'leaderboard' | 'result' | 'cancelled' | 'expired'
export type PlayerQuestion = Omit<Question, 'choices'> & { choices: Omit<Choice, 'is_correct'>[] | Choice[] }

export type PlayerRoundFeedback = {
  earnedScore: number
  baseScore: number
  speedBonus: number
  streakBonus: number
  streak: number
  isCorrect: boolean
  isPartial: boolean
  multiplier: number
  rank: number
  totalPlayers: number
  pointsBehindNext: number | null
  pointsAheadNext: number | null
  rankDelta: number
}

export type PartialLeaderboardEntry = {
  id: string
  nickname: string
  totalScore: number
  streak: number
  rank: number
  rankDelta: number
}

export type QuestionStat = {
  questionId: string
  questionBody: string
  correctCount: number
  totalAnswers: number
  accuracyPercent: number
}

export type SessionReport = {
  id: string
  quizId: string
  quizName: string
  category: string
  classLabel: string
  completedAt: string
  questionCount: number
  participantCount: number
  averageAccuracy: number
  topScorer: string
  leaderboard: Array<{
    id: string
    nickname: string
    totalScore: number
    correctCount: number
    bestStreak: number
  }>
  questionStats: QuestionStat[]
}

export type PlayerGameView = {
  revision: number
  serverNow: number
  phase: GamePhase
  quizName: string
  questionCount: number
  questionIndex: number
  questionStartedAt: number | null
  choiceRevealMs: number
  answerTimeMs: number
  isAnswerRevealed: boolean
  question: PlayerQuestion | null
  selectedChoiceId: string | null
  selectedChoiceIds: string[]
  streak: number
  roundFeedback: PlayerRoundFeedback | null
  partialLeaderboard: PartialLeaderboardEntry[]
  result: PlayerResult | null
}

export type HostGameView = {
  revision: number
  serverNow: number
  joinUrl: string | null
  phase: GamePhase
  quizName: string
  classLabel: string
  questionCount: number
  question: Question | null
  questionIndex: number
  questionStartedAt: number | null
  choiceRevealMs: number
  answerTimeMs: number
  isAnswerRevealed: boolean
  participants: Participant[]
  answers: Answer[]
  results: GameResult[]
  partialLeaderboard: PartialLeaderboardEntry[]
  topStreakPlayer: { nickname: string; streak: number } | null
  topClimber: { nickname: string; rankDelta: number } | null
  leaderboardVisibility: LeaderboardVisibility
  showDistribution: boolean
  correctDistribution: number[]
  sessionReport: SessionReport | null
}
