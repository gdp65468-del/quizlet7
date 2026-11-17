'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Download,
  FileJson,
  FileSpreadsheet,
  GripVertical,
  Image as ImageIcon,
  Layers,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Upload,
  Zap,
} from 'lucide-react'
import { QuestionMedia } from '@/components/question-media'
import { StatPill } from '@/components/ui'
import { useCloudSync } from '@/lib/cloud-sync'
import { useI18n } from '@/lib/i18n'
import {
  MAX_QUESTIONS_JSON_BYTES,
  MAX_QUESTIONS_PER_QUIZ,
  MAX_QUIZZES_PER_USER,
  utf8ByteLength,
} from '@/lib/quiz-limits'
import type { Question, QuestionType, QuizSummary } from '@/types/game'

type EditableChoice = {
  id: string
  body: string
  is_correct: boolean
}

type EditableQuestion = {
  uid: string
  type: QuestionType
  body: string
  imageUrl: string
  codeSnippet: string
  codeLanguage: string
  pointsMultiplier: 1 | 2
  choices: EditableChoice[]
}

function makeUid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function slugifyClient(value: string) {
  const cleaned = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return cleaned || 'quiz'
}

function createEmptyQuestion(type: QuestionType = 'multiple_choice', locale: 'pt' | 'en' = 'pt'): EditableQuestion {
  if (type === 'true_false') {
    return {
      uid: makeUid(),
      type: 'true_false',
      body: '',
      imageUrl: '',
      codeSnippet: '',
      codeLanguage: '',
      pointsMultiplier: 1,
      choices: [
        { id: makeUid(), body: locale === 'pt' ? 'Verdadeiro' : 'True', is_correct: true },
        { id: makeUid(), body: locale === 'pt' ? 'Falso' : 'False', is_correct: false },
      ],
    }
  }
  return {
    uid: makeUid(),
    type,
    body: '',
    imageUrl: '',
    codeSnippet: '',
    codeLanguage: '',
    pointsMultiplier: 1,
    choices: [
      { id: makeUid(), body: '', is_correct: true },
      { id: makeUid(), body: '', is_correct: false },
      { id: makeUid(), body: '', is_correct: false },
      { id: makeUid(), body: '', is_correct: false },
    ],
  }
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

function parseCsvToQuestions(text: string): EditableQuestion[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length < 2) throw new Error('CSV precisa de cabeçalho e pelo menos 1 linha de pergunta.')

  const delimiter = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ','
  const headers = parseCsvLine(lines[0], delimiter).map((h) => h.toLowerCase())

  const findCol = (...candidates: string[]) => headers.findIndex((h) => candidates.some((c) => h.includes(c)))
  const idxBody = findCol('pergunta', 'question', 'body')
  const idxType = findCol('tipo', 'type')
  const idxCorrect = findCol('correta', 'correct', 'answer')
  const idxBonus = findCol('bonus', '2x', 'multiplier')
  const idxImg = findCol('imagem', 'image')
  const idxCode = findCol('codigo', 'code')
  const idxLang = findCol('linguagem', 'lang')

  const choiceCols = [1, 2, 3, 4, 5, 6]
    .map((n) => findCol(`op${n}`, `opcao${n}`, `choice${n}`, `alt${n}`, `option${n}`))
    .filter((i) => i >= 0)

  if (idxBody < 0 || choiceCols.length < 2) {
    throw new Error('Colunas esperadas no CSV: pergunta, tipo, op1, op2, op3, op4, corretas, bonus2x, imagem, codigo')
  }

  const parsed: EditableQuestion[] = []
  for (let r = 1; r < lines.length; r++) {
    const cells = parseCsvLine(lines[r], delimiter)
    const body = cells[idxBody]?.trim() ?? ''
    if (!body) continue
    const rawType = (idxType >= 0 ? cells[idxType] : '').toLowerCase()
    const type: QuestionType =
      rawType.includes('true') || rawType.includes('verdadeiro') || rawType === 'tf'
        ? 'true_false'
        : rawType.includes('multi_select') || rawType.includes('multipla') || rawType.includes('multi')
          ? 'multi_select'
          : 'multiple_choice'

    const rawCorrect = (idxCorrect >= 0 ? cells[idxCorrect] : '1')
      .split(/[|/\s]+/)
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n >= 1)
    const correctSet = new Set(rawCorrect.length ? rawCorrect : [1])

    const rawChoices = choiceCols
      .map((colIndex, idx) => ({
        id: makeUid(),
        body: cells[colIndex]?.trim() ?? '',
        is_correct: correctSet.has(idx + 1),
      }))
      .filter((c) => c.body.length > 0)

    if (rawChoices.length < 2) {
      throw new Error(`Linha ${r + 1}: cada pergunta precisa de pelo menos 2 alternativas.`)
    }
    if (!rawChoices.some((c) => c.is_correct)) {
      rawChoices[0].is_correct = true
    }
    if (type !== 'multi_select') {
      let seenCorrect = false
      for (const c of rawChoices) {
        if (c.is_correct) {
          if (seenCorrect) c.is_correct = false
          seenCorrect = true
        }
      }
    }

    const bonusVal = idxBonus >= 0 ? cells[idxBonus]?.trim().toLowerCase() : ''
    const is2x = bonusVal === '2' || bonusVal === '2x' || bonusVal === 'true' || bonusVal === 'sim' || bonusVal === 'yes'

    parsed.push({
      uid: makeUid(),
      type: type === 'true_false' && rawChoices.length > 2 ? 'multiple_choice' : type,
      body,
      imageUrl: idxImg >= 0 ? cells[idxImg] ?? '' : '',
      codeSnippet: idxCode >= 0 ? cells[idxCode] ?? '' : '',
      codeLanguage: idxLang >= 0 ? cells[idxLang] ?? '' : '',
      pointsMultiplier: is2x ? 2 : 1,
      choices: rawChoices.slice(0, type === 'true_false' ? 2 : 6),
    })
  }
  if (!parsed.length) throw new Error('Nenhuma pergunta válida encontrada no CSV.')
  if (parsed.length > MAX_QUESTIONS_PER_QUIZ) {
    throw new Error(`O CSV contém ${parsed.length} perguntas, mas o limite máximo é de ${MAX_QUESTIONS_PER_QUIZ} perguntas por quiz.`)
  }
  return parsed
}

function normalizeJsonToQuiz(rawText: string): {
  name?: string
  description?: string
  category?: string
  questions: EditableQuestion[]
} {
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  const data = JSON.parse(cleaned) as Record<string, unknown>
  const list = Array.isArray(data) ? data : Array.isArray(data.questions) ? data.questions : null
  if (!list || !list.length) {
    throw new Error('JSON precisa conter um array "questions" não vazio.')
  }
  if (list.length > MAX_QUESTIONS_PER_QUIZ) {
    throw new Error(`O JSON contém ${list.length} perguntas, mas o limite máximo é de ${MAX_QUESTIONS_PER_QUIZ} perguntas por quiz.`)
  }
  const questions: EditableQuestion[] = list.map((item: unknown, idx: number) => {
    const q = item as Record<string, unknown>
    if (!q || typeof q.body !== 'string' || !q.body.trim() || !Array.isArray(q.choices) || q.choices.length < 2) {
      throw new Error(`Pergunta ${idx + 1} inválida no JSON.`)
    }
    const rawType = typeof q.type === 'string' ? q.type : 'multiple_choice'
    const type: QuestionType =
      rawType === 'true_false' || rawType === 'multi_select' || rawType === 'multiple_choice'
        ? rawType
        : 'multiple_choice'

    const choices: EditableChoice[] = q.choices.slice(0, type === 'true_false' ? 2 : 6).map((c: unknown) => {
      const choiceObj = c as Record<string, unknown>
      return {
        id: makeUid(),
        body: String(choiceObj?.body ?? '').trim(),
        is_correct: Boolean(choiceObj?.is_correct),
      }
    })
    if (choices.some((c) => !c.body)) {
      throw new Error(`Alternativa vazia na pergunta ${idx + 1}.`)
    }
    if (!choices.some((c) => c.is_correct)) {
      choices[0].is_correct = true
    }
    if (type !== 'multi_select') {
      let kept = false
      for (const c of choices) {
        if (c.is_correct) {
          if (kept) c.is_correct = false
          kept = true
        }
      }
    }
    return {
      uid: makeUid(),
      type,
      body: q.body.trim(),
      imageUrl: typeof q.imageUrl === 'string' ? q.imageUrl.trim() : '',
      codeSnippet: typeof q.codeSnippet === 'string' ? q.codeSnippet : '',
      codeLanguage: typeof q.codeLanguage === 'string' ? q.codeLanguage.trim() : '',
      pointsMultiplier: q.pointsMultiplier === 2 ? 2 : 1,
      choices,
    }
  })

  return {
    name: typeof data === 'object' && !Array.isArray(data) && typeof data.name === 'string' ? data.name : undefined,
    description:
      typeof data === 'object' && !Array.isArray(data) && typeof data.description === 'string'
        ? data.description
        : undefined,
    category:
      typeof data === 'object' && !Array.isArray(data) && typeof data.category === 'string' ? data.category : undefined,
    questions,
  }
}

function createInitialEmptyQuestion(): EditableQuestion {
  return {
    uid: 'init-q-0',
    type: 'multiple_choice',
    body: '',
    imageUrl: '',
    codeSnippet: '',
    codeLanguage: '',
    pointsMultiplier: 1,
    choices: [
      { id: 'init-c-0', body: '', is_correct: true },
      { id: 'init-c-1', body: '', is_correct: false },
      { id: 'init-c-2', body: '', is_correct: false },
      { id: 'init-c-3', body: '', is_correct: false },
    ],
  }
}

function QuizEditorInner({ mode, backHref }: { mode: 'admin' | 'creator'; backHref: string }) {
  const searchParams = useSearchParams()
  const editId = searchParams.get('id')
  const initialTab = searchParams.get('tab') === 'ai' ? 'ai' : 'editor'
  const { locale } = useI18n()
  const { getJwt } = useCloudSync()
  const isPt = locale === 'pt'

  const [activeTab, setActiveTab] = useState<'editor' | 'ai'>(initialTab)
  const [library, setLibrary] = useState<QuizSummary[]>([])
  const [loadedId, setLoadedId] = useState<string | null>(editId)
  const [category, setCategory] = useState('geral')
  const [slug, setSlug] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [questions, setQuestions] = useState<EditableQuestion[]>(() => [createInitialEmptyQuestion()])

  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // AI Prompt Builder state
  const [aiTopic, setAiTopic] = useState('')
  const [aiCount, setAiCount] = useState(8)
  const [aiDifficulty, setAiDifficulty] = useState<'easy' | 'medium' | 'hard' | 'mixed'>('mixed')
  const [aiLang, setAiLang] = useState<'pt' | 'en'>(locale)
  const [aiIncludeTF, setAiIncludeTF] = useState(true)
  const [aiIncludeMulti, setAiIncludeMulti] = useState(true)
  const [aiInclude2x, setAiInclude2x] = useState(true)
  const [aiIncludeCode, setAiIncludeCode] = useState(false)
  const [promptCopied, setPromptCopied] = useState(false)
  const [aiJsonPaste, setAiJsonPaste] = useState('')

  const authHeaders = useCallback(
    async (withJson = false): Promise<HeadersInit> => {
      const headers: Record<string, string> = {}
      if (withJson) headers['Content-Type'] = 'application/json'
      if (mode === 'creator') {
        const jwt = await getJwt()
        if (jwt) headers['x-appwrite-jwt'] = jwt
      }
      return headers
    },
    [mode, getJwt],
  )

  const fetchQuizList = useCallback(async () => {
    try {
      const res = await fetch(`/api/quizzes?scope=${mode}`, {
        cache: 'no-store',
        credentials: 'include',
        headers: await authHeaders(false),
      })
      if (res.ok) {
        const list = (await res.json()) as QuizSummary[]
        setLibrary(list)
      }
    } catch {
      // ignore background error
    }
  }, [mode, authHeaders])

  const loadQuizForEdit = useCallback(
    async (quizId: string) => {
      setNotice(null)
      try {
        const res = await fetch(`/api/quizzes?scope=${mode}&id=${encodeURIComponent(quizId)}`, {
          cache: 'no-store',
          credentials: 'include',
          headers: await authHeaders(false),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Could not load quiz')
        const [cat, sl] = String(data.id).split('/')
        setLoadedId(data.id)
        setCategory(cat || 'geral')
        setSlug(sl || '')
        setName(data.name || '')
        setDescription(data.description || '')
        const loadedQuestions: EditableQuestion[] = (data.questions as Question[]).map((q) => ({
          uid: makeUid(),
          type: q.type ?? 'multiple_choice',
          body: q.body,
          imageUrl: q.imageUrl ?? '',
          codeSnippet: q.codeSnippet ?? '',
          codeLanguage: q.codeLanguage ?? '',
          pointsMultiplier: q.pointsMultiplier === 2 ? 2 : 1,
          choices: q.choices.map((c) => ({
            id: makeUid(),
            body: c.body,
            is_correct: Boolean(c.is_correct),
          })),
        }))
        setQuestions(loadedQuestions.length ? loadedQuestions : [createEmptyQuestion('multiple_choice', locale)])
      } catch (err) {
        setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Erro ao carregar quiz' })
      }
    },
    [mode, locale, authHeaders],
  )

  useEffect(() => {
    const t = setTimeout(() => {
      void fetchQuizList()
      if (editId) {
        void loadQuizForEdit(editId)
      }
    }, 0)
    return () => clearTimeout(t)
  }, [editId, fetchQuizList, loadQuizForEdit])

  const creatorAtLimit = mode === 'creator' && library.length >= MAX_QUIZZES_PER_USER
  const creatingBlockedByQuota = creatorAtLimit && !loadedId
  const questionLimitReached = questions.length >= MAX_QUESTIONS_PER_QUIZ

  const existingCategories = useMemo(() => {
    const set = new Set<string>(['geral'])
    for (const q of library) {
      const cat = q.id.split('/')[0]
      if (cat) set.add(cat)
    }
    return Array.from(set).sort()
  }, [library])

  const updateQuestion = (uid: string, updater: (q: EditableQuestion) => EditableQuestion) => {
    setQuestions((prev) => prev.map((q) => (q.uid === uid ? updater(q) : q)))
  }

  const changeQuestionType = (uid: string, nextType: QuestionType) => {
    updateQuestion(uid, (q) => {
      if (nextType === 'true_false') {
        const firstCorrect = q.choices[0]?.is_correct ?? true
        return {
          ...q,
          type: 'true_false',
          choices: [
            { id: makeUid(), body: locale === 'pt' ? 'Verdadeiro' : 'True', is_correct: firstCorrect },
            { id: makeUid(), body: locale === 'pt' ? 'Falso' : 'False', is_correct: !firstCorrect },
          ],
        }
      }
      if (q.type === 'true_false') {
        return {
          ...q,
          type: nextType,
          choices: [
            ...q.choices,
            { id: makeUid(), body: '', is_correct: false },
            { id: makeUid(), body: '', is_correct: false },
          ],
        }
      }
      if (nextType === 'multiple_choice') {
        let kept = false
        const normalized = q.choices.map((c) => {
          if (c.is_correct && !kept) {
            kept = true
            return c
          }
          return { ...c, is_correct: false }
        })
        if (!kept && normalized[0]) normalized[0].is_correct = true
        return { ...q, type: nextType, choices: normalized }
      }
      return { ...q, type: nextType }
    })
  }

  const toggleChoiceCorrect = (uid: string, choiceId: string) => {
    updateQuestion(uid, (q) => {
      if (q.type === 'multi_select') {
        return {
          ...q,
          choices: q.choices.map((c) => (c.id === choiceId ? { ...c, is_correct: !c.is_correct } : c)),
        }
      }
      return {
        ...q,
        choices: q.choices.map((c) => ({ ...c, is_correct: c.id === choiceId })),
      }
    })
  }

  const moveQuestion = (from: number, to: number) => {
    if (from === to || to < 0 || to >= questions.length) return
    setQuestions((prev) => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  const duplicateQuestion = (index: number) => {
    if (questions.length >= MAX_QUESTIONS_PER_QUIZ) {
      setNotice({
        kind: 'error',
        text: isPt
          ? `Limite máximo de ${MAX_QUESTIONS_PER_QUIZ} perguntas por quiz atingido.`
          : `Maximum limit of ${MAX_QUESTIONS_PER_QUIZ} questions per quiz reached.`,
      })
      return
    }
    setQuestions((prev) => {
      if (prev.length >= MAX_QUESTIONS_PER_QUIZ) return prev
      const source = prev[index]
      const copy: EditableQuestion = {
        ...source,
        uid: makeUid(),
        choices: source.choices.map((c) => ({ ...c, id: makeUid() })),
      }
      const next = [...prev]
      next.splice(index + 1, 0, copy)
      return next
    })
  }

  const addQuestion = (type: QuestionType) => {
    if (questions.length >= MAX_QUESTIONS_PER_QUIZ) {
      setNotice({
        kind: 'error',
        text: isPt
          ? `Cada quiz pode ter no máximo ${MAX_QUESTIONS_PER_QUIZ} perguntas.`
          : `Each quiz can have at most ${MAX_QUESTIONS_PER_QUIZ} questions.`,
      })
      return
    }
    setQuestions((prev) => [...prev, createEmptyQuestion(type, locale)])
  }

  const removeQuestion = (uid: string) => {
    if (questions.length <= 1) return
    setQuestions((prev) => prev.filter((q) => q.uid !== uid))
  }

  const handleSave = async () => {
    setNotice(null)
    if (creatingBlockedByQuota) {
      setNotice({
        kind: 'error',
        text: isPt
          ? `Você já atingiu o limite máximo de ${MAX_QUIZZES_PER_USER} quizzes salvos. Selecione um quiz existente acima para editar ou exclua um antes de criar outro.`
          : `You have reached the maximum limit of ${MAX_QUIZZES_PER_USER} saved quizzes. Edit or delete an existing quiz first.`,
      })
      return
    }
    if (!name.trim()) {
      setNotice({ kind: 'error', text: isPt ? 'Informe o nome do quiz.' : 'Please enter a quiz title.' })
      return
    }
    if (questions.length > MAX_QUESTIONS_PER_QUIZ) {
      setNotice({
        kind: 'error',
        text: isPt
          ? `O quiz possui ${questions.length} perguntas, mas o limite máximo é de ${MAX_QUESTIONS_PER_QUIZ} perguntas por quiz.`
          : `This quiz has ${questions.length} questions, exceeding the ${MAX_QUESTIONS_PER_QUIZ}-question limit.`,
      })
      return
    }
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]
      if (!q.body.trim()) {
        setNotice({ kind: 'error', text: `Pergunta ${i + 1}: o enunciado está vazio.` })
        return
      }
      if (q.choices.some((c) => !c.body.trim())) {
        setNotice({ kind: 'error', text: `Pergunta ${i + 1}: preencha todas as alternativas.` })
        return
      }
      if (!q.choices.some((c) => c.is_correct)) {
        setNotice({ kind: 'error', text: `Pergunta ${i + 1}: marque pelo menos uma alternativa correta.` })
        return
      }
    }

    const targetCategory = slugifyClient(category || 'geral')
    const targetSlug = slugifyClient(slug || name)
    const payloadQuestions = questions.map((q, idx) => ({
      id: `${idx}`,
      order: idx,
      type: q.type,
      body: q.body.trim(),
      ...(q.imageUrl.trim() ? { imageUrl: q.imageUrl.trim() } : {}),
      ...(q.codeSnippet.trim() ? { codeSnippet: q.codeSnippet } : {}),
      ...(q.codeLanguage.trim() ? { codeLanguage: q.codeLanguage.trim() } : {}),
      ...(q.pointsMultiplier === 2 ? { pointsMultiplier: 2 as const } : {}),
      choices: q.choices.map((c, cIdx) => ({
        id: `${idx}-${cIdx}`,
        body: c.body.trim(),
        is_correct: c.is_correct,
      })),
    }))

    const serializedBytes = utf8ByteLength(JSON.stringify(payloadQuestions))
    if (serializedBytes > MAX_QUESTIONS_JSON_BYTES) {
      setNotice({
        kind: 'error',
        text: isPt
          ? `O tamanho total das perguntas (${serializedBytes} bytes) ultrapassa o limite seguro do Appwrite (${MAX_QUESTIONS_JSON_BYTES} bytes). Reduza textos longos ou trechos de código.`
          : `Serialized questions (${serializedBytes} bytes) exceed Appwrite safe size limit (${MAX_QUESTIONS_JSON_BYTES} bytes).`,
      })
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/quizzes', {
        method: 'POST',
        credentials: 'include',
        headers: await authHeaders(true),
        body: JSON.stringify({
          scope: mode,
          previousId: loadedId || undefined,
          category: targetCategory,
          slug: targetSlug,
          name: name.trim(),
          description: description.trim(),
          questions: payloadQuestions,
        }),
      })
      const saved = await res.json()
      if (!res.ok) throw new Error(saved.error || 'Erro ao salvar quiz')

      setLoadedId(saved.id)
      const [, savedSlug] = String(saved.id).split('/')
      setSlug(savedSlug || targetSlug)

      await fetchQuizList()
      setNotice({
        kind: 'success',
        text: isPt
          ? `Quiz "${saved.name}" salvo com sucesso (${saved.id})!`
          : `Quiz "${saved.name}" saved successfully (${saved.id})!`,
      })
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Erro ao salvar' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!loadedId) return
    setDeleting(true)
    setNotice(null)
    try {
      const res = await fetch(`/api/quizzes?scope=${mode}&id=${encodeURIComponent(loadedId)}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: await authHeaders(false),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Erro ao excluir')
      }
      setLoadedId(null)
      setName('')
      setSlug('')
      setDescription('')
      setQuestions([createEmptyQuestion('multiple_choice', locale)])
      setConfirmDelete(false)
      await fetchQuizList()
      setNotice({ kind: 'success', text: isPt ? 'Quiz removido com sucesso.' : 'Quiz deleted successfully.' })
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Erro ao excluir' })
    } finally {
      setDeleting(false)
    }
  }

  const handleFileImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setNotice(null)
    try {
      const text = await file.text()
      if (file.name.toLowerCase().endsWith('.csv') || (!text.trim().startsWith('{') && !text.trim().startsWith('['))) {
        const imported = parseCsvToQuestions(text)
        setQuestions(imported)
        if (!name.trim()) setName(file.name.replace(/\.(csv|json)$/i, ''))
        setNotice({ kind: 'success', text: `${imported.length} perguntas importadas do CSV!` })
      } else {
        const parsed = normalizeJsonToQuiz(text)
        if (parsed.name) setName(parsed.name)
        if (parsed.description !== undefined) setDescription(parsed.description)
        if (parsed.category) setCategory(parsed.category)
        setQuestions(parsed.questions)
        setNotice({ kind: 'success', text: `${parsed.questions.length} perguntas importadas do JSON!` })
      }
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof Error ? err.message : 'Falha ao importar arquivo.' })
    }
  }

  const downloadCsvTemplate = () => {
    const rows = [
      ['pergunta', 'tipo', 'op1', 'op2', 'op3', 'op4', 'corretas', 'bonus2x', 'imagem', 'codigo'].join(','),
      [
        '"Qual profeta foi preservado na cova dos leões por sua fidelidade a Deus?"',
        'multiple_choice',
        'Elias',
        'Daniel',
        'Jonas',
        'Isaías',
        '2',
        '1',
        '',
        '',
      ].join(','),
      [
        '"Verdadeiro ou Falso: Moisés recebeu os Dez Mandamentos no Monte Sinai."',
        'true_false',
        'Verdadeiro',
        'Falso',
        '',
        '',
        '1',
        '1',
        '',
        '',
      ].join(','),
      [
        '"Quais destes livros pertencem aos quatro Evangelhos do Novo Testamento?"',
        'multi_select',
        'Mateus',
        'Marcos',
        'Romanos',
        'João',
        '1|2|4',
        '2',
        '',
        '',
      ].join(','),
    ]
    const blob = new Blob(['\uFEFF' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'modelo-arena-biblica.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const downloadJsonExport = () => {
    const payload = {
      name: name.trim() || 'Meu Quiz',
      description: description.trim(),
      questions: questions.map((q) => ({
        type: q.type,
        body: q.body,
        ...(q.imageUrl ? { imageUrl: q.imageUrl } : {}),
        ...(q.codeSnippet ? { codeSnippet: q.codeSnippet } : {}),
        ...(q.codeLanguage ? { codeLanguage: q.codeLanguage } : {}),
        ...(q.pointsMultiplier === 2 ? { pointsMultiplier: 2 } : {}),
        choices: q.choices.map((c) => ({ body: c.body, is_correct: c.is_correct })),
      })),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${slugifyClient(name || 'quiz')}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const generatedAiPrompt = useMemo(() => {
    const allowedTypes = ['"multiple_choice" (4 alternativas, apenas 1 correta)']
    if (aiIncludeTF) allowedTypes.push('"true_false" (exatamente 2 alternativas: Verdadeiro/Falso ou True/False, 1 correta)')
    if (aiIncludeMulti) allowedTypes.push('"multi_select" (3 a 6 alternativas, 2 ou mais com is_correct: true)')

    const diffMap = {
      easy: aiLang === 'pt' ? 'fácil (conceitos introdutórios)' : 'easy (introductory concepts)',
      medium: aiLang === 'pt' ? 'médio (aplicação prática)' : 'medium (practical application)',
      hard: aiLang === 'pt' ? 'difícil (casos avançados)' : 'hard (advanced edge cases)',
      mixed: aiLang === 'pt' ? 'misto (progressivo do fácil ao difícil)' : 'mixed (progressive from easy to hard)',
    }

    const topicText = aiTopic.trim() || (aiLang === 'pt' ? '[COLE AQUI SEU TEMA OU PASSAGEM BÍBLICA]' : '[PASTE YOUR TOPIC OR BIBLE PASSAGE HERE]')

    if (aiLang === 'pt') {
      return `Você é um especialista em educação bíblica e gamificação. Crie um quiz interativo compatível com o formato JSON do Arena Bíblica.

TEMA / CONTEÚDO BASE:
${topicText}

REQUISITOS:
- Idioma das perguntas e respostas: Português (PT-BR).
- Quantidade exata de perguntas: ${aiCount} (máximo permitido na plataforma: ${MAX_QUESTIONS_PER_QUIZ}).
- Nível de dificuldade: ${diffMap[aiDifficulty]}.
- Tipos de pergunta permitidos: ${allowedTypes.join('; ')}.
${aiInclude2x ? '- Marque as 1 ou 2 perguntas finais/estratégicas com "pointsMultiplier": 2 (Pergunta Bônus 2x).' : '- Use "pointsMultiplier": 1 em todas as perguntas.'}
${aiIncludeCode ? '- Inclua trechos curtos de código em "codeSnippet" e informe "codeLanguage" quando fizer sentido técnico.' : ''}
- Responda APENAS com um objeto JSON válido (sem comentários, sem texto fora do JSON).

SCHEMA JSON OBRIGATÓRIO:
{
  "name": "Título curto e atraente do quiz",
  "description": "Resumo de 1 frase sobre o que será avaliado",
  "questions": [
    {
      "type": "multiple_choice",
      "body": "Enunciado claro e direto da pergunta?",
      "pointsMultiplier": 1,
      ${aiIncludeCode ? '"codeSnippet": "// opcional: trecho de código",\n      "codeLanguage": "javascript",\n      ' : ''}"choices": [
        { "body": "Alternativa A", "is_correct": false },
        { "body": "Alternativa B", "is_correct": true },
        { "body": "Alternativa C", "is_correct": false },
        { "body": "Alternativa D", "is_correct": false }
      ]
    }
  ]
}`
    }

    return `You are an expert Bible educator and instructional designer. Generate an interactive quiz compatible with the Arena Bíblica JSON schema.

TOPIC / SOURCE MATERIAL:
${topicText}

REQUIREMENTS:
- Language: English.
- Exact number of questions: ${aiCount} (platform maximum: ${MAX_QUESTIONS_PER_QUIZ}).
- Difficulty: ${diffMap[aiDifficulty]}.
- Allowed question types: ${allowedTypes.join('; ')}.
${aiInclude2x ? '- Mark 1 or 2 strategic/final questions with "pointsMultiplier": 2 (2x Bonus Question).' : '- Use "pointsMultiplier": 1 for all questions.'}
${aiIncludeCode ? '- Include concise code examples using "codeSnippet" and "codeLanguage" where helpful.' : ''}
- Output ONLY valid JSON (no markdown commentary outside the JSON object).

REQUIRED JSON SCHEMA:
{
  "name": "Short engaging quiz title",
  "description": "One-sentence summary of the quiz",
  "questions": [
    {
      "type": "multiple_choice",
      "body": "Clear and direct question prompt?",
      "pointsMultiplier": 1,
      ${aiIncludeCode ? '"codeSnippet": "// optional code snippet",\n      "codeLanguage": "javascript",\n      ' : ''}"choices": [
        { "body": "Option A", "is_correct": false },
        { "body": "Option B", "is_correct": true },
        { "body": "Option C", "is_correct": false },
        { "body": "Option D", "is_correct": false }
      ]
    }
  ]
}`
  }, [aiTopic, aiCount, aiDifficulty, aiLang, aiIncludeTF, aiIncludeMulti, aiInclude2x, aiIncludeCode])

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(generatedAiPrompt)
      setPromptCopied(true)
      setTimeout(() => setPromptCopied(false), 1800)
    } catch {
      setNotice({ kind: 'error', text: 'Não foi possível copiar automaticamente. Selecione o texto do prompt e pressione Ctrl+C.' })
    }
  }

  const importFromAiPaste = () => {
    setNotice(null)
    try {
      const parsed = normalizeJsonToQuiz(aiJsonPaste)
      if (parsed.name) setName(parsed.name)
      if (parsed.description !== undefined) setDescription(parsed.description)
      if (parsed.category) setCategory(parsed.category)
      setQuestions(parsed.questions)
      setLoadedId(null)
      setSlug(slugifyClient(parsed.name || 'quiz-ia'))
      setActiveTab('editor')
      setNotice({
        kind: 'success',
        text: isPt
          ? `${parsed.questions.length} perguntas importadas da IA para o editor! Revise e clique em Salvar.`
          : `${parsed.questions.length} AI-generated questions loaded into the editor! Review and click Save.`,
      })
    } catch (err) {
      setNotice({
        kind: 'error',
        text: err instanceof Error ? err.message : 'JSON inválido. Verifique se copiou a resposta JSON completa da IA.',
      })
    }
  }

  return (
    <div className="container-game pb-20">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 animate-in">
        <div>
          <Link href={backHref} className="text-muted inline-flex items-center gap-2 text-sm font-semibold hover:text-white">
            <ArrowLeft className="h-4 w-4" /> {isPt ? 'Voltar ao painel' : 'Back to dashboard'}
          </Link>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
            {isPt ? 'Estúdio de criação de quizzes' : 'Quiz creation studio'}
          </h1>
          <p className="text-muted mt-1 text-sm">
            {isPt
              ? `Crie até ${MAX_QUESTIONS_PER_QUIZ} perguntas por quiz com arrastar-e-soltar, CSV/JSON ou prompt para IA.`
              : `Build up to ${MAX_QUESTIONS_PER_QUIZ} questions per quiz with drag-and-drop, CSV/JSON, or AI prompts.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {mode === 'creator' && (
            <StatPill accent={creatorAtLimit ? 'amber' : 'mint'}>
              {library.length}/{MAX_QUIZZES_PER_USER} quizzes
            </StatPill>
          )}
          <StatPill accent={questionLimitReached ? 'amber' : 'cyan'}>
            {questions.length}/{MAX_QUESTIONS_PER_QUIZ} {isPt ? 'perguntas' : 'questions'}
          </StatPill>
          <button
            type="button"
            onClick={() => setActiveTab('editor')}
            className={activeTab === 'editor' ? 'btn-primary whitespace-nowrap' : 'btn-secondary whitespace-nowrap'}
          >
            <Layers className="h-4 w-4" />
            {isPt ? 'Editor Visual' : 'Visual Editor'}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ai')}
            className={activeTab === 'ai' ? 'btn-primary whitespace-nowrap' : 'btn-secondary whitespace-nowrap'}
          >
            <Sparkles className="h-4 w-4" />
            {isPt ? 'Prompt para IA' : 'AI Prompt Generator'}
          </button>
        </div>
      </div>

      {creatingBlockedByQuota && (
        <div className="mb-6 rounded-2xl border border-amber-300/40 bg-amber-400/12 p-4 text-sm text-amber-100 animate-in" role="alert">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            <div>
              <p className="font-bold text-amber-200">
                {isPt
                  ? `Limite de ${MAX_QUIZZES_PER_USER} quizzes atingido`
                  : `Limit of ${MAX_QUIZZES_PER_USER} quizzes reached`}
              </p>
              <p className="mt-1 text-xs leading-relaxed">
                {isPt
                  ? `Você já possui ${library.length} quizzes salvos na sua conta. Selecione um dos seus quizzes abaixo no seletor para editar ou excluir antes de criar um novo.`
                  : `You already have ${library.length} saved quizzes. Select an existing quiz below to edit or delete one before creating a new quiz.`}
              </p>
            </div>
          </div>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className={`mb-6 rounded-2xl border px-4 py-3 text-sm font-semibold animate-in ${
            notice.kind === 'error'
              ? 'notice'
              : 'border-emerald-400/35 bg-emerald-500/15 text-emerald-200'
          }`}
        >
          {notice.text}
        </div>
      )}

      {activeTab === 'ai' ? (
        <div className="grid gap-6 lg:grid-cols-2 animate-in">
          <section className="glass p-6 sm:p-7 space-y-5">
            <div>
              <StatPill accent="violet"><Sparkles className="h-3.5 w-3.5" /> {isPt ? 'Passo 1 · Configurar prompt' : 'Step 1 · Configure prompt'}</StatPill>
              <h2 className="mt-3 text-xl font-bold">
                {isPt ? 'Gerador de prompt para qualquer IA' : 'Universal AI prompt generator'}
              </h2>
              <p className="text-muted mt-1 text-sm">
                {isPt
                  ? `Preencha o tema, copie o prompt gerado e cole no ChatGPT, Claude ou Gemini para gerar até ${MAX_QUESTIONS_PER_QUIZ} perguntas.`
                  : `Fill in your topic, copy the generated prompt, and paste it into any AI assistant to generate up to ${MAX_QUESTIONS_PER_QUIZ} questions.`}
              </p>
            </div>

            <label className="block">
              <span className="label">{isPt ? 'Tema, livro bíblico ou texto base' : 'Topic, Bible book, or source notes'}</span>
              <textarea
                className="field min-h-28 text-sm"
                value={aiTopic}
                onChange={(e) => setAiTopic(e.target.value)}
                placeholder={
                  isPt
                    ? 'Ex: Parábolas de Jesus no Evangelho de Lucas (capítulos 15 e 16)...'
                    : 'e.g. Parables of Jesus in the Gospel of Luke...'
                }
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block">
                <span className="label">{isPt ? `Perguntas (máx. ${MAX_QUESTIONS_PER_QUIZ})` : `Questions (max ${MAX_QUESTIONS_PER_QUIZ})`}</span>
                <input
                  type="number"
                  min={3}
                  max={MAX_QUESTIONS_PER_QUIZ}
                  className="field text-sm"
                  value={aiCount}
                  onChange={(e) => setAiCount(Math.max(3, Math.min(MAX_QUESTIONS_PER_QUIZ, Number(e.target.value) || 5)))}
                />
              </label>

              <label className="block">
                <span className="label">{isPt ? 'Dificuldade' : 'Difficulty'}</span>
                <select
                  className="field text-sm"
                  value={aiDifficulty}
                  onChange={(e) => setAiDifficulty(e.target.value as typeof aiDifficulty)}
                >
                  <option value="easy">{isPt ? 'Fácil' : 'Easy'}</option>
                  <option value="medium">{isPt ? 'Médio' : 'Medium'}</option>
                  <option value="hard">{isPt ? 'Difícil' : 'Hard'}</option>
                  <option value="mixed">{isPt ? 'Misto' : 'Mixed'}</option>
                </select>
              </label>

              <label className="block">
                <span className="label">{isPt ? 'Idioma do quiz' : 'Quiz language'}</span>
                <select
                  className="field text-sm"
                  value={aiLang}
                  onChange={(e) => setAiLang(e.target.value as 'pt' | 'en')}
                >
                  <option value="pt">Português (PT-BR)</option>
                  <option value="en">English</option>
                </select>
              </label>
            </div>

            <div className="space-y-2.5">
              <span className="label mb-1">{isPt ? 'Formatos & recursos incluídos' : 'Included formats & features'}</span>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <label className="glass-soft flex cursor-pointer items-center gap-2.5 px-3.5 py-2.5 text-sm font-semibold">
                  <input type="checkbox" checked={aiIncludeTF} onChange={(e) => setAiIncludeTF(e.target.checked)} className="accent-[#a58bff]" />
                  <span>{isPt ? 'Verdadeiro ou Falso' : 'True / False'}</span>
                </label>
                <label className="glass-soft flex cursor-pointer items-center gap-2.5 px-3.5 py-2.5 text-sm font-semibold">
                  <input type="checkbox" checked={aiIncludeMulti} onChange={(e) => setAiIncludeMulti(e.target.checked)} className="accent-[#a58bff]" />
                  <span>{isPt ? 'Múltiplas corretas' : 'Multi-select'}</span>
                </label>
                <label className="glass-soft flex cursor-pointer items-center gap-2.5 px-3.5 py-2.5 text-sm font-semibold">
                  <input type="checkbox" checked={aiInclude2x} onChange={(e) => setAiInclude2x(e.target.checked)} className="accent-[#a58bff]" />
                  <span>{isPt ? 'Perguntas Bônus 2x' : '2x Bonus questions'}</span>
                </label>
                <label className="glass-soft flex cursor-pointer items-center gap-2.5 px-3.5 py-2.5 text-sm font-semibold">
                  <input type="checkbox" checked={aiIncludeCode} onChange={(e) => setAiIncludeCode(e.target.checked)} className="accent-[#a58bff]" />
                  <span>{isPt ? 'Trechos de código' : 'Code snippets'}</span>
                </label>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="label mb-0">{isPt ? 'Prompt pronto para copiar' : 'Ready-to-copy prompt'}</span>
                <button type="button" onClick={copyPrompt} className="btn-secondary px-3 py-1.5 text-xs">
                  {promptCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {promptCopied ? (isPt ? 'Copiado!' : 'Copied!') : (isPt ? 'Copiar prompt' : 'Copy prompt')}
                </button>
              </div>
              <pre className="quiz-template-code max-h-64 whitespace-pre-wrap text-xs">{generatedAiPrompt}</pre>
            </div>
          </section>

          <section className="glass p-6 sm:p-7 flex flex-col justify-between gap-5">
            <div className="space-y-4">
              <StatPill accent="mint"><FileJson className="h-3.5 w-3.5" /> {isPt ? 'Passo 2 · Importar resposta da IA' : 'Step 2 · Import AI output'}</StatPill>
              <h2 className="text-xl font-bold">
                {isPt ? 'Colar JSON gerado pela IA' : 'Paste AI-generated JSON'}
              </h2>
              <p className="text-muted text-sm">
                {isPt
                  ? `Depois que a IA responder com o JSON (até ${MAX_QUESTIONS_PER_QUIZ} perguntas), cole abaixo para carregar automaticamente no editor.`
                  : `Once your AI outputs JSON (up to ${MAX_QUESTIONS_PER_QUIZ} questions), paste it below to load into the visual editor.`}
              </p>
              <textarea
                className="field min-h-80 font-mono text-xs"
                value={aiJsonPaste}
                onChange={(e) => setAiJsonPaste(e.target.value)}
                placeholder='{"name": "Meu Quiz", "questions": [ ... ]}'
              />
            </div>
            <button
              type="button"
              onClick={importFromAiPaste}
              disabled={!aiJsonPaste.trim() || creatingBlockedByQuota}
              className="btn-primary btn-success w-full"
            >
              <Upload className="h-4 w-4" />
              {isPt ? 'Carregar no Editor Visual' : 'Load into Visual Editor'}
            </button>
          </section>
        </div>
      ) : (
        <div className="space-y-6 animate-in">
          <section className="glass p-6 sm:p-7 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <select
                  className="field w-auto min-w-52 py-2.5 text-sm"
                  value={loadedId ?? ''}
                  onChange={(e) => {
                    const val = e.target.value
                    if (!val) {
                      setLoadedId(null)
                      setName('')
                      setSlug('')
                      setDescription('')
                      setQuestions([createEmptyQuestion('multiple_choice', locale)])
                    } else {
                      void loadQuizForEdit(val)
                    }
                  }}
                >
                  <option value="">
                    {creatorAtLimit
                      ? isPt
                        ? `Limite (${MAX_QUIZZES_PER_USER}/${MAX_QUIZZES_PER_USER}) — selecione um quiz para editar`
                        : `Limit (${MAX_QUIZZES_PER_USER}/${MAX_QUIZZES_PER_USER}) — select a quiz to edit`
                      : isPt
                        ? '+ Novo quiz em branco'
                        : '+ New blank quiz'}
                  </option>
                  {library.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.id} — {item.name}
                    </option>
                  ))}
                </select>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.csv,application/json,text/csv"
                  className="hidden"
                  onChange={handleFileImport}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-secondary whitespace-nowrap px-3.5 py-2.5 text-xs"
                >
                  <Upload className="h-4 w-4" /> {isPt ? 'Importar JSON / CSV' : 'Import JSON / CSV'}
                </button>
                <button
                  type="button"
                  onClick={downloadCsvTemplate}
                  className="btn-ghost whitespace-nowrap px-3 py-2 text-xs"
                >
                  <FileSpreadsheet className="h-4 w-4" /> {isPt ? 'Modelo CSV' : 'CSV Template'}
                </button>
                <button
                  type="button"
                  onClick={downloadJsonExport}
                  className="btn-ghost whitespace-nowrap px-3 py-2 text-xs"
                >
                  <Download className="h-4 w-4" /> {isPt ? 'Baixar JSON' : 'Export JSON'}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {loadedId && !confirmDelete && (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="btn-cancel min-w-0 px-3.5 py-2.5 text-xs"
                  >
                    <Trash2 className="h-4 w-4" /> {isPt ? 'Excluir' : 'Delete'}
                  </button>
                )}
                {loadedId && confirmDelete && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={handleDelete}
                      className="btn-cancel min-w-0 px-3.5 py-2.5 text-xs"
                    >
                      {deleting ? '...' : isPt ? 'Confirmar exclusão' : 'Confirm delete'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="btn-ghost px-2.5 py-2 text-xs"
                    >
                      {isPt ? 'Cancelar' : 'Cancel'}
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  disabled={saving || creatingBlockedByQuota}
                  onClick={handleSave}
                  className="btn-primary btn-success whitespace-nowrap px-5 py-2.5 text-sm disabled:opacity-50"
                >
                  <Save className="h-4 w-4" /> {saving ? (isPt ? 'Salvando...' : 'Saving...') : (isPt ? 'Salvar Quiz' : 'Save Quiz')}
                </button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block">
                <span className="label">{isPt ? 'Categoria (pasta)' : 'Category'}</span>
                <input
                  type="text"
                  list="quiz-categories-list"
                  className="field text-sm"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="geral"
                />
                <datalist id="quiz-categories-list">
                  {existingCategories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </label>

              <label className="block sm:col-span-2">
                <span className="label">{isPt ? 'Título do Quiz' : 'Quiz Title'}</span>
                <input
                  type="text"
                  className="field text-sm"
                  value={name}
                  maxLength={140}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={isPt ? 'Ex: Parábolas de Jesus · Turma A' : 'e.g. Parables of Jesus'}
                />
              </label>
            </div>

            <label className="block">
              <span className="label">{isPt ? 'Descrição curta (opcional)' : 'Short description (optional)'}</span>
              <input
                type="text"
                className="field text-sm"
                maxLength={500}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={isPt ? 'Descreva o foco do quiz para aparecer na biblioteca.' : 'Describe what this quiz covers.'}
              />
            </label>
          </section>

          <div className="space-y-4">
            {questions.map((question, qIndex) => (
              <article
                key={question.uid}
                draggable
                onDragStart={() => setDragIndex(qIndex)}
                onDragOver={(e) => {
                  e.preventDefault()
                  if (dragOverIndex !== qIndex) setDragOverIndex(qIndex)
                }}
                onDragLeave={() => {
                  if (dragOverIndex === qIndex) setDragOverIndex(null)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragIndex !== null) moveQuestion(dragIndex, qIndex)
                  setDragIndex(null)
                  setDragOverIndex(null)
                }}
                onDragEnd={() => {
                  setDragIndex(null)
                  setDragOverIndex(null)
                }}
                className={`glass p-5 sm:p-6 transition-all ${
                  dragOverIndex === qIndex ? 'ring-2 ring-[#7de2e4]' : ''
                }`}
              >
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span
                      className="inline-flex cursor-grab items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs font-extrabold text-[#cbbdff]"
                      title={isPt ? 'Arraste para reordenar' : 'Drag to reorder'}
                    >
                      <GripVertical className="h-4 w-4" />
                      #{String(qIndex + 1).padStart(2, '0')}
                    </span>

                    <select
                      className="field w-auto py-1.5 text-xs font-bold"
                      value={question.type}
                      onChange={(e) => changeQuestionType(question.uid, e.target.value as QuestionType)}
                    >
                      <option value="multiple_choice">{isPt ? 'Múltipla escolha (1 correta)' : 'Multiple choice (single)'}</option>
                      <option value="true_false">{isPt ? 'Verdadeiro ou Falso' : 'True or False'}</option>
                      <option value="multi_select">{isPt ? 'Múltiplas corretas' : 'Multi-select (multiple)'}</option>
                    </select>

                    <button
                      type="button"
                      onClick={() =>
                        updateQuestion(question.uid, (q) => ({
                          ...q,
                          pointsMultiplier: q.pointsMultiplier === 2 ? 1 : 2,
                        }))
                      }
                      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-extrabold transition ${
                        question.pointsMultiplier === 2
                          ? 'border-amber-300/70 bg-amber-400/20 text-amber-200'
                          : 'border-white/15 bg-white/5 text-[#b7c2e2] hover:text-white'
                      }`}
                    >
                      <Zap className="h-3.5 w-3.5" />
                      {question.pointsMultiplier === 2 ? '2x BÔNUS ATIVO' : '1x Normal'}
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={qIndex === 0}
                      onClick={() => moveQuestion(qIndex, qIndex - 1)}
                      className="btn-ghost p-2 text-xs disabled:opacity-30"
                      title="Mover para cima"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={qIndex === questions.length - 1}
                      onClick={() => moveQuestion(qIndex, qIndex + 1)}
                      className="btn-ghost p-2 text-xs disabled:opacity-30"
                      title="Mover para baixo"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={questionLimitReached}
                      onClick={() => duplicateQuestion(qIndex)}
                      className="btn-ghost p-2 text-xs disabled:opacity-30"
                      title="Duplicar pergunta"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={questions.length <= 1}
                      onClick={() => removeQuestion(question.uid)}
                      className="btn-ghost p-2 text-xs text-rose-300 hover:text-rose-200 disabled:opacity-30"
                      title="Remover pergunta"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <label className="block">
                  <span className="label">{isPt ? 'Enunciado da pergunta' : 'Question text'}</span>
                  <textarea
                    className="field min-h-20 text-base font-semibold"
                    value={question.body}
                    onChange={(e) => updateQuestion(question.uid, (q) => ({ ...q, body: e.target.value }))}
                    placeholder={isPt ? 'Digite a pergunta aqui...' : 'Enter your question here...'}
                  />
                </label>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="label flex items-center gap-1.5 text-xs">
                      <ImageIcon className="h-3.5 w-3.5 text-[#7de2e4]" />
                      {isPt ? 'URL de imagem ou GIF (opcional)' : 'Image or GIF URL (optional)'}
                    </span>
                    <input
                      type="url"
                      className="field py-2.5 text-xs"
                      value={question.imageUrl}
                      onChange={(e) => updateQuestion(question.uid, (q) => ({ ...q, imageUrl: e.target.value }))}
                      placeholder="https://..."
                    />
                  </label>

                  <label className="block">
                    <span className="label flex items-center gap-1.5 text-xs">
                      <Code2 className="h-3.5 w-3.5 text-[#cbbdff]" />
                      {isPt ? 'Linguagem do código (opcional)' : 'Code language (optional)'}
                    </span>
                    <input
                      type="text"
                      className="field py-2.5 text-xs"
                      value={question.codeLanguage}
                      onChange={(e) => updateQuestion(question.uid, (q) => ({ ...q, codeLanguage: e.target.value }))}
                      placeholder="python, typescript, sql..."
                    />
                  </label>
                </div>

                {(question.codeSnippet || question.codeLanguage) && (
                  <label className="mt-3 block">
                    <span className="label text-xs">{isPt ? 'Trecho de código' : 'Code snippet'}</span>
                    <textarea
                      className="field min-h-24 font-mono text-xs"
                      value={question.codeSnippet}
                      onChange={(e) => updateQuestion(question.uid, (q) => ({ ...q, codeSnippet: e.target.value }))}
                      placeholder="def hello():&#10;    return 'world'"
                    />
                  </label>
                )}

                {!question.codeSnippet && !question.codeLanguage && (
                  <button
                    type="button"
                    onClick={() => updateQuestion(question.uid, (q) => ({ ...q, codeLanguage: 'javascript' }))}
                    className="btn-ghost mt-2 px-2 py-1 text-xs text-[#7de2e4]"
                  >
                    + {isPt ? 'Adicionar bloco de código' : 'Add code snippet'}
                  </button>
                )}

                {(question.imageUrl || question.codeSnippet) && (
                  <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#b7c2e2]">
                      {isPt ? 'Prévia da mídia' : 'Media preview'}
                    </p>
                    <QuestionMedia
                      imageUrl={question.imageUrl || undefined}
                      codeSnippet={question.codeSnippet || undefined}
                      codeLanguage={question.codeLanguage || undefined}
                    />
                  </div>
                )}

                <div className="mt-5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="label mb-0">
                      {question.type === 'multi_select'
                        ? isPt
                          ? 'Alternativas (marque todas as corretas)'
                          : 'Choices (check all correct)'
                        : isPt
                          ? 'Alternativas (marque a correta)'
                          : 'Choices (select correct answer)'}
                    </span>
                    {question.type !== 'true_false' && question.choices.length < 6 && (
                      <button
                        type="button"
                        onClick={() =>
                          updateQuestion(question.uid, (q) => ({
                            ...q,
                            choices: [...q.choices, { id: makeUid(), body: '', is_correct: false }],
                          }))
                        }
                        className="btn-secondary px-3 py-1 text-xs"
                      >
                        <Plus className="h-3.5 w-3.5" /> {isPt ? 'Alternativa' : 'Add choice'}
                      </button>
                    )}
                  </div>

                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {question.choices.map((choice, cIdx) => (
                      <div
                        key={choice.id}
                        className={`flex items-center gap-2 rounded-xl border p-2.5 transition ${
                          choice.is_correct
                            ? 'border-emerald-400/60 bg-emerald-500/12'
                            : 'border-white/15 bg-white/5'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleChoiceCorrect(question.uid, choice.id)}
                          aria-label={choice.is_correct ? 'Correta' : 'Marcar como correta'}
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-sm font-bold transition ${
                            choice.is_correct
                              ? 'border-emerald-300 bg-emerald-400 text-[#10291c]'
                              : 'border-white/25 bg-white/5 text-white/40 hover:text-white'
                          }`}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                        <input
                          type="text"
                          className="min-w-0 flex-1 bg-transparent px-1 py-1 text-sm font-medium text-white outline-none placeholder:text-white/35"
                          value={choice.body}
                          onChange={(e) =>
                            updateQuestion(question.uid, (q) => ({
                              ...q,
                              choices: q.choices.map((item) =>
                                item.id === choice.id ? { ...item, body: e.target.value } : item,
                              ),
                            }))
                          }
                          placeholder={`${isPt ? 'Opção' : 'Option'} ${cIdx + 1}`}
                        />
                        {question.type !== 'true_false' && question.choices.length > 2 && (
                          <button
                            type="button"
                            onClick={() =>
                              updateQuestion(question.uid, (q) => {
                                const next = q.choices.filter((item) => item.id !== choice.id)
                                if (!next.some((item) => item.is_correct) && next[0]) next[0].is_correct = true
                                return { ...q, choices: next }
                              })
                            }
                            className="p-1 text-rose-300/75 hover:text-rose-200"
                            title="Remover alternativa"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="space-y-3 pt-2">
            {questionLimitReached && (
              <p className="text-center text-xs font-semibold text-amber-200">
                {isPt
                  ? `Limite máximo de ${MAX_QUESTIONS_PER_QUIZ} perguntas por quiz atingido.`
                  : `Maximum limit of ${MAX_QUESTIONS_PER_QUIZ} questions per quiz reached.`}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                disabled={questionLimitReached}
                onClick={() => addQuestion('multiple_choice')}
                className="btn-secondary disabled:opacity-40"
              >
                <Plus className="h-4 w-4" /> {isPt ? 'Múltipla escolha' : 'Multiple choice'}
              </button>
              <button
                type="button"
                disabled={questionLimitReached}
                onClick={() => addQuestion('true_false')}
                className="btn-secondary disabled:opacity-40"
              >
                <Plus className="h-4 w-4" /> {isPt ? 'Verdadeiro / Falso' : 'True / False'}
              </button>
              <button
                type="button"
                disabled={questionLimitReached}
                onClick={() => addQuestion('multi_select')}
                className="btn-secondary disabled:opacity-40"
              >
                <Plus className="h-4 w-4" /> {isPt ? 'Múltiplas corretas' : 'Multi-select'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function QuizEditor({
  mode,
  backHref,
}: {
  mode: 'admin' | 'creator'
  backHref: string
}) {
  return (
    <Suspense
      fallback={
        <div className="container-game glass mt-8 flex min-h-72 items-center justify-center">
          <div className="flex gap-2">
            <span className="loading-dot" />
            <span className="loading-dot" />
            <span className="loading-dot" />
          </div>
        </div>
      }
    >
      <QuizEditorInner mode={mode} backHref={backHref} />
    </Suspense>
  )
}
