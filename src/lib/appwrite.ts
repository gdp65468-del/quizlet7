import { Account, Client, Databases } from 'appwrite'

export const APPWRITE_CONFIG = {
  endpoint: process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1',
  projectId: (process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || '').trim(),
  databaseId: process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || 'quizlet_db',
  quizzesCollectionId: process.env.NEXT_PUBLIC_APPWRITE_QUIZZES_COLLECTION_ID || 'quizzes',
  sessionsCollectionId: process.env.NEXT_PUBLIC_APPWRITE_SESSIONS_COLLECTION_ID || 'gameSessions',
}

export const isAppwriteConfigured = APPWRITE_CONFIG.projectId.length > 0

let cachedClient: Client | null = null
let cachedAccount: Account | null = null
let cachedDatabases: Databases | null = null

export function getAppwriteServices(): {
  client: Client
  account: Account
  databases: Databases
} | null {
  if (!isAppwriteConfigured) return null
  if (!cachedClient) {
    cachedClient = new Client()
      .setEndpoint(APPWRITE_CONFIG.endpoint)
      .setProject(APPWRITE_CONFIG.projectId)
    cachedAccount = new Account(cachedClient)
    cachedDatabases = new Databases(cachedClient)
  }
  return {
    client: cachedClient,
    account: cachedAccount!,
    databases: cachedDatabases!,
  }
}

export function toAppwriteDocId(raw: string): string {
  const clean = raw.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^[^a-zA-Z0-9]+/, '')
  if (clean.length > 0 && clean.length <= 36) return clean

  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 0x01000193) >>> 0
    h2 = Math.imul(h2 ^ (ch + i), 0x85ebca6b) >>> 0
  }
  const suffix = `${h1.toString(36)}${h2.toString(36)}`.slice(0, 14)
  const prefix = (clean.slice(0, 19) || 'doc').replace(/[^a-zA-Z0-9_-]/g, '')
  const combined = `${prefix}_${suffix}`.replace(/^[^a-zA-Z0-9]+/, 'd')
  return combined.slice(0, 36) || `d_${suffix}`.slice(0, 36)
}
