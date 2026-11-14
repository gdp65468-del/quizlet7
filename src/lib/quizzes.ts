import 'server-only'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Question, QuestionType, QuizSet, QuizSummary } from '@/types/game'

const dataDirectory = path.join(process.cwd(), 'data')
const IGNORED_DATA_DIRS = new Set(['sessions', 'session-reports'])

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
    throw new Error(`Invalid quiz in ${sourceLabel}: expected name and nonempty questions`)
  }
  const questions: Question[] = raw.questions.map((question: unknown, order: number) => {
    if (!isRecord(question) || typeof question.body !== 'string' || !question.body.trim() || !Array.isArray(question.choices)) {
      throw new Error(`Invalid question ${order + 1} in ${sourceLabel}`)
    }
    const rawType = typeof question.type === 'string' ? question.type : 'multiple_choice'
    if (rawType !== 'multiple_choice' && rawType !== 'true_false' && rawType !== 'multi_select') {
      throw new Error(`Unsupported question type on question ${order + 1} in ${sourceLabel}`)
    }
    const type: QuestionType = rawType
    const minChoices = 2
    const maxChoices = type === 'true_false' ? 2 : 6
    if (question.choices.length < minChoices || question.choices.length > maxChoices) {
      throw new Error(`Question ${order + 1} in ${sourceLabel} must have ${minChoices} to ${maxChoices} choices`)
    }
    const choices = question.choices.map((choice: unknown, index: number) => {
      if (!isRecord(choice) || typeof choice.body !== 'string' || !choice.body.trim() || typeof choice.is_correct !== 'boolean') {
        throw new Error(`Invalid choice ${index + 1} of question ${order + 1} in ${sourceLabel}`)
      }
      return { id: `${order}-${index}`, body: choice.body.trim(), is_correct: choice.is_correct }
    })
    const correctCount = choices.filter((choice) => choice.is_correct).length
    if (type === 'multi_select') {
      if (correctCount < 1) {
        throw new Error(`Question ${order + 1} in ${sourceLabel} must have at least one correct choice`)
      }
    } else if (correctCount !== 1) {
      throw new Error(`Question ${order + 1} in ${sourceLabel} must have exactly one correct choice`)
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

export async function listQuizCategories(): Promise<string[]> {
  await mkdir(dataDirectory, { recursive: true })
  const entries = await readdir(dataDirectory, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory() && !IGNORED_DATA_DIRS.has(entry.name))
    .map((entry) => entry.name)
    .sort()
}

export async function loadQuizzes(): Promise<QuizSet[]> {
  const categories = await listQuizCategories()
  const files = (
    await Promise.all(
      categories.map(async (category) => {
        const entries = await readdir(path.join(dataDirectory, category), { withFileTypes: true })
        return entries
          .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
          .map((entry) => ({ category, name: entry.name }))
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
    throw new Error('Reserved category name')
  }
  const slug = slugifySegment(input.slug || input.name)
  const validated = validateQuizPayload(
    { name: input.name, description: input.description ?? '', questions: input.questions },
    `${category}/${slug}.json`,
  )

  const dir = path.join(dataDirectory, category)
  await mkdir(dir, { recursive: true })
  const fileContents = {
    name: validated.name,
    description: validated.description,
    questions: validated.questions.map((q) => ({
      type: q.type ?? 'multiple_choice',
      body: q.body,
      ...(q.imageUrl ? { imageUrl: q.imageUrl } : {}),
      ...(q.codeSnippet ? { codeSnippet: q.codeSnippet } : {}),
      ...(q.codeLanguage ? { codeLanguage: q.codeLanguage } : {}),
      ...(q.pointsMultiplier === 2 ? { pointsMultiplier: 2 } : {}),
      choices: q.choices.map((c) => ({ body: c.body, is_correct: c.is_correct })),
    })),
  }
  await writeFile(path.join(dir, `${slug}.json`), `${JSON.stringify(fileContents, null, 2)}\n`, { mode: 0o644 })
  return {
    id: `${category}/${slug}`,
    ...validated,
  }
}

export async function deleteQuizFile(quizId: string): Promise<boolean> {
  const [rawCategory, rawSlug] = quizId.split('/')
  if (!rawCategory || !rawSlug) return false
  const category = slugifySegment(rawCategory)
  const slug = slugifySegment(rawSlug)
  if (IGNORED_DATA_DIRS.has(category)) return false
  try {
    await rm(path.join(dataDirectory, category, `${slug}.json`))
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}
