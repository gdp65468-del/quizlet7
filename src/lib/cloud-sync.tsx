'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { AppwriteException, ID, Permission, Query, Role } from 'appwrite'
import { AlertTriangle, Cloud, Database, Eye, EyeOff, KeyRound, Lock, LogOut, Mail, RefreshCw, UserPlus, X } from 'lucide-react'
import {
  APPWRITE_CONFIG,
  getAppwriteServices,
  isAppwriteConfigured,
  pingAppwriteOnce,
  toAppwriteDocId,
} from '@/lib/appwrite'
import { useI18n } from '@/lib/i18n'
import {
  INACTIVITY_POLICY_TEXT_EN,
  INACTIVITY_POLICY_TEXT_PT,
  MAX_QUESTIONS_JSON_BYTES,
  MAX_QUESTIONS_PER_QUIZ,
  MAX_QUIZZES_PER_USER,
  utf8ByteLength,
} from '@/lib/quiz-limits'
import type { QuizSet, SessionReport } from '@/types/game'

export type CloudUser = {
  $id: string
  email: string
  name: string
}

type CloudSyncContextValue = {
  user: CloudUser | null
  authReady: boolean
  isCloudConfigured: boolean
  syncing: boolean
  cloudReports: SessionReport[]
  getJwt: () => Promise<string | null>
  openCloudAuth: () => void
  signOutCloud: () => Promise<void>
  saveQuizToCloud: (quiz: {
    category: string
    slug: string
    name: string
    description: string
    questions: QuizSet['questions']
    previousId?: string
  }) => Promise<void>
  deleteQuizFromCloud: (quizId: string) => Promise<void>
  saveSessionToCloud: (report: SessionReport) => Promise<void>
  updateSessionClassInCloud: (sessionId: string, classLabel: string) => Promise<void>
  refreshCloudData: () => Promise<void>
}

const CloudSyncContext = createContext<CloudSyncContextValue>({
  user: null,
  authReady: false,
  isCloudConfigured: false,
  syncing: false,
  cloudReports: [],
  getJwt: async () => null,
  openCloudAuth: () => {},
  signOutCloud: async () => {},
  saveQuizToCloud: async () => {},
  deleteQuizFromCloud: async () => {},
  saveSessionToCloud: async () => {},
  updateSessionClassInCloud: async () => {},
  refreshCloudData: async () => {},
})

function safeParseJson<T>(raw: unknown, fallback: T): T {
  if (Array.isArray(raw)) return raw as T
  if (typeof raw !== 'string' || !raw.trim()) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function ownerPermissions(uid: string) {
  return [
    Permission.read(Role.user(uid)),
    Permission.update(Role.user(uid)),
    Permission.delete(Role.user(uid)),
  ]
}

function currentHostnameHint() {
  if (typeof window === 'undefined') return ''
  return window.location.hostname || ''
}

export function formatAppwriteAuthError(err: unknown, locale: 'pt' | 'en'): string {
  const host = currentHostnameHint()
  const hostTipPt = host
    ? ` Adicione o hostname "${host}" (sem https://) em Overview → Platforms → Add Platform → Web no painel do Appwrite.`
    : ' Adicione o domínio atual em Overview → Platforms → Web no painel do Appwrite.'
  const hostTipEn = host
    ? ` Add hostname "${host}" (without https://) under Overview → Platforms → Add Platform → Web in your Appwrite console.`
    : ' Add this hostname under Overview → Platforms → Web in your Appwrite console.'

  if (err instanceof AppwriteException) {
    if (err.code === 401) {
      if (err.type === 'user_invalid_credentials') {
        return locale === 'pt'
          ? 'E-mail ou senha incorretos. Confira seus dados ou use "Esqueceu sua senha?" abaixo.'
          : 'Invalid email or password. Check your credentials or use "Forgot your password?" below.'
      }
      if (err.type === 'general_unauthorized_scope') {
        return locale === 'pt'
          ? 'Sessão não persistiu no navegador (cookies de terceiros bloqueados para cloud.appwrite.io). Permita cookies de terceiros para este site ou abra em nova aba.'
          : 'Browser blocked third-party session cookies for cloud.appwrite.io. Allow third-party cookies or open in a new tab.'
      }
      if (err.type === 'user_blocked') {
        return locale === 'pt'
          ? 'Esta conta está bloqueada no Appwrite.'
          : 'This account is blocked in Appwrite.'
      }
      const typeLabel = err.type ? ` (${err.type})` : ''
      return locale === 'pt'
        ? `Autorização recusada pelo Appwrite${typeLabel}: ${err.message}`
        : `Appwrite authorization failed${typeLabel}: ${err.message}`
    }
    if (err.code === 409) {
      return locale === 'pt'
        ? 'Este e-mail já está cadastrado. Use a aba "Entrar" para acessar sua conta.'
        : 'This email is already registered. Switch to the "Sign in" tab to access your account.'
    }
    if (err.code === 404) {
      if (err.type === 'user_not_found') {
        return locale === 'pt'
          ? 'Nenhuma conta encontrada com este e-mail.'
          : 'No account found with this email.'
      }
      return locale === 'pt'
        ? `Banco (${APPWRITE_CONFIG.databaseId}) ou coleção não encontrada no Appwrite.`
        : `Database (${APPWRITE_CONFIG.databaseId}) or collection not found in Appwrite.`
    }
    if (err.code === 400 && /invalid.*token|expired/i.test(err.message)) {
      return locale === 'pt'
        ? 'O link de recuperação é inválido ou expirou. Solicite um novo link em "Esqueceu sua senha?".'
        : 'This recovery link is invalid or expired. Request a new one via "Forgot your password?".'
    }
    if (err.code === 0 || /network|cors|fetch|origin/i.test(err.message)) {
      return locale === 'pt'
        ? `Conexão bloqueada pelo Appwrite (CORS / Origem não registrada).${hostTipPt}`
        : `Blocked by Appwrite (CORS / Unregistered Origin).${hostTipEn}`
    }
    return err.message
  }
  if (err instanceof TypeError && /fetch/i.test(err.message)) {
    return locale === 'pt'
      ? `Não foi possível conectar ao Appwrite (origem bloqueada).${hostTipPt}`
      : `Could not reach Appwrite (blocked origin).${hostTipEn}`
  }
  return err instanceof Error ? err.message : 'Appwrite error'
}

export function CloudSyncProvider({ children }: { children: React.ReactNode }) {
  const { locale, t } = useI18n()
  const [user, setUser] = useState<CloudUser | null>(null)
  const [authReady, setAuthReady] = useState(!isAppwriteConfigured)
  const [syncing, setSyncing] = useState(false)
  const [cloudReports, setCloudReports] = useState<SessionReport[]>([])

  const [modalOpen, setModalOpen] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'recovery'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [authPending, setAuthPending] = useState(false)
  const [authError, setAuthError] = useState('')
  const [authInfo, setAuthInfo] = useState('')

  const jwtCacheRef = useRef<{ token: string; userId: string; expiresAt: number } | null>(null)

  const getJwt = useCallback(async (): Promise<string | null> => {
    const services = getAppwriteServices()
    if (!services || !user) return null
    const now = Date.now()
    if (
      jwtCacheRef.current &&
      jwtCacheRef.current.userId === user.$id &&
      jwtCacheRef.current.expiresAt > now
    ) {
      return jwtCacheRef.current.token
    }
    try {
      const created = await services.account.createJWT()
      if (created?.jwt) {
        jwtCacheRef.current = {
          token: created.jwt,
          userId: user.$id,
          expiresAt: now + 10 * 60 * 1000,
        }
        return created.jwt
      }
      return null
    } catch {
      return null
    }
  }, [user])

  useEffect(() => {
    const services = getAppwriteServices()
    if (!services) return

    pingAppwriteOnce()
    let active = true
    services.account
      .get()
      .then((acc) => {
        if (!active) return
        setUser({
          $id: acc.$id,
          email: acc.email || '',
          name: acc.name || acc.email || 'Criador',
        })
      })
      .catch(() => {
        if (!active) return
        jwtCacheRef.current = null
        setUser(null)
      })
      .finally(() => {
        if (active) setAuthReady(true)
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!modalOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !authPending) {
        setModalOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [modalOpen, authPending])

  const refreshCloudData = useCallback(async () => {
    const services = getAppwriteServices()
    if (!services || !user) {
      setCloudReports([])
      return
    }
    setSyncing(true)
    try {
      const response = await services.databases.listDocuments({
        databaseId: APPWRITE_CONFIG.databaseId,
        collectionId: APPWRITE_CONFIG.sessionsCollectionId,
        queries: [Query.equal('ownerId', user.$id), Query.limit(100)],
      })
      const list: SessionReport[] = response.documents.map((doc) => {
        const d = doc as unknown as Record<string, unknown>
        return {
          id: String(d.sessionId ?? doc.$id),
          quizId: String(d.quizId ?? ''),
          quizName: String(d.quizName ?? ''),
          category: String(d.category ?? ''),
          classLabel: String(d.classLabel ?? ''),
          completedAt: typeof d.completedAt === 'string' && d.completedAt ? d.completedAt : doc.$createdAt,
          questionCount: Number(d.questionCount ?? 0),
          participantCount: Number(d.participantCount ?? 0),
          averageAccuracy: Number(d.averageAccuracy ?? 0),
          topScorer: String(d.topScorer ?? ''),
          leaderboard: safeParseJson<SessionReport['leaderboard']>(
            d.leaderboardJson ?? d.leaderboard,
            [],
          ),
          questionStats: safeParseJson<SessionReport['questionStats']>(
            d.questionStatsJson ?? d.questionStats,
            [],
          ),
        }
      })
      list.sort((a, b) => b.completedAt.localeCompare(a.completedAt))
      setCloudReports(list)
    } catch (error) {
      console.warn('Appwrite listDocuments error:', error)
    } finally {
      setSyncing(false)
    }
  }, [user])

  useEffect(() => {
    if (authReady && user) {
      const timer = setTimeout(() => {
        void refreshCloudData().catch(() => {})
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [authReady, user, refreshCloudData])

  const openCloudAuth = useCallback(() => {
    setAuthError('')
    setAuthInfo('')
    setAuthMode('login')
    setModalOpen(true)
  }, [])

  const signOutCloud = useCallback(async () => {
    const services = getAppwriteServices()
    if (services) {
      await services.account.deleteSession({ sessionId: 'current' }).catch(() => {})
    }
    await fetch('/api/auth/session', { method: 'DELETE', credentials: 'include' }).catch(() => {})
    jwtCacheRef.current = null
    setUser(null)
    setCloudReports([])
    setModalOpen(false)
  }, [])

  const handleAuthSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const services = getAppwriteServices()
    if (!services || authPending) return

    setAuthPending(true)
    setAuthError('')
    setAuthInfo('')
    try {
      const cleanEmail = email.trim()

      if (authMode === 'recovery') {
        const redirectUrl = `${window.location.origin}/login`
        await services.account.createRecovery({
          email: cleanEmail,
          url: redirectUrl,
        })
        setAuthInfo(
          locale === 'pt'
            ? `Enviamos um link de redefinição de senha para ${cleanEmail}. Verifique sua caixa de entrada e a pasta de spam.`
            : `We sent a password reset link to ${cleanEmail}. Check your inbox and spam folder.`,
        )
        return
      }

      if (authMode === 'register') {
        await services.account.create({
          userId: ID.unique(),
          email: cleanEmail,
          password,
          name: name.trim() || undefined,
        })
      }
      try {
        await services.account.createEmailPasswordSession({
          email: cleanEmail,
          password,
        })
      } catch (sessionErr) {
        if (
          sessionErr instanceof AppwriteException &&
          sessionErr.type === 'user_session_already_exists'
        ) {
          await services.account.deleteSession({ sessionId: 'current' }).catch(() => {})
          await services.account.createEmailPasswordSession({
            email: cleanEmail,
            password,
          })
        } else {
          throw sessionErr
        }
      }
      const acc = await services.account.get()
      const createdJwt = await services.account.createJWT().catch(() => null)
      if (createdJwt?.jwt) {
        jwtCacheRef.current = {
          token: createdJwt.jwt,
          userId: acc.$id,
          expiresAt: Date.now() + 10 * 60 * 1000,
        }
        await fetch('/api/auth/session', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jwt: createdJwt.jwt }),
        }).catch(() => {})
      }
      setUser({
        $id: acc.$id,
        email: acc.email || cleanEmail,
        name: acc.name || acc.email || cleanEmail,
      })
      setPassword('')
      setModalOpen(false)
    } catch (err) {
      if (err instanceof AppwriteException && err.code === 409 && authMode === 'register') {
        setAuthMode('login')
        setPassword('')
        setAuthInfo(
          locale === 'pt'
            ? 'Este e-mail já está cadastrado! Mudamos para a aba "Entrar" — digite sua senha abaixo ou clique em "Esqueceu sua senha?".'
            : 'This email is already registered! Switched to "Sign in" — enter your password below or click "Forgot your password?".',
        )
      } else {
        setAuthError(formatAppwriteAuthError(err, locale))
      }
    } finally {
      setAuthPending(false)
    }
  }

  const saveQuizToCloud = useCallback(
    async (quiz: {
      category: string
      slug: string
      name: string
      description: string
      questions: QuizSet['questions']
      previousId?: string
    }) => {
      const services = getAppwriteServices()
      if (!services || !user) return

      if (quiz.questions.length > MAX_QUESTIONS_PER_QUIZ) {
        throw new Error(
          locale === 'pt'
            ? `Cada quiz pode ter no máximo ${MAX_QUESTIONS_PER_QUIZ} perguntas.`
            : `Each quiz can have at most ${MAX_QUESTIONS_PER_QUIZ} questions.`,
        )
      }

      const fullQuizId = `${quiz.category}/${quiz.slug}`.slice(0, 128)
      const docId = toAppwriteDocId(`quiz_${user.$id}_${quiz.category}_${quiz.slug}`)
      const sanitizedQuestions = quiz.questions.map((q, idx) => ({
        id: String(q.id ?? idx),
        order: idx,
        type: q.type ?? 'multiple_choice',
        body: String(q.body).slice(0, 500),
        ...(q.imageUrl ? { imageUrl: String(q.imageUrl).slice(0, 1000) } : {}),
        ...(q.codeSnippet ? { codeSnippet: String(q.codeSnippet).slice(0, 4000) } : {}),
        ...(q.codeLanguage ? { codeLanguage: String(q.codeLanguage).slice(0, 32) } : {}),
        pointsMultiplier: q.pointsMultiplier === 2 ? 2 : 1,
        choices: q.choices.slice(0, 6).map((c, cIdx) => ({
          id: String(c.id ?? `${idx}-${cIdx}`),
          body: String(c.body).slice(0, 300),
          is_correct: Boolean(c.is_correct),
        })),
      }))

      const questionsJson = JSON.stringify(sanitizedQuestions)
      if (utf8ByteLength(questionsJson) > MAX_QUESTIONS_JSON_BYTES) {
        throw new Error(
          locale === 'pt'
            ? `O conteúdo do quiz excede o limite seguro do Appwrite (${MAX_QUESTIONS_JSON_BYTES} bytes). Reduza o texto das perguntas ou trechos de código.`
            : `Quiz payload exceeds Appwrite safe limit (${MAX_QUESTIONS_JSON_BYTES} bytes).`,
        )
      }

      const data = {
        ownerId: user.$id,
        quizId: fullQuizId,
        category: quiz.category.slice(0, 64),
        slug: quiz.slug.slice(0, 64),
        name: String(quiz.name).slice(0, 140),
        description: String(quiz.description ?? '').slice(0, 500),
        questionCount: sanitizedQuestions.length,
        questionsJson,
        updatedAt: new Date().toISOString(),
      }

      try {
        await services.databases.getDocument({
          databaseId: APPWRITE_CONFIG.databaseId,
          collectionId: APPWRITE_CONFIG.quizzesCollectionId,
          documentId: docId,
        })
        await services.databases.updateDocument({
          databaseId: APPWRITE_CONFIG.databaseId,
          collectionId: APPWRITE_CONFIG.quizzesCollectionId,
          documentId: docId,
          data,
        })
      } catch (err) {
        if (err instanceof AppwriteException && err.code === 404) {
          const ownedList = await services.databases.listDocuments({
            databaseId: APPWRITE_CONFIG.databaseId,
            collectionId: APPWRITE_CONFIG.quizzesCollectionId,
            queries: [Query.equal('ownerId', user.$id), Query.limit(25)],
          })
          const prevDocId = quiz.previousId && quiz.previousId !== fullQuizId
            ? (() => {
                const [prevCat = '', prevSlug = ''] = quiz.previousId.split('/')
                return prevCat && prevSlug ? toAppwriteDocId(`quiz_${user.$id}_${prevCat}_${prevSlug}`) : null
              })()
            : null

          const willReplace = prevDocId
            ? ownedList.documents.some((d) => d.$id === prevDocId)
            : false

          if (!willReplace && ownedList.documents.length >= MAX_QUIZZES_PER_USER) {
            throw new Error(
              locale === 'pt'
                ? `Limite de ${MAX_QUIZZES_PER_USER} quizzes atingido. Edite ou exclua um quiz existente antes de criar um novo.`
                : `Limit of ${MAX_QUIZZES_PER_USER} quizzes reached. Edit or delete an existing quiz first.`,
            )
          }

          await services.databases.createDocument({
            databaseId: APPWRITE_CONFIG.databaseId,
            collectionId: APPWRITE_CONFIG.quizzesCollectionId,
            documentId: docId,
            data,
            permissions: ownerPermissions(user.$id),
          })

          if (prevDocId && prevDocId !== docId) {
            await services.databases
              .deleteDocument({
                databaseId: APPWRITE_CONFIG.databaseId,
                collectionId: APPWRITE_CONFIG.quizzesCollectionId,
                documentId: prevDocId,
              })
              .catch(() => {})
          }
        } else {
          throw err
        }
      }
    },
    [user, locale],
  )

  const deleteQuizFromCloud = useCallback(
    async (quizId: string) => {
      const services = getAppwriteServices()
      if (!services || !user) return
      const [category = '', slug = ''] = quizId.split('/')
      const docId = toAppwriteDocId(`quiz_${user.$id}_${category}_${slug}`)
      await services.databases
        .deleteDocument({
          databaseId: APPWRITE_CONFIG.databaseId,
          collectionId: APPWRITE_CONFIG.quizzesCollectionId,
          documentId: docId,
        })
        .catch(() => {})
    },
    [user],
  )

  const saveSessionToCloud = useCallback(
    async (report: SessionReport) => {
      const services = getAppwriteServices()
      if (!services || !user) return

      const docId = toAppwriteDocId(`sess_${user.$id}_${report.id}`)
      const cleanClassLabel = String(report.classLabel || '').slice(0, 80)
      const data = {
        ownerId: user.$id,
        sessionId: String(report.id).slice(0, 128),
        quizId: String(report.quizId).slice(0, 128),
        quizName: String(report.quizName).slice(0, 140),
        category: String(report.category || 'general').slice(0, 64),
        classLabel: cleanClassLabel,
        completedAt: report.completedAt || new Date().toISOString(),
        questionCount: Math.max(1, Math.min(MAX_QUESTIONS_PER_QUIZ, report.questionCount)),
        participantCount: Math.max(0, Math.min(500, report.participantCount)),
        averageAccuracy: Math.max(0, Math.min(100, Number(report.averageAccuracy.toFixed(1)))),
        topScorer: String(report.topScorer || '').slice(0, 64),
        leaderboardJson: JSON.stringify(report.leaderboard.slice(0, 500)).slice(0, 65535),
        questionStatsJson: JSON.stringify(report.questionStats.slice(0, MAX_QUESTIONS_PER_QUIZ)).slice(0, 65535),
      }

      try {
        const existing = await services.databases.getDocument({
          databaseId: APPWRITE_CONFIG.databaseId,
          collectionId: APPWRITE_CONFIG.sessionsCollectionId,
          documentId: docId,
        })
        if ((existing as unknown as Record<string, unknown>).classLabel !== cleanClassLabel) {
          await services.databases.updateDocument({
            databaseId: APPWRITE_CONFIG.databaseId,
            collectionId: APPWRITE_CONFIG.sessionsCollectionId,
            documentId: docId,
            data: { classLabel: cleanClassLabel },
          })
        }
      } catch (err) {
        if (err instanceof AppwriteException && err.code === 404) {
          await services.databases.createDocument({
            databaseId: APPWRITE_CONFIG.databaseId,
            collectionId: APPWRITE_CONFIG.sessionsCollectionId,
            documentId: docId,
            data,
            permissions: ownerPermissions(user.$id),
          })
        } else {
          throw err
        }
      }

      await refreshCloudData()
    },
    [user, refreshCloudData],
  )

  const updateSessionClassInCloud = useCallback(
    async (sessionId: string, classLabel: string) => {
      const services = getAppwriteServices()
      if (!services || !user) return
      const docId = toAppwriteDocId(`sess_${user.$id}_${sessionId}`)
      await services.databases.updateDocument({
        databaseId: APPWRITE_CONFIG.databaseId,
        collectionId: APPWRITE_CONFIG.sessionsCollectionId,
        documentId: docId,
        data: { classLabel: String(classLabel).slice(0, 80) },
      })
      await refreshCloudData()
    },
    [user, refreshCloudData],
  )

  return (
    <CloudSyncContext.Provider
      value={{
        user,
        authReady,
        isCloudConfigured: isAppwriteConfigured,
        syncing,
        cloudReports,
        getJwt,
        openCloudAuth,
        signOutCloud,
        saveQuizToCloud,
        deleteQuizFromCloud,
        saveSessionToCloud,
        updateSessionClassInCloud,
        refreshCloudData,
      }}
    >
      {children}

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={() => {
            if (!authPending) setModalOpen(false)
          }}
        >
          <section
            className="glass w-full max-w-lg border border-white/25 bg-[#10203a] p-6 sm:p-7 animate-in max-h-[90vh] overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="appwrite-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#f5cf70]/45 bg-[#f5cf70]/15 text-[#f5cf70]">
                  <Database className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <p className="eyebrow">Appwrite Auth</p>
                  <h2 id="appwrite-modal-title" className="text-xl font-extrabold tracking-tight text-white">
                    {user
                      ? locale === 'pt'
                        ? 'Conta conectada'
                        : 'Account connected'
                      : !isAppwriteConfigured
                        ? locale === 'pt'
                          ? 'Configurar Appwrite'
                          : 'Set up Appwrite'
                        : authMode === 'recovery'
                          ? locale === 'pt'
                            ? 'Recuperar senha'
                            : 'Reset password'
                          : authMode === 'login'
                            ? locale === 'pt'
                              ? 'Entrar com e-mail e senha'
                              : 'Sign in with email & password'
                            : locale === 'pt'
                              ? 'Criar conta de criador'
                              : 'Create creator account'}
                  </h2>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setModalOpen(false)}
                disabled={authPending}
                className="settings-close"
                aria-label={locale === 'pt' ? 'Fechar' : 'Close'}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {!isAppwriteConfigured ? (
              <div className="mt-5 space-y-4 text-sm leading-relaxed text-[#c7d5e8]">
                <p>
                  {locale === 'pt'
                    ? 'Defina NEXT_PUBLIC_APPWRITE_PROJECT_ID e NEXT_PUBLIC_APPWRITE_ENDPOINT para ativar a autenticação e sincronização no Appwrite.'
                    : 'Set NEXT_PUBLIC_APPWRITE_PROJECT_ID and NEXT_PUBLIC_APPWRITE_ENDPOINT to enable Appwrite authentication and sync.'}
                </p>
                <div className="flex justify-end pt-2">
                  <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">
                    {locale === 'pt' ? 'Entendi' : 'Got it'}
                  </button>
                </div>
              </div>
            ) : user ? (
              <div className="mt-5 space-y-4">
                <div className="glass-soft flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-white">{user.name}</p>
                    <p className="text-muted truncate text-xs">{user.email}</p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-200">
                    <Cloud className="h-3.5 w-3.5" /> {t.cloudConnected}
                  </span>
                </div>

                <div className="rounded-xl border border-amber-300/25 bg-amber-400/10 p-3 text-xs leading-relaxed text-amber-100">
                  <p className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                    <span>{locale === 'pt' ? INACTIVITY_POLICY_TEXT_PT : INACTIVITY_POLICY_TEXT_EN}</span>
                  </p>
                </div>

                <div className="flex flex-wrap justify-end gap-2.5">
                  <button
                    type="button"
                    disabled={syncing}
                    onClick={() => void refreshCloudData()}
                    className="btn-secondary px-4 py-2 text-xs"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                    {locale === 'pt' ? 'Sincronizar agora' : 'Sync now'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void signOutCloud()}
                    className="btn-cancel min-w-0 px-4 py-2 text-xs"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    {t.cloudSignOut}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/15 bg-white/5 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('login')
                      setAuthError('')
                      setAuthInfo('')
                    }}
                    className={`rounded-lg py-2 text-xs font-bold transition ${
                      authMode === 'login' ? 'bg-[#f5cf70] text-[#0b1526]' : 'text-[#cbd5e1] hover:text-white'
                    }`}
                  >
                    {t.signIn}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('register')
                      setAuthError('')
                      setAuthInfo('')
                    }}
                    className={`rounded-lg py-2 text-xs font-bold transition ${
                      authMode === 'register' ? 'bg-[#f5cf70] text-[#0b1526]' : 'text-[#cbd5e1] hover:text-white'
                    }`}
                  >
                    {t.createAccount}
                  </button>
                </div>

                <form onSubmit={handleAuthSubmit} className="space-y-3.5">
                  {authMode === 'register' && (
                    <label className="block">
                      <span className="label text-xs">{locale === 'pt' ? 'Nome' : 'Name'}</span>
                      <input
                        type="text"
                        className="field py-2.5 text-sm"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={locale === 'pt' ? 'Seu nome' : 'Your name'}
                      />
                    </label>
                  )}

                  <label className="block">
                    <span className="label text-xs flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5" /> E-mail
                    </span>
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      className="field py-2.5 text-sm"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="voce@exemplo.com"
                    />
                  </label>

                  {authMode !== 'recovery' && (
                    <div>
                      <label className="block">
                        <span className="label text-xs flex items-center gap-1.5">
                          <Lock className="h-3.5 w-3.5" /> {t.password}
                        </span>
                        <div className="relative">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            minLength={8}
                            autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                            className="field w-full py-2.5 pr-10 text-sm"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder={locale === 'pt' ? 'Mínimo 8 caracteres' : 'Minimum 8 characters'}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((prev) => !prev)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-300 hover:text-white"
                            aria-label={showPassword ? (locale === 'pt' ? 'Ocultar senha' : 'Hide password') : (locale === 'pt' ? 'Mostrar senha' : 'Show password')}
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </label>
                      {authMode === 'login' && (
                        <div className="mt-1.5 flex justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              setAuthMode('recovery')
                              setAuthError('')
                              setAuthInfo('')
                            }}
                            className="text-xs font-medium text-[#f5cf70] underline-offset-4 transition hover:text-white hover:underline"
                          >
                            {locale === 'pt' ? 'Esqueceu sua senha?' : 'Forgot your password?'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {authInfo && (
                    <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/15 p-3 text-xs leading-relaxed text-emerald-100" role="status">
                      {authInfo}
                    </div>
                  )}

                  {authError && (
                    <p className="notice text-xs" role="alert">
                      {authError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={authPending}
                    className="btn-primary btn-success w-full py-3 text-sm"
                  >
                    {authMode === 'recovery' ? (
                      <KeyRound className="h-4 w-4" />
                    ) : authMode === 'register' ? (
                      <UserPlus className="h-4 w-4" />
                    ) : (
                      <Cloud className="h-4 w-4" />
                    )}
                    {authPending
                      ? '...'
                      : authMode === 'recovery'
                        ? locale === 'pt'
                          ? 'Enviar link de recuperação'
                          : 'Send recovery link'
                        : authMode === 'login'
                          ? locale === 'pt'
                            ? 'Entrar com e-mail e senha'
                            : 'Sign in with email & password'
                          : locale === 'pt'
                            ? 'Criar conta e entrar'
                            : 'Create account & sign in'}
                  </button>

                  {authMode === 'recovery' && (
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('login')
                        setAuthError('')
                        setAuthInfo('')
                      }}
                      className="btn-ghost w-full py-2 text-xs"
                    >
                      {locale === 'pt' ? 'Voltar para Entrar' : 'Back to Sign in'}
                    </button>
                  )}
                </form>

                <div className="rounded-xl border border-amber-300/25 bg-amber-400/10 p-3 text-[11px] leading-relaxed text-amber-100">
                  {locale === 'pt' ? INACTIVITY_POLICY_TEXT_PT : INACTIVITY_POLICY_TEXT_EN}
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </CloudSyncContext.Provider>
  )
}

export function useCloudSync() {
  return useContext(CloudSyncContext)
}
