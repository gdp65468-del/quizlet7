import 'server-only'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { APPWRITE_CONFIG } from '@/lib/appwrite'
import {
  appwriteJwtRequest,
  createDoc,
  deleteDoc,
  isAppwriteServerEnabled,
  isServerlessRuntime,
  listDocs,
  ownerPermissions,
  Query,
  toAppwriteDocId,
  updateDoc,
  upsertDoc,
  type AppwriteDoc,
} from '@/lib/appwrite-server'
import {
  MAX_QUESTIONS_JSON_BYTES,
  MAX_QUESTIONS_PER_QUIZ,
  MAX_QUIZZES_PER_USER,
  utf8ByteLength,
} from '@/lib/quiz-limits'
import type { Question, QuestionType, QuizSet, QuizSummary } from '@/types/game'

const dataDirectory = path.join(process.cwd(), 'data')
const IGNORED_DATA_DIRS = new Set(['sessions', 'session-reports'])

export class QuizQuotaError extends Error {
  status = 403
  code = 'QUIZ_LIMIT_REACHED'
}

export class QuizValidationError extends Error {
  status = 400
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function slugifySegment(value: string): string {
  const cleaned = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return cleaned || 'quiz'
}

export function validateQuizPayload(raw: unknown, sourceLabel = 'quiz'): { name: string; description: string; questions: Question[] } {
  if (!isRecord(raw) || typeof raw.name !== 'string' || !raw.name.trim() || !Array.isArray(raw.questions) || !raw.questions.length) {
    throw new QuizValidationError(`Quiz inválido em ${sourceLabel}: informe o título e pelo menos 1 pergunta.`)
  }
  if (raw.questions.length > MAX_QUESTIONS_PER_QUIZ) {
    throw new QuizValidationError(
      `O quiz pode ter no máximo ${MAX_QUESTIONS_PER_QUIZ} perguntas (recebidas: ${raw.questions.length}).`,
    )
  }
  const questions: Question[] = raw.questions.map((question: unknown, order: number) => {
    if (!isRecord(question) || typeof question.body !== 'string' || !question.body.trim() || !Array.isArray(question.choices)) {
      throw new QuizValidationError(`Pergunta ${order + 1} inválida em ${sourceLabel}`)
    }
    const rawType = typeof question.type === 'string' ? question.type : 'multiple_choice'
    if (rawType !== 'multiple_choice' && rawType !== 'true_false' && rawType !== 'multi_select') {
      throw new QuizValidationError(`Tipo de pergunta não suportado na pergunta ${order + 1}`)
    }
    const type: QuestionType = rawType
    const minChoices = 2
    const maxChoices = type === 'true_false' ? 2 : 6
    if (question.choices.length < minChoices || question.choices.length > maxChoices) {
      throw new QuizValidationError(`A pergunta ${order + 1} deve ter entre ${minChoices} e ${maxChoices} alternativas`)
    }
    const choices = question.choices.map((choice: unknown, index: number) => {
      if (!isRecord(choice) || typeof choice.body !== 'string' || !choice.body.trim() || typeof choice.is_correct !== 'boolean') {
        throw new QuizValidationError(`Alternativa ${index + 1} da pergunta ${order + 1} é inválida`)
      }
      return { id: `${order}-${index}`, body: choice.body.trim(), is_correct: choice.is_correct }
    })
    const correctCount = choices.filter((choice) => choice.is_correct).length
    if (type === 'multi_select') {
      if (correctCount < 1) {
        throw new QuizValidationError(`A pergunta ${order + 1} precisa de pelo menos uma alternativa correta`)
      }
    } else if (correctCount !== 1) {
      throw new QuizValidationError(`A pergunta ${order + 1} precisa de exatamente uma alternativa correta`)
    }
    const imageUrl = typeof question.imageUrl === 'string' && question.imageUrl.trim() ? question.imageUrl.trim() : undefined
    const codeSnippet = typeof question.codeSnippet === 'string' && question.codeSnippet.trim() ? question.codeSnippet : undefined
    const codeLanguage = typeof question.codeLanguage === 'string' && question.codeLanguage.trim() ? question.codeLanguage.trim() : undefined
    const pointsMultiplier: 1 | 2 = question.pointsMultiplier === 2 ? 2 : 1

    return {
      id: `${order}`,
      order,
      type,
      body: question.body.trim(),
      ...(imageUrl ? { imageUrl } : {}),
      ...(codeSnippet ? { codeSnippet } : {}),
      ...(codeLanguage ? { codeLanguage } : {}),
      ...(pointsMultiplier === 2 ? { pointsMultiplier: 2 as const } : {}),
      choices,
    }
  })

  return {
    name: raw.name.trim().slice(0, 140),
    description: typeof raw.description === 'string' ? raw.description.trim().slice(0, 500) : '',
    questions,
  }
}

function buildSanitizedQuestions(questions: Question[]): Question[] {
  return questions.map((q, idx) => ({
    id: String(q.id ?? idx),
    order: idx,
    type: q.type ?? 'multiple_choice',
    body: q.body,
    ...(q.imageUrl ? { imageUrl: q.imageUrl } : {}),
    ...(q.codeSnippet ? { codeSnippet: q.codeSnippet } : {}),
    ...(q.codeLanguage ? { codeLanguage: q.codeLanguage } : {}),
    ...(q.pointsMultiplier === 2 ? { pointsMultiplier: 2 as const } : {}),
    choices: q.choices.map((c, cIdx) => ({
      id: `${idx}-${cIdx}`,
      body: c.body,
      is_correct: c.is_correct,
    })),
  }))
}

function serializeQuestionsChecked(questions: Question[]): string {
  if (questions.length > MAX_QUESTIONS_PER_QUIZ) {
    throw new QuizValidationError(
      `O quiz pode ter no máximo ${MAX_QUESTIONS_PER_QUIZ} perguntas.`,
    )
  }
  const serialized = JSON.stringify(questions)
  if (utf8ByteLength(serialized) > MAX_QUESTIONS_JSON_BYTES || serialized.length > MAX_QUESTIONS_JSON_BYTES) {
    throw new QuizValidationError(
      `O conteúdo das perguntas excede o limite seguro de armazenamento no Appwrite (${MAX_QUESTIONS_JSON_BYTES.toLocaleString('pt-BR')} bytes). Reduza textos, URLs ou trechos de código antes de salvar.`,
    )
  }
  return serialized
}

async function listBundledCategories(): Promise<string[]> {
  try {
    const entries = await readdir(dataDirectory, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory() && !IGNORED_DATA_DIRS.has(entry.name))
      .map((entry) => entry.name)
      .sort()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    return []
  }
}

async function loadBundledQuizzes(): Promise<QuizSet[]> {
  const categories = await listBundledCategories()
  const files = (
    await Promise.all(
      categories.map(async (category) => {
        try {
          const entries = await readdir(path.join(dataDirectory, category), { withFileTypes: true })
          return entries
            .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
            .map((entry) => ({ category, name: entry.name }))
        } catch {
          return []
        }
      }),
    )
  )
    .flat()
    .sort((a, b) => `${a.category}/${a.name}`.localeCompare(`${b.category}/${b.name}`))

  const loaded = await Promise.all(
    files.map(async ({ category, name }) => {
      const file = `data/${category}/${name}`
      try {
        const raw: unknown = JSON.parse(await readFile(path.join(dataDirectory, category, name), 'utf8'))
        const parsed = validateQuizPayload(raw, file)
        return {
          id: `${category}/${name.slice(0, -'.json'.length)}`,
          ...parsed,
        }
      } catch (error) {
        console.warn(`Skipping invalid quiz ${file}:`, error)
        return null
      }
    }),
  )

  return loaded.filter((item): item is QuizSet => item !== null)
}

function tombstoneDocId(quizId: string): string {
  return toAppwriteDocId(`del_quiz_${quizId}`)
}

async function loadAppwriteTombstones(): Promise<Set<string>> {
  const deleted = new Set<string>()
  if (!isAppwriteServerEnabled()) return deleted
  try {
    const resp = await listDocs<{ roomId?: string }>(APPWRITE_CONFIG.liveRoomsCollectionId, [
      Query.equal('kind', ['deleted_quiz']),
      Query.limit(200),
    ])
    for (const doc of resp.documents) {
      if (typeof doc.roomId === 'string' && doc.roomId) {
        deleted.add(doc.roomId)
      }
    }
  } catch {
    // Non-fatal if liveRooms is unavailable
  }
  return deleted
}

function parseQuizDoc(doc: AppwriteDoc<Record<string, unknown>>): QuizSet | null {
  const d = doc as unknown as Record<string, unknown>
  const quizId =
    typeof d.quizId === 'string' && d.quizId.includes('/')
      ? d.quizId
      : `${slugifySegment(String(d.category || 'geral'))}/${slugifySegment(String(d.slug || d.name || doc.$id))}`
  let rawQuestions: unknown = []
  if (typeof d.questionsJson === 'string') {
    try {
      rawQuestions = JSON.parse(d.questionsJson)
    } catch {
      rawQuestions = []
    }
  } else if (Array.isArray(d.questions)) {
    rawQuestions = d.questions
  }
  try {
    const parsed = validateQuizPayload(
      {
        name: d.name,
        description: d.description ?? '',
        questions: rawQuestions,
      },
      `appwrite:${quizId}`,
    )
    return {
      id: quizId,
      ...parsed,
    }
  } catch (err) {
    console.warn(`Skipping invalid Appwrite quiz ${quizId}:`, err)
    return null
  }
}

async function loadAppwriteAdminQuizzes(): Promise<QuizSet[]> {
  if (!isAppwriteServerEnabled()) return []
  try {
    const resp = await listDocs(APPWRITE_CONFIG.quizzesCollectionId, [
      Query.equal('ownerId', ['server']),
      Query.limit(200),
    ])
    const quizzes: QuizSet[] = []
    for (const doc of resp.documents) {
      if (doc.ownerId !== 'server') continue
      const parsed = parseQuizDoc(doc)
      if (parsed) quizzes.push(parsed)
    }
    return quizzes
  } catch (err) {
    console.warn('Could not load admin quizzes from Appwrite:', err)
    return []
  }
}

export async function listQuizCategories(): Promise<string[]> {
  const [quizzes, bundledCats] = await Promise.all([loadQuizzes(), listBundledCategories()])
  const categories = new Set<string>(bundledCats)
  for (const quiz of quizzes) {
    const cat = quiz.id.split('/')[0]
    if (cat && !IGNORED_DATA_DIRS.has(cat)) categories.add(cat)
  }
  return Array.from(categories).sort()
}

export async function loadQuizzes(): Promise<QuizSet[]> {
  const [bundled, cloudQuizzes, deletedIds] = await Promise.all([
    loadBundledQuizzes(),
    loadAppwriteAdminQuizzes(),
    loadAppwriteTombstones(),
  ])

  const byId = new Map<string, QuizSet>()
  for (const quiz of bundled) {
    if (!deletedIds.has(quiz.id)) {
      byId.set(quiz.id, quiz)
    }
  }
  for (const quiz of cloudQuizzes) {
    byId.set(quiz.id, quiz)
  }

  return Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id))
}

export async function getQuizById(quizId: string): Promise<QuizSet | null> {
  const quizzes = await loadQuizzes()
  return quizzes.find((q) => q.id === quizId) ?? null
}

export async function listQuizzes(): Promise<QuizSummary[]> {
  return (await loadQuizzes()).map(({ id, name, description, questions }) => ({
    id,
    name,
    description,
    questionCount: questions.length,
  }))
}

export async function saveQuizFile(input: {
  category: string
  slug?: string
  name: string
  description?: string
  questions: unknown[]
}): Promise<QuizSet> {
  const category = slugifySegment(input.category)
  if (IGNORED_DATA_DIRS.has(category)) {
    throw new QuizValidationError('Nome de categoria reservado')
  }
  const slug = slugifySegment(input.slug || input.name)
  const quizId = `${category}/${slug}`
  const validated = validateQuizPayload(
    { name: input.name, description: input.description ?? '', questions: input.questions },
    `${quizId}.json`,
  )

  const sanitizedQuestions = buildSanitizedQuestions(validated.questions)
  const questionsJson = serializeQuestionsChecked(sanitizedQuestions)

  let savedToAppwrite = false
  if (isAppwriteServerEnabled()) {
    const docId = toAppwriteDocId(`quiz_${category}_${slug}`)
    await upsertDoc(
      APPWRITE_CONFIG.quizzesCollectionId,
      docId,
      {
        ownerId: 'server',
        quizId: quizId.slice(0, 128),
        category: category.slice(0, 64),
        slug: slug.slice(0, 64),
        name: validated.name.slice(0, 140),
        description: validated.description.slice(0, 500),
        questionCount: sanitizedQuestions.length,
        questionsJson,
        updatedAt: new Date().toISOString(),
      },
      [],
    )
    await deleteDoc(APPWRITE_CONFIG.liveRoomsCollectionId, tombstoneDocId(quizId)).catch(() => {})
    savedToAppwrite = true
  }

  if (!isServerlessRuntime()) {
    const dir = path.join(dataDirectory, category)
    const fileContents = {
      name: validated.name,
      description: validated.description,
      questions: sanitizedQuestions.map((q) => ({
        type: q.type,
        body: q.body,
        ...(q.imageUrl ? { imageUrl: q.imageUrl } : {}),
        ...(q.codeSnippet ? { codeSnippet: q.codeSnippet } : {}),
        ...(q.codeLanguage ? { codeLanguage: q.codeLanguage } : {}),
        ...(q.pointsMultiplier === 2 ? { pointsMultiplier: 2 } : {}),
        choices: q.choices.map((c) => ({ body: c.body, is_correct: c.is_correct })),
      })),
    }
    try {
      await mkdir(dir, { recursive: true })
      await writeFile(path.join(dir, `${slug}.json`), `${JSON.stringify(fileContents, null, 2)}\n`, { mode: 0o644 })
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (!savedToAppwrite) {
        if (code === 'EROFS' || code === 'EACCES') {
          throw new Error('Servidor Serverless somente leitura: configure APPWRITE_API_KEY nas variáveis de ambiente para salvar quizzes no Appwrite.')
        }
        throw error
      }
    }
  } else if (!savedToAppwrite) {
    throw new Error('Configure APPWRITE_API_KEY nas variáveis de ambiente da Vercel/Netlify para salvar quizzes no Appwrite.')
  }

  return {
    id: quizId,
    name: validated.name,
    description: validated.description,
    questions: sanitizedQuestions,
  }
}

export async function deleteQuizFile(quizId: string): Promise<boolean> {
  const [rawCategory, rawSlug] = quizId.split('/')
  if (!rawCategory || !rawSlug) return false
  const category = slugifySegment(rawCategory)
  const slug = slugifySegment(rawSlug)
  if (IGNORED_DATA_DIRS.has(category)) return false

  const normalizedId = `${category}/${slug}`
  let deleted = false

  if (isAppwriteServerEnabled()) {
    const serverDocs = await listDocs(APPWRITE_CONFIG.quizzesCollectionId, [
      Query.equal('ownerId', ['server']),
      Query.equal('quizId', [normalizedId]),
      Query.limit(20),
    ]).catch(() => ({ documents: [] as Array<AppwriteDoc<Record<string, unknown>>> }))

    for (const doc of serverDocs.documents) {
      if (doc.ownerId === 'server' && await deleteDoc(APPWRITE_CONFIG.quizzesCollectionId, doc.$id)) {
        deleted = true
      }
    }

    const deterministicDocId = toAppwriteDocId(`quiz_${category}_${slug}`)
    const existingDeterministic = await listDocs(APPWRITE_CONFIG.quizzesCollectionId, [
      Query.equal('$id', [deterministicDocId]),
      Query.limit(1),
    ]).catch(() => ({ documents: [] as Array<AppwriteDoc<Record<string, unknown>>> }))
    if (existingDeterministic.documents[0]?.ownerId === 'server') {
      if (await deleteDoc(APPWRITE_CONFIG.quizzesCollectionId, deterministicDocId)) {
        deleted = true
      }
    }
  }

  const localPath = path.join(dataDirectory, category, `${slug}.json`)
  let bundledExists = false
  try {
    await readFile(localPath, 'utf8')
    bundledExists = true
  } catch {
    bundledExists = false
  }

  if (!isServerlessRuntime() && bundledExists) {
    try {
      await rm(localPath)
      deleted = true
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT' && code !== 'EROFS' && code !== 'EACCES') throw error
    }
  }

  if (bundledExists && isAppwriteServerEnabled() && isServerlessRuntime()) {
    await upsertDoc(APPWRITE_CONFIG.liveRoomsCollectionId, tombstoneDocId(normalizedId), {
      roomId: normalizedId,
      kind: 'deleted_quiz',
      revision: 1,
      expiresAt: 0,
      payloadJson: JSON.stringify({ deletedAt: new Date().toISOString() }),
      updatedAt: new Date().toISOString(),
    })
    deleted = true
  }

  return deleted
}

/* -------------------------------------------------------------------------- */
/*  Creator-isolated Quizzes (Strictly bound to Appwrite ownerId == user.$id) */
/* -------------------------------------------------------------------------- */

function quizzesCollectionPath(documentId?: string): string {
  const base = `/databases/${encodeURIComponent(APPWRITE_CONFIG.databaseId)}/collections/${encodeURIComponent(APPWRITE_CONFIG.quizzesCollectionId)}/documents`
  return documentId ? `${base}/${encodeURIComponent(documentId)}` : base
}

async function listCreatorQuizDocs(
  userId: string,
  jwt?: string,
): Promise<Array<AppwriteDoc<Record<string, unknown>>>> {
  if (!userId) return []
  const queries = [Query.equal('ownerId', [userId]), Query.limit(50)]

  if (isAppwriteServerEnabled()) {
    const resp = await listDocs(APPWRITE_CONFIG.quizzesCollectionId, queries)
    return resp.documents.filter((doc) => doc.ownerId === userId)
  }

  if (jwt) {
    const resp = await appwriteJwtRequest<{ documents: Array<AppwriteDoc<Record<string, unknown>>> }>(
      jwt,
      'GET',
      quizzesCollectionPath(),
      { queries },
    )
    return (resp.documents ?? []).filter((doc) => doc.ownerId === userId)
  }

  return []
}

export async function loadCreatorQuizzes(userId: string, jwt?: string): Promise<QuizSet[]> {
  try {
    const docs = await listCreatorQuizDocs(userId, jwt)
    const quizzes: QuizSet[] = []
    for (const doc of docs) {
      if (doc.ownerId !== userId) continue
      const parsed = parseQuizDoc(doc)
      if (parsed) quizzes.push(parsed)
    }
    return quizzes.sort((a, b) => a.id.localeCompare(b.id))
  } catch (err) {
    console.warn(`Could not load creator quizzes for ${userId}:`, err)
    return []
  }
}

export async function listCreatorQuizzes(userId: string, jwt?: string): Promise<QuizSummary[]> {
  return (await loadCreatorQuizzes(userId, jwt)).map(({ id, name, description, questions }) => ({
    id,
    name,
    description,
    questionCount: questions.length,
  }))
}

export async function listCreatorCategories(userId: string, jwt?: string): Promise<string[]> {
  const quizzes = await loadCreatorQuizzes(userId, jwt)
  const categories = new Set<string>()
  for (const quiz of quizzes) {
    const cat = quiz.id.split('/')[0]
    if (cat && !IGNORED_DATA_DIRS.has(cat)) categories.add(cat)
  }
  return Array.from(categories).sort()
}

export async function getCreatorQuizById(
  userId: string,
  quizId: string,
  jwt?: string,
): Promise<QuizSet | null> {
  const docs = await listCreatorQuizDocs(userId, jwt)
  const match = docs.find((doc) => doc.ownerId === userId && (doc.quizId === quizId || doc.$id === quizId))
  if (!match) return null
  return parseQuizDoc(match)
}

export async function saveCreatorQuiz(input: {
  userId: string
  jwt?: string
  previousId?: string
  category: string
  slug?: string
  name: string
  description?: string
  questions: unknown[]
}): Promise<QuizSet> {
  const userId = input.userId.trim()
  if (!userId) throw new Error('Usuário não autenticado')
  if (!isAppwriteServerEnabled() && !input.jwt) {
    throw new Error('Autenticação Appwrite necessária para salvar quizzes.')
  }

  const category = slugifySegment(input.category)
  if (IGNORED_DATA_DIRS.has(category)) {
    throw new QuizValidationError('Nome de categoria reservado')
  }
  const slug = slugifySegment(input.slug || input.name)
  const quizId = `${category}/${slug}`

  const validated = validateQuizPayload(
    { name: input.name, description: input.description ?? '', questions: input.questions },
    quizId,
  )

  const sanitizedQuestions = buildSanitizedQuestions(validated.questions)
  const questionsJson = serializeQuestionsChecked(sanitizedQuestions)

  const ownedDocs = await listCreatorQuizDocs(userId, input.jwt)

  let targetDoc: AppwriteDoc<Record<string, unknown>> | undefined
  if (input.previousId) {
    targetDoc = ownedDocs.find(
      (doc) => doc.ownerId === userId && (doc.quizId === input.previousId || doc.$id === input.previousId),
    )
  }
  if (!targetDoc) {
    targetDoc = ownedDocs.find((doc) => doc.ownerId === userId && doc.quizId === quizId)
  }

  if (targetDoc) {
    const conflictingDoc = ownedDocs.find(
      (doc) => doc.$id !== targetDoc!.$id && doc.quizId === quizId,
    )
    if (conflictingDoc) {
      throw new QuizValidationError(
        `Você já possui outro quiz salvo em "${quizId}". Escolha outro título ou categoria.`,
      )
    }
  } else if (ownedDocs.length >= MAX_QUIZZES_PER_USER) {
    throw new QuizQuotaError(
      `Você atingiu o limite máximo de ${MAX_QUIZZES_PER_USER} quizzes salvos. Gerencie, edite ou exclua um dos quizzes existentes antes de criar um novo.`,
    )
  }

  const data = {
    ownerId: userId,
    quizId: quizId.slice(0, 128),
    category: category.slice(0, 64),
    slug: slug.slice(0, 64),
    name: validated.name.slice(0, 140),
    description: validated.description.slice(0, 500),
    questionCount: sanitizedQuestions.length,
    questionsJson,
    updatedAt: new Date().toISOString(),
  }
  const permissions = ownerPermissions(userId)

  if (targetDoc) {
    if (isAppwriteServerEnabled()) {
      await updateDoc(APPWRITE_CONFIG.quizzesCollectionId, targetDoc.$id, data, permissions)
    } else if (input.jwt) {
      await appwriteJwtRequest(input.jwt, 'PATCH', quizzesCollectionPath(targetDoc.$id), {
        body: { data },
      })
    }
  } else {
    const newDocId = toAppwriteDocId(`quiz_${userId}_${category}_${slug}`)
    if (isAppwriteServerEnabled()) {
      await createDoc(APPWRITE_CONFIG.quizzesCollectionId, newDocId, data, permissions)
    } else if (input.jwt) {
      await appwriteJwtRequest(input.jwt, 'POST', quizzesCollectionPath(), {
        body: {
          documentId: newDocId,
          data,
          permissions,
        },
      })
    }
  }

  return {
    id: quizId,
    name: validated.name,
    description: validated.description,
    questions: sanitizedQuestions,
  }
}

export async function deleteCreatorQuiz(userId: string, quizId: string, jwt?: string): Promise<boolean> {
  const ownedDocs = await listCreatorQuizDocs(userId, jwt)
  const matches = ownedDocs.filter(
    (doc) => doc.ownerId === userId && (doc.quizId === quizId || doc.$id === quizId),
  )
  if (!matches.length) return false

  let deleted = false
  for (const doc of matches) {
    if (isAppwriteServerEnabled()) {
      if (await deleteDoc(APPWRITE_CONFIG.quizzesCollectionId, doc.$id)) {
        deleted = true
      }
    } else if (jwt) {
      await appwriteJwtRequest(jwt, 'DELETE', quizzesCollectionPath(doc.$id))
      deleted = true
    }
  }
  return deleted
}

