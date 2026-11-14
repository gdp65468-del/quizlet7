import 'server-only'
import { randomUUID } from 'node:crypto'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { APPWRITE_CONFIG } from '@/lib/appwrite'
import { getDoc, isAppwriteServerEnabled, isServerlessRuntime, upsertDoc } from '@/lib/appwrite-server'
import type { LeaderboardVisibility } from '@/types/game'

export type QuizSettings = {
  choiceRevealSeconds: number
  answerTimeSeconds: number
  leaderboardVisibility: LeaderboardVisibility
  showDistribution: boolean
  saveSession: boolean
}

export const DEFAULT_QUIZ_SETTINGS: QuizSettings = {
  choiceRevealSeconds: 5,
  answerTimeSeconds: 20,
  leaderboardVisibility: 'all',
  showDistribution: true,
  saveSession: false,
}

const SETTINGS_DOC_ID = 'global_quiz_settings'
const settingsPath = path.join(process.cwd(), '.quiz-settings.json')
const tmpSettingsPath = path.join(os.tmpdir(), 'quizlet-quiz-settings.json')

export function parseQuizSettings(value: unknown): QuizSettings {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid quiz settings')
  }
  const { choiceRevealSeconds, answerTimeSeconds, leaderboardVisibility = 'all', showDistribution = true, saveSession = false } = value as Record<string, unknown>
  if (!Number.isInteger(choiceRevealSeconds) || (choiceRevealSeconds as number) < 0 || (choiceRevealSeconds as number) > 20) {
    throw new Error('Choice reveal delay must be a whole number from 0 to 20 seconds')
  }
  if (!Number.isInteger(answerTimeSeconds) || (answerTimeSeconds as number) < 10 || (answerTimeSeconds as number) > 100) {
    throw new Error('Answer time must be a whole number from 10 to 100 seconds')
  }
  if (!['hide', 'top1', 'top3', 'top10', 'all'].includes(leaderboardVisibility as string)) {
    throw new Error('Choose a valid leaderboard display option')
  }
  if (typeof showDistribution !== 'boolean') {
    throw new Error('Choose whether to show the correct-answer distribution')
  }
  if (typeof saveSession !== 'boolean') {
    throw new Error('Choose whether to save the session')
  }
  return {
    choiceRevealSeconds: choiceRevealSeconds as number,
    answerTimeSeconds: answerTimeSeconds as number,
    leaderboardVisibility: leaderboardVisibility as LeaderboardVisibility,
    showDistribution,
    saveSession,
  }
}

async function readLocalSettingsFile(filePath: string): Promise<QuizSettings | null> {
  try {
    return parseQuizSettings(JSON.parse(await readFile(filePath, 'utf8')))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

async function writeLocalSettingsFile(filePath: string, settings: QuizSettings): Promise<void> {
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`
  try {
    await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 })
    await rename(temporaryPath, filePath)
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => {})
    throw error
  }
}

export async function getQuizSettings(): Promise<QuizSettings> {
  if (isAppwriteServerEnabled()) {
    try {
      const doc = await getDoc<{ payloadJson?: string }>(APPWRITE_CONFIG.liveRoomsCollectionId, SETTINGS_DOC_ID)
      if (doc && typeof doc.payloadJson === 'string') {
        return parseQuizSettings(JSON.parse(doc.payloadJson))
      }
    } catch (error) {
      console.warn('Could not read quiz settings from Appwrite:', error)
    }
  }

  return (await readLocalSettingsFile(tmpSettingsPath)) ?? (await readLocalSettingsFile(settingsPath)) ?? DEFAULT_QUIZ_SETTINGS
}

export async function saveQuizSettings(value: unknown): Promise<QuizSettings> {
  const settings = parseQuizSettings(value)

  if (isAppwriteServerEnabled()) {
    await upsertDoc(APPWRITE_CONFIG.liveRoomsCollectionId, SETTINGS_DOC_ID, {
      roomId: 'SETTINGS',
      kind: 'settings',
      revision: 1,
      expiresAt: 0,
      payloadJson: JSON.stringify(settings),
      updatedAt: new Date().toISOString(),
    })
  }

  if (!isServerlessRuntime()) {
    try {
      await writeLocalSettingsFile(settingsPath, settings)
      return settings
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'EROFS' && code !== 'EACCES') {
        if (!isAppwriteServerEnabled()) throw error
      }
    }
  }

  if (!isAppwriteServerEnabled()) {
    await writeLocalSettingsFile(tmpSettingsPath, settings)
  }

  return settings
}
