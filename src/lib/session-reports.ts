import 'server-only'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { SessionReport } from '@/types/game'

const reportsDirectory = path.join(process.cwd(), 'data', 'session-reports')

function safeId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128) || 'session'
}

export async function saveSessionReport(report: SessionReport): Promise<SessionReport> {
  await mkdir(reportsDirectory, { recursive: true })
  const id = safeId(report.id)
  const sanitized: SessionReport = { ...report, id }
  await writeFile(
    path.join(reportsDirectory, `${id}.json`),
    `${JSON.stringify(sanitized, null, 2)}\n`,
    { mode: 0o600 },
  )
  return sanitized
}

export async function listSessionReports(): Promise<SessionReport[]> {
  try {
    const entries = await readdir(reportsDirectory, { withFileTypes: true })
    const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    const reports = await Promise.all(
      files.map(async (entry) => {
        try {
          const raw = await readFile(path.join(reportsDirectory, entry.name), 'utf8')
          return JSON.parse(raw) as SessionReport
        } catch {
          return null
        }
      }),
    )
    return reports
      .filter((item): item is SessionReport => item !== null)
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

export async function updateSessionClassLabel(id: string, classLabel: string): Promise<SessionReport | null> {
  const file = path.join(reportsDirectory, `${safeId(id)}.json`)
  try {
    const existing = JSON.parse(await readFile(file, 'utf8')) as SessionReport
    const updated: SessionReport = {
      ...existing,
      classLabel: classLabel.trim().slice(0, 80),
    }
    await writeFile(file, `${JSON.stringify(updated, null, 2)}\n`, { mode: 0o600 })
    return updated
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}
