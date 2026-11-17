import 'server-only'
import { Query } from 'appwrite'
import { APPWRITE_CONFIG, toAppwriteDocId } from '@/lib/appwrite'

export { Query, toAppwriteDocId }

export class AppwriteRestError extends Error {
  status: number
  type: string

  constructor(status: number, type: string, message: string) {
    super(message)
    this.status = status
    this.type = type
  }
}

export type AppwriteDoc<T = Record<string, unknown>> = T & {
  $id: string
  $createdAt: string
  $updatedAt: string
}

function serverApiKey(): string {
  return (process.env.APPWRITE_API_KEY || '').trim()
}

export function isAppwriteServerEnabled(): boolean {
  return Boolean(APPWRITE_CONFIG.projectId && serverApiKey())
}

export function isServerlessRuntime(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.VERCEL_ENV ||
      process.env.NETLIFY ||
      process.env.DEPLOY_URL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.LAMBDA_TASK_ROOT,
  )
}

export async function appwriteRequest<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  apiPath: string,
  options?: {
    queries?: string[]
    body?: Record<string, unknown>
  },
): Promise<T> {
  const key = serverApiKey()
  if (!APPWRITE_CONFIG.projectId || !key) {
    throw new Error('APPWRITE_API_KEY is not configured')
  }

  const base = APPWRITE_CONFIG.endpoint.replace(/\/+$/, '')
  const url = new URL(`${base}${apiPath}`)
  if (options?.queries?.length) {
    options.queries.forEach((q, idx) => {
      url.searchParams.append(`queries[${idx}]`, q)
    })
  }

  const response = await fetch(url.toString(), {
    method,
    cache: 'no-store',
    headers: {
      'X-Appwrite-Project': APPWRITE_CONFIG.projectId,
      'X-Appwrite-Key': key,
      Accept: 'application/json',
      ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
  })

  if (response.status === 204) {
    return undefined as T
  }

  const text = await response.text()
  let parsed: Record<string, unknown> = {}
  if (text) {
    try {
      parsed = JSON.parse(text) as Record<string, unknown>
    } catch {
      parsed = { message: text }
    }
  }

  if (!response.ok) {
    throw new AppwriteRestError(
      response.status,
      typeof parsed.type === 'string' ? parsed.type : 'appwrite_error',
      typeof parsed.message === 'string' ? parsed.message : `Appwrite HTTP ${response.status}`,
    )
  }

  return parsed as T
}

const globalSchema = globalThis as typeof globalThis & {
  __appwriteSchemaPromise?: Promise<void>
  __appwriteSchemaReady?: boolean
  __appwriteSchemaSkipUntil?: number
}

async function ensureCollection(
  collectionId: string,
  name: string,
  permissions: string[],
  attributes: Array<
    | { kind: 'string'; key: string; size: number; required: boolean }
    | { kind: 'integer'; key: string; required: boolean }
    | { kind: 'float'; key: string; required: boolean }
  >,
  indexes: Array<{ key: string; attributes: string[] }>,
) {
  const dbPath = `/databases/${encodeURIComponent(APPWRITE_CONFIG.databaseId)}`
  const colPath = `${dbPath}/collections/${encodeURIComponent(collectionId)}`

  let createdAnyAttribute = false

  try {
    await appwriteRequest('GET', colPath)
  } catch (err) {
    if (err instanceof AppwriteRestError && err.status === 404) {
      await appwriteRequest('POST', `${dbPath}/collections`, {
        body: {
          collectionId,
          name,
          permissions,
          documentSecurity: true,
          enabled: true,
        },
      })
      createdAnyAttribute = true
    } else {
      throw err
    }
  }

  const existingAttrsResp = await appwriteRequest<{ attributes?: Array<{ key: string; status?: string }> }>(
    'GET',
    `${colPath}/attributes`,
  ).catch(() => ({ attributes: [] }))
  const existingKeys = new Set((existingAttrsResp.attributes ?? []).map((a) => a.key))

  for (const attr of attributes) {
    if (existingKeys.has(attr.key)) continue
    createdAnyAttribute = true
    try {
      if (attr.kind === 'string') {
        await appwriteRequest('POST', `${colPath}/attributes/string`, {
          body: {
            key: attr.key,
            size: attr.size,
            required: attr.required,
          },
        })
      } else if (attr.kind === 'integer') {
        await appwriteRequest('POST', `${colPath}/attributes/integer`, {
          body: {
            key: attr.key,
            required: attr.required,
          },
        })
      } else {
        await appwriteRequest('POST', `${colPath}/attributes/float`, {
          body: {
            key: attr.key,
            required: attr.required,
          },
        })
      }
    } catch (err) {
      if (!(err instanceof AppwriteRestError && err.status === 409)) {
        throw err
      }
    }
  }

  if (createdAnyAttribute) {
    // Wait briefly for Appwrite to mark newly created attributes available before creating indexes / writing docs
    for (let attempt = 0; attempt < 15; attempt += 1) {
      const attrs = await appwriteRequest<{ attributes?: Array<{ key: string; status?: string }> }>(
        'GET',
        `${colPath}/attributes`,
      ).catch(() => ({ attributes: [] }))
      const allReady = attributes.every((req) =>
        (attrs.attributes ?? []).some((a) => a.key === req.key && a.status === 'available'),
      )
      if (allReady) break
      await new Promise((resolve) => setTimeout(resolve, 350))
    }
  }

  const existingIndexesResp = await appwriteRequest<{ indexes?: Array<{ key: string }> }>(
    'GET',
    `${colPath}/indexes`,
  ).catch(() => ({ indexes: [] }))
  const existingIndexKeys = new Set((existingIndexesResp.indexes ?? []).map((i) => i.key))

  for (const idx of indexes) {
    if (existingIndexKeys.has(idx.key)) continue
    try {
      await appwriteRequest('POST', `${colPath}/indexes`, {
        body: {
          key: idx.key,
          type: 'key',
          attributes: idx.attributes,
          orders: idx.attributes.map(() => 'ASC'),
        },
      })
    } catch (err) {
      if (!(err instanceof AppwriteRestError && err.status === 409)) {
        // Non-fatal if index already exists or is pending
        console.warn(`Could not create index ${idx.key} on ${collectionId}:`, err)
      }
    }
  }
}

export async function ensureAppwriteSchema(): Promise<void> {
  if (!isAppwriteServerEnabled() || globalSchema.__appwriteSchemaReady) return
  if (globalSchema.__appwriteSchemaSkipUntil && Date.now() < globalSchema.__appwriteSchemaSkipUntil) {
    return
  }
  if (globalSchema.__appwriteSchemaPromise) {
    return globalSchema.__appwriteSchemaPromise
  }

  globalSchema.__appwriteSchemaPromise = (async () => {
    try {
      const dbPath = `/databases/${encodeURIComponent(APPWRITE_CONFIG.databaseId)}`
      try {
        await appwriteRequest('GET', dbPath)
      } catch (err) {
        if (err instanceof AppwriteRestError && err.status === 404) {
          await appwriteRequest('POST', '/databases', {
            body: {
              databaseId: APPWRITE_CONFIG.databaseId,
              name: 'Quizlet Database',
              enabled: true,
            },
          })
        } else {
          throw err
        }
      }

      await ensureCollection(
        APPWRITE_CONFIG.liveRoomsCollectionId,
        'Live Rooms & Serverless State',
        [],
        [
          { kind: 'string', key: 'roomId', size: 128, required: true },
          { kind: 'string', key: 'kind', size: 32, required: true },
          { kind: 'integer', key: 'revision', required: true },
          { kind: 'integer', key: 'expiresAt', required: true },
          { kind: 'string', key: 'payloadJson', size: 500000, required: true },
          { kind: 'string', key: 'updatedAt', size: 64, required: true },
        ],
        [
          { key: 'idx_roomId', attributes: ['roomId'] },
          { key: 'idx_kind', attributes: ['kind'] },
        ],
      )

      await ensureCollection(
        APPWRITE_CONFIG.quizzesCollectionId,
        'Quizzes',
        ['create("users")'],
        [
          { kind: 'string', key: 'ownerId', size: 128, required: true },
          { kind: 'string', key: 'quizId', size: 128, required: true },
          { kind: 'string', key: 'category', size: 64, required: true },
          { kind: 'string', key: 'slug', size: 64, required: true },
          { kind: 'string', key: 'name', size: 140, required: true },
          { kind: 'string', key: 'description', size: 500, required: false },
          { kind: 'integer', key: 'questionCount', required: true },
          { kind: 'string', key: 'questionsJson', size: 65535, required: true },
          { kind: 'string', key: 'updatedAt', size: 64, required: false },
        ],
        [{ key: 'idx_ownerId', attributes: ['ownerId'] }],
      )

      await ensureCollection(
        APPWRITE_CONFIG.sessionsCollectionId,
        'Game Sessions',
        ['create("users")'],
        [
          { kind: 'string', key: 'ownerId', size: 128, required: true },
          { kind: 'string', key: 'sessionId', size: 128, required: true },
          { kind: 'string', key: 'quizId', size: 128, required: true },
          { kind: 'string', key: 'quizName', size: 140, required: true },
          { kind: 'string', key: 'category', size: 64, required: false },
          { kind: 'string', key: 'classLabel', size: 80, required: false },
          { kind: 'string', key: 'completedAt', size: 64, required: true },
          { kind: 'integer', key: 'questionCount', required: true },
          { kind: 'integer', key: 'participantCount', required: true },
          { kind: 'float', key: 'averageAccuracy', required: true },
          { kind: 'string', key: 'topScorer', size: 64, required: false },
          { kind: 'string', key: 'leaderboardJson', size: 65535, required: true },
          { kind: 'string', key: 'questionStatsJson', size: 65535, required: true },
        ],
        [{ key: 'idx_ownerId', attributes: ['ownerId'] }],
      )

      globalSchema.__appwriteSchemaReady = true
    } catch (err) {
      // If API key lacks schema scopes (401/403), briefly defer retries so document-only keys proceed and updated keys self-heal
      if (err instanceof AppwriteRestError && (err.status === 401 || err.status === 403)) {
        globalSchema.__appwriteSchemaSkipUntil = Date.now() + 10_000
        globalSchema.__appwriteSchemaPromise = undefined
        return
      }
      globalSchema.__appwriteSchemaPromise = undefined
      throw err
    }
  })()

  return globalSchema.__appwriteSchemaPromise
}

function docsPath(collectionId: string, documentId?: string): string {
  const base = `/databases/${encodeURIComponent(APPWRITE_CONFIG.databaseId)}/collections/${encodeURIComponent(collectionId)}/documents`
  return documentId ? `${base}/${encodeURIComponent(documentId)}` : base
}

export async function getDoc<T = Record<string, unknown>>(
  collectionId: string,
  documentId: string,
): Promise<AppwriteDoc<T> | null> {
  await ensureAppwriteSchema()
  try {
    return await appwriteRequest<AppwriteDoc<T>>('GET', docsPath(collectionId, documentId))
  } catch (err) {
    if (err instanceof AppwriteRestError && err.status === 404) return null
    throw err
  }
}

export async function createDoc<T = Record<string, unknown>>(
  collectionId: string,
  documentId: string,
  data: Record<string, unknown>,
  permissions?: string[],
): Promise<AppwriteDoc<T>> {
  await ensureAppwriteSchema()
  return appwriteRequest<AppwriteDoc<T>>('POST', docsPath(collectionId), {
    body: {
      documentId,
      data,
      ...(permissions ? { permissions } : {}),
    },
  })
}

export async function updateDoc<T = Record<string, unknown>>(
  collectionId: string,
  documentId: string,
  data: Record<string, unknown>,
  permissions?: string[],
): Promise<AppwriteDoc<T>> {
  await ensureAppwriteSchema()
  return appwriteRequest<AppwriteDoc<T>>('PATCH', docsPath(collectionId, documentId), {
    body: {
      data,
      ...(permissions ? { permissions } : {}),
    },
  })
}

export async function upsertDoc<T = Record<string, unknown>>(
  collectionId: string,
  documentId: string,
  data: Record<string, unknown>,
  permissions?: string[],
): Promise<AppwriteDoc<T>> {
  await ensureAppwriteSchema()
  try {
    return await appwriteRequest<AppwriteDoc<T>>('PATCH', docsPath(collectionId, documentId), {
      body: { data },
    })
  } catch (err) {
    if (err instanceof AppwriteRestError && err.status === 404) {
      try {
        return await appwriteRequest<AppwriteDoc<T>>('POST', docsPath(collectionId), {
          body: {
            documentId,
            data,
            ...(permissions ? { permissions } : {}),
          },
        })
      } catch (createErr) {
        if (createErr instanceof AppwriteRestError && createErr.status === 409) {
          return appwriteRequest<AppwriteDoc<T>>('PATCH', docsPath(collectionId, documentId), {
            body: { data },
          })
        }
        throw createErr
      }
    }
    throw err
  }
}

export async function deleteDoc(collectionId: string, documentId: string): Promise<boolean> {
  await ensureAppwriteSchema()
  try {
    await appwriteRequest('DELETE', docsPath(collectionId, documentId))
    return true
  } catch (err) {
    if (err instanceof AppwriteRestError && err.status === 404) return false
    throw err
  }
}

export async function listDocs<T = Record<string, unknown>>(
  collectionId: string,
  queries: string[] = [],
): Promise<{ total: number; documents: Array<AppwriteDoc<T>> }> {
  await ensureAppwriteSchema()
  return appwriteRequest<{ total: number; documents: Array<AppwriteDoc<T>> }>(
    'GET',
    docsPath(collectionId),
    { queries },
  )
}
