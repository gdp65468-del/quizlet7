import 'server-only'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { APPWRITE_CONFIG } from '@/lib/appwrite'
import {
  isAppwriteServerEnabled,
  isServerlessRuntime,
  listDocs,
  ownerPermissions,
  Query,
  toAppwriteDocId,
  updateDoc,
  upsertDoc,
} from '@/lib/appwrite-server'
import type { SessionReport } from '@/types/game'

const reportsDirectory = path.join(process.cwd(), 'data', 'session-reports')
const tmpReportsDirectory = path.join(os.tmpdir(), 'quizlet-session-reports')

function safeId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128) || 'session'
}

function safeParseJson<T>(raw: unknown, fallback: T): T {
  if (Array.isArray(raw)) return raw as T
  if (typeof raw !== 'string' || !raw.trim()) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function reportFromAppwriteDoc(doc: Record<string, unknown> & { $id: string; $createdAt: string }): SessionReport {
  return {
    id: String(doc.sessionId ?? doc.$id),
    quizId: String(doc.quizId ?? ''),
    quizName: String(doc.quizName ?? ''),
    category: String(doc.category ?? ''),
    classLabel: String(doc.classLabel ?? ''),
    completedAt: typeof doc.completedAt === 'string' && doc.completedAt ? doc.completedAt : doc.$createdAt,
    questionCount: Number(doc.questionCount ?? 0),
    participantCount: Number(doc.participantCount ?? 0),
    averageAccuracy: Number(doc.averageAccuracy ?? 0),
    topScorer: String(doc.topScorer ?? ''),
    leaderboard: safeParseJson<SessionReport['leaderboard']>(doc.leaderboardJson ?? doc.leaderboard, []),
    questionStats: safeParseJson<SessionReport['questionStats']>(doc.questionStatsJson ?? doc.questionStats, []),
  }
}

async function writeReportToDir(dir: string, id: string, sanitized: SessionReport): Promise<void> {
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, `${id}.json`), `${JSON.stringify(sanitized, null, 2)}\n`, { mode: 0o600 })
}

async function readReportsFromDir(dir: string): Promise<SessionReport[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    const reports = await Promise.all(
      files.map(async (entry) => {
        try {
          const raw = await readFile(path.join(dir, entry.name), 'utf8')
          return JSON.parse(raw) as SessionReport
        } catch {
          return null
        }
      }),
    )
    return reports.filter((item): item is SessionReport => item !== null)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    return []
  }
}

export async function saveSessionReport(report: SessionReport, ownerId = 'server'): Promise<SessionReport> {
  const id = safeId(report.id)
  const sanitized: SessionReport = { ...report, id }
  const cleanOwner = ownerId.trim() || 'server'

  if (isAppwriteServerEnabled()) {
    const docId = toAppwriteDocId(`sess_${id}`)
    const permissions = cleanOwner === 'server' ? [] : ownerPermissions(cleanOwner)
    await upsertDoc(
      APPWRITE_CONFIG.sessionsCollectionId,
      docId,
      {
        ownerId: cleanOwner,
        sessionId: id.slice(0, 128),
        quizId: String(sanitized.quizId).slice(0, 128),
        quizName: String(sanitized.quizName).slice(0, 140),
        category: String(sanitized.category || 'general').slice(0, 64),
        classLabel: String(sanitized.classLabel || '').slice(0, 80),
        completedAt: sanitized.completedAt || new Date().toISOString(),
        questionCount: Math.max(1, Math.min(100, sanitized.questionCount)),
        participantCount: Math.max(0, Math.min(500, sanitized.participantCount)),
        averageAccuracy: Math.max(0, Math.min(100, Number(sanitized.averageAccuracy.toFixed(1)))),
        topScorer: String(sanitized.topScorer || '').slice(0, 64),
        leaderboardJson: JSON.stringify(sanitized.leaderboard.slice(0, 500)).slice(0, 65535),
        questionStatsJson: JSON.stringify(sanitized.questionStats.slice(0, 100)).slice(0, 65535),
      },
      permissions,
    )
  }

  // Only write local filesystem reports for global admin ('server') or when Appwrite isn't configured
  if (cleanOwner === 'server' || !isAppwriteServerEnabled()) {
    if (!isServerlessRuntime()) {
      try {
        await writeReportToDir(reportsDirectory, id, sanitized)
        return sanitized
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code !== 'EROFS' && code !== 'EACCES') {
          if (!isAppwriteServerEnabled()) throw error
        }
      }
    }

    if (!isAppwriteServerEnabled()) {
      await writeReportToDir(tmpReportsDirectory, id, sanitized).catch(() => {})
    }
  }

  return sanitized
}

export async function listSessionReports(ownerId = 'server'): Promise<SessionReport[]> {
  const byId = new Map<string, SessionReport>()
  const cleanOwner = ownerId.trim() || 'server'

  if (isAppwriteServerEnabled()) {
    try {
      const resp = await listDocs(APPWRITE_CONFIG.sessionsCollectionId, [
        Query.equal('ownerId', [cleanOwner]),
        Query.limit(100),
      ])
      for (const doc of resp.documents) {
        if (doc.ownerId !== cleanOwner) continue
        const report = reportFromAppwriteDoc(doc)
        byId.set(report.id, report)
      }
    } catch (error) {
      console.warn('Could not list session reports from Appwrite:', error)
    }
  }

  if (cleanOwner === 'server') {
    const localLists = await Promise.all([
      readReportsFromDir(reportsDirectory),
      readReportsFromDir(tmpReportsDirectory),
    ])

    for (const list of localLists) {
      for (const report of list) {
        if (!byId.has(report.id)) {
          byId.set(report.id, report)
        }
      }
    }
  }

  return Array.from(byId.values()).sort((a, b) => b.completedAt.localeCompare(a.completedAt))
}

export async function updateSessionClassLabel(
  id: string,
  classLabel: string,
  ownerId = 'server',
): Promise<SessionReport | null> {
  const cleanId = safeId(id)
  const cleanLabel = classLabel.trim().slice(0, 80)
  const cleanOwner = ownerId.trim() || 'server'
  let updatedReport: SessionReport | null = null

  if (isAppwriteServerEnabled()) {
    try {
      const matches = await listDocs(APPWRITE_CONFIG.sessionsCollectionId, [
        Query.equal('sessionId', [cleanId]),
        Query.equal('ownerId', [cleanOwner]),
        Query.limit(10),
      ])
      if (matches.documents.length > 0) {
        for (const doc of matches.documents) {
          if (doc.ownerId !== cleanOwner) continue
          const updatedDoc = await updateDoc(APPWRITE_CONFIG.sessionsCollectionId, doc.$id, {
            classLabel: cleanLabel,
          })
          updatedReport = reportFromAppwriteDoc(updatedDoc)
        }
      }
    } catch (error) {
      console.warn('Could not update session class label in Appwrite:', error)
    }
  }

  if (cleanOwner === 'server') {
    for (const dir of [reportsDirectory, tmpReportsDirectory]) {
      const file = path.join(dir, `${cleanId}.json`)
      try {
        const existing = JSON.parse(await readFile(file, 'utf8')) as SessionReport
        const updated: SessionReport = { ...existing, classLabel: cleanLabel }
        await writeFile(file, `${JSON.stringify(updated, null, 2)}\n`, { mode: 0o600 }).catch(() => {})
        updatedReport ??= updated
      } catch {
        // Ignore missing or read-only local files
      }
    }
  }

  return updatedReport
}
