'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { AppwriteException, ID, OAuthProvider, Permission, Query, Role } from 'appwrite'
import { Cloud, CloudOff, Database, Lock, LogOut, Mail, RefreshCw, UserPlus, X } from 'lucide-react'
import {
  APPWRITE_CONFIG,
  getAppwriteServices,
  isAppwriteConfigured,
  pingAppwriteOnce,
  toAppwriteDocId,
} from '@/lib/appwrite'
import { useI18n } from '@/lib/i18n'
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
  openCloudAuth: () => void
  signOutCloud: () => Promise<void>
  saveQuizToCloud: (quiz: {
    category: string
    slug: string
    name: string
    description: string
    questions: QuizSet['questions']
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

function formatAppwriteError(err: unknown, locale: 'pt' | 'en'): string {
  const host = currentHostnameHint()
  const hostTipPt = host
    ? ` Adicione o hostname "${host}" (sem https://) em Overview → Platforms → Add Platform → Web no painel do Appwrite.`
    : ' Adicione o domínio atual em Overview → Platforms → Web no painel do Appwrite.'
  const hostTipEn = host
    ? ` Add hostname "${host}" (without https://) under Overview → Platforms → Add Platform → Web in your Appwrite console.`
    : ' Add this hostname under Overview → Platforms → Web in your Appwrite console.'

  if (err instanceof AppwriteException) {
    if (err.code === 401) {
      return locale === 'pt'
        ? 'E-mail ou senha inválidos no Appwrite.'
        : 'Invalid Appwrite email or password.'
    }
    if (err.code === 409) {
      return locale === 'pt'
        ? 'Este e-mail já está cadastrado. Tente entrar.'
        : 'An account with this email already exists. Try signing in.'
    }
    if (err.code === 404) {
      return locale === 'pt'
        ? `Banco (${APPWRITE_CONFIG.databaseId}) ou coleção não encontrada no Appwrite. Verifique se já criou as coleções no painel.`
        : `Database (${APPWRITE_CONFIG.databaseId}) or collection not found in Appwrite. Make sure collections exist in console.`
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
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authPending, setAuthPending] = useState(false)
  const [authError, setAuthError] = useState('')

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
          name: acc.name || acc.email || 'Appwrite',
        })
      })
      .catch(() => {
        if (!active) return
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
    setModalOpen(true)
  }, [])

  const signOutCloud = useCallback(async () => {
    const services = getAppwriteServices()
    if (services) {
      await services.account.deleteSession({ sessionId: 'current' }).catch(() => {})
    }
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
    try {
      const cleanEmail = email.trim()
      if (authMode === 'register') {
        await services.account.create({
          userId: ID.unique(),
          email: cleanEmail,
          password,
          name: name.trim() || undefined,
        })
      }
      await services.account.createEmailPasswordSession({
        email: cleanEmail,
        password,
      })
      const acc = await services.account.get()
      setUser({
        $id: acc.$id,
        email: acc.email || cleanEmail,
        name: acc.name || acc.email || cleanEmail,
      })
      setPassword('')
      setModalOpen(false)
    } catch (err) {
      setAuthError(formatAppwriteError(err, locale))
    } finally {
      setAuthPending(false)
    }
  }

  const handleGoogleOAuth = () => {
    const services = getAppwriteServices()
    if (!services || typeof window === 'undefined') return
    const currentUrl = window.location.href.split('#')[0]
    services.account.createOAuth2Session({
      provider: OAuthProvider.Google,
      success: currentUrl,
      failure: currentUrl,
    })
  }

  const saveQuizToCloud = useCallback(
    async (quiz: {
      category: string
      slug: string
      name: string
      description: string
      questions: QuizSet['questions']
    }) => {
      const services = getAppwriteServices()
      if (!services || !user) return

      const fullQuizId = `${quiz.category}/${quiz.slug}`.slice(0, 128)
      const docId = toAppwriteDocId(`quiz_${quiz.category}_${quiz.slug}`)
      const sanitizedQuestions = quiz.questions.slice(0, 100).map((q, idx) => ({
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

      const data = {
        ownerId: user.$id,
        quizId: fullQuizId,
        category: quiz.category.slice(0, 64),
        slug: quiz.slug.slice(0, 64),
        name: String(quiz.name).slice(0, 140),
        description: String(quiz.description ?? '').slice(0, 500),
        questionCount: sanitizedQuestions.length,
        questionsJson: JSON.stringify(sanitizedQuestions).slice(0, 65535),
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
          await services.databases.createDocument({
            databaseId: APPWRITE_CONFIG.databaseId,
            collectionId: APPWRITE_CONFIG.quizzesCollectionId,
            documentId: docId,
            data,
            permissions: ownerPermissions(user.$id),
          })
        } else {
          throw err
        }
      }
    },
    [user],
  )

  const deleteQuizFromCloud = useCallback(
    async (quizId: string) => {
      const services = getAppwriteServices()
      if (!services || !user) return
      const [category = '', slug = ''] = quizId.split('/')
      const docId = toAppwriteDocId(`quiz_${category}_${slug}`)
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

      const docId = toAppwriteDocId(`sess_${report.id}`)
      const cleanClassLabel = String(report.classLabel || '').slice(0, 80)
      const data = {
        ownerId: user.$id,
        sessionId: String(report.id).slice(0, 128),
        quizId: String(report.quizId).slice(0, 128),
        quizName: String(report.quizName).slice(0, 140),
        category: String(report.category || 'general').slice(0, 64),
        classLabel: cleanClassLabel,
        completedAt: report.completedAt || new Date().toISOString(),
        questionCount: Math.max(1, Math.min(100, report.questionCount)),
        participantCount: Math.max(0, Math.min(500, report.participantCount)),
        averageAccuracy: Math.max(0, Math.min(100, Number(report.averageAccuracy.toFixed(1)))),
        topScorer: String(report.topScorer || '').slice(0, 64),
        leaderboardJson: JSON.stringify(report.leaderboard.slice(0, 500)).slice(0, 65535),
        questionStatsJson: JSON.stringify(report.questionStats.slice(0, 100)).slice(0, 65535),
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
      const docId = toAppwriteDocId(`sess_${sessionId}`)
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
            className="glass w-full max-w-lg border border-white/25 bg-[#2d1c45] p-6 sm:p-7 animate-in max-h-[90vh] overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="appwrite-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#f02e65]/45 bg-[#f02e65]/15 text-[#ff85a8]">
                  <Database className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <p className="eyebrow">Appwrite Cloud (Free)</p>
                  <h2 id="appwrite-modal-title" className="text-xl font-extrabold tracking-tight text-white">
                    {user
                      ? locale === 'pt'
                        ? 'Conta conectada'
                        : 'Account connected'
                      : !isAppwriteConfigured
                        ? locale === 'pt'
                          ? 'Configurar Appwrite grátis'
                          : 'Set up free Appwrite'
                        : authMode === 'login'
                          ? locale === 'pt'
                            ? 'Entrar no Appwrite'
                            : 'Sign in to Appwrite'
                          : locale === 'pt'
                            ? 'Criar conta no Appwrite'
                            : 'Create Appwrite account'}
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
              <div className="mt-5 space-y-4 text-sm leading-relaxed text-[#d8cfe6]">
                <p>
                  {locale === 'pt'
                    ? 'Para usar o plano gratuito do Appwrite Cloud para salvar seus quizzes e histórico de partidas:'
                    : 'To use Appwrite Cloud Free tier to persist your quizzes and match history:'}
                </p>
                <ol className="list-decimal space-y-2.5 pl-5 text-xs sm:text-sm">
                  <li>
                    {locale === 'pt' ? (
                      <>
                        Crie um projeto gratuito em <strong>cloud.appwrite.io</strong> e adicione uma plataforma{' '}
                        <strong>Web</strong> com o domínio atual.
                      </>
                    ) : (
                      <>
                        Create a free project at <strong>cloud.appwrite.io</strong> and add a{' '}
                        <strong>Web</strong> platform for this hostname.
                      </>
                    )}
                  </li>
                  <li>
                    {locale === 'pt' ? (
                      <>
                        Nos <strong>Secrets</strong> (ou <code>.env.local</code>), defina{' '}
                        <code>NEXT_PUBLIC_APPWRITE_PROJECT_ID</code> (e opcionalmente{' '}
                        <code>NEXT_PUBLIC_APPWRITE_ENDPOINT</code> para sua região).
                      </>
                    ) : (
                      <>
                        In <strong>Secrets</strong> (or <code>.env.local</code>), set{' '}
                        <code>NEXT_PUBLIC_APPWRITE_PROJECT_ID</code> (and optionally{' '}
                        <code>NEXT_PUBLIC_APPWRITE_ENDPOINT</code> for your region).
                      </>
                    )}
                  </li>
                  <li>
                    {locale === 'pt' ? (
                      <>
                        No Appwrite Databases, crie o banco <code>{APPWRITE_CONFIG.databaseId}</code> com duas
                        coleções com <strong>Document Security</strong> ativado e permissão de criação para{' '}
                        <code>Users</code>:
                      </>
                    ) : (
                      <>
                        In Appwrite Databases, create database <code>{APPWRITE_CONFIG.databaseId}</code> with two
                        collections with <strong>Document Security</strong> enabled and <code>Users</code> create
                        permission:
                      </>
                    )}
                  </li>
                </ol>
                <div className="glass-soft space-y-2 p-3.5 text-xs font-mono text-[#a5ecf6]">
                  <div>
                    <strong className="text-white">{APPWRITE_CONFIG.quizzesCollectionId}:</strong> ownerId, quizId,
                    category, slug, name, description, questionCount (int), questionsJson (65535), updatedAt
                  </div>
                  <div>
                    <strong className="text-white">{APPWRITE_CONFIG.sessionsCollectionId}:</strong> ownerId, sessionId,
                    quizId, quizName, category, classLabel, completedAt, questionCount (int), participantCount (int),
                    averageAccuracy (double), topScorer, leaderboardJson (65535), questionStatsJson (65535)
                  </div>
                </div>
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
                    }}
                    className={`rounded-lg py-2 text-xs font-bold transition ${
                      authMode === 'login' ? 'bg-[#a58bff] text-[#170f2e]' : 'text-[#cbd3eb] hover:text-white'
                    }`}
                  >
                    {locale === 'pt' ? 'Já tenho conta' : 'Sign in'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('register')
                      setAuthError('')
                    }}
                    className={`rounded-lg py-2 text-xs font-bold transition ${
                      authMode === 'register' ? 'bg-[#a58bff] text-[#170f2e]' : 'text-[#cbd3eb] hover:text-white'
                    }`}
                  >
                    {locale === 'pt' ? 'Criar conta grátis' : 'Create free account'}
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

                  <label className="block">
                    <span className="label text-xs flex items-center gap-1.5">
                      <Lock className="h-3.5 w-3.5" /> {t.password}
                    </span>
                    <input
                      type="password"
                      required
                      minLength={8}
                      autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                      className="field py-2.5 text-sm"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={locale === 'pt' ? 'Mínimo 8 caracteres' : 'Minimum 8 characters'}
                    />
                  </label>

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
                    {authMode === 'register' ? <UserPlus className="h-4 w-4" /> : <Cloud className="h-4 w-4" />}
                    {authPending
                      ? '...'
                      : authMode === 'login'
                        ? locale === 'pt'
                          ? 'Conectar ao Appwrite'
                          : 'Connect to Appwrite'
                        : locale === 'pt'
                          ? 'Criar conta e conectar'
                          : 'Create account & connect'}
                  </button>
                </form>

                <div className="rule" />

                <button
                  type="button"
                  onClick={handleGoogleOAuth}
                  className="btn-secondary w-full py-2.5 text-xs"
                >
                  <CloudOff className="h-3.5 w-3.5 hidden" />
                  {locale === 'pt' ? 'Continuar com Google (OAuth2 Appwrite)' : 'Continue with Google (Appwrite OAuth2)'}
                </button>
                <p className="text-muted text-center text-[11px] leading-relaxed">
                  {locale === 'pt'
                    ? 'Dentro do preview em iframe, prefira E-mail e Senha (OAuth2 do Google requer abrir o app em nova aba).'
                    : 'Inside the iframe preview, prefer Email & Password (Google OAuth2 requires opening the app in a new tab).'}
                </p>
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
