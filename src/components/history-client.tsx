'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Check,
  Cloud,
  CloudOff,
  Download,
  FileText,
  Flame,
  RefreshCw,
  TrendingUp,
  Users,
} from 'lucide-react'
import { StatPill } from '@/components/ui'
import { useCloudSync } from '@/lib/cloud-sync'
import { exportReportCsv, exportReportPdf } from '@/lib/export-reports'
import { useI18n } from '@/lib/i18n'
import type { SessionReport } from '@/types/game'

export default function HistoryClient({
  mode,
  backHref,
}: {
  mode: 'admin' | 'creator'
  backHref: string
}) {
  const { locale, t } = useI18n()
  const {
    user,
    syncing,
    cloudReports,
    getJwt,
    saveSessionToCloud,
    updateSessionClassInCloud,
    refreshCloudData,
  } = useCloudSync()

  const [serverReports, setServerReports] = useState<SessionReport[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [quizFilter, setQuizFilter] = useState<string>('all')
  const [classFilter, setClassFilter] = useState<string>('all')
  const [editingClass, setEditingClass] = useState('')
  const [savingClass, setSavingClass] = useState(false)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

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

  const loadServerReports = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/sessions?scope=${mode}`, {
        cache: 'no-store',
        credentials: 'include',
        headers: await authHeaders(false),
      })
      if (res.ok) {
        const list = (await res.json()) as SessionReport[]
        setServerReports(list)
      }
    } finally {
      setLoading(false)
    }
  }, [mode, authHeaders])

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadServerReports()
    }, 0)
    return () => clearTimeout(timer)
  }, [loadServerReports])

  const effectiveCloudReports = useMemo(
    () => (mode === 'creator' ? cloudReports : []),
    [mode, cloudReports],
  )
  const cloudIdSet = useMemo(() => new Set(effectiveCloudReports.map((r) => r.id)), [effectiveCloudReports])

  const mergedReports = useMemo(() => {
    const byId = new Map<string, SessionReport>()
    for (const r of effectiveCloudReports) byId.set(r.id, r)
    for (const r of serverReports) {
      if (!byId.has(r.id)) byId.set(r.id, r)
      else {
        const existing = byId.get(r.id)!
        byId.set(r.id, { ...existing, classLabel: r.classLabel || existing.classLabel })
      }
    }
    return Array.from(byId.values()).sort((a, b) => b.completedAt.localeCompare(a.completedAt))
  }, [serverReports, effectiveCloudReports])

  const quizOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of mergedReports) {
      if (r.quizId) map.set(r.quizId, r.quizName || r.quizId)
    }
    return Array.from(map.entries())
  }, [mergedReports])

  const classOptions = useMemo(() => {
    const set = new Set<string>()
    for (const r of mergedReports) {
      if (r.classLabel?.trim()) set.add(r.classLabel.trim())
    }
    return Array.from(set).sort()
  }, [mergedReports])

  const filteredReports = useMemo(() => {
    return mergedReports.filter((r) => {
      if (quizFilter !== 'all' && r.quizId !== quizFilter) return false
      if (classFilter !== 'all' && (r.classLabel?.trim() || '') !== classFilter) return false
      return true
    })
  }, [mergedReports, quizFilter, classFilter])

  const activeReport = useMemo(() => {
    if (!filteredReports.length) return null
    return filteredReports.find((r) => r.id === selectedId) ?? filteredReports[0]
  }, [filteredReports, selectedId])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeReport) {
        setEditingClass(activeReport.classLabel || '')
      }
    }, 0)
    return () => clearTimeout(timer)
  }, [activeReport])

  const evolutionSeries = useMemo(() => {
    return [...filteredReports].reverse().slice(-12)
  }, [filteredReports])

  const cohortComparison = useMemo(() => {
    const groups = new Map<string, { label: string; sessions: number; participants: number; accSum: number }>()
    for (const r of filteredReports) {
      const key = r.classLabel?.trim() || (locale === 'pt' ? 'Sem turma' : 'Untagged')
      const cur = groups.get(key) ?? { label: key, sessions: 0, participants: 0, accSum: 0 }
      cur.sessions += 1
      cur.participants += r.participantCount
      cur.accSum += r.averageAccuracy
      groups.set(key, cur)
    }
    return Array.from(groups.values()).map((g) => ({
      ...g,
      avgAccuracy: g.sessions ? g.accSum / g.sessions : 0,
    }))
  }, [filteredReports, locale])

  const handleSaveClassLabel = async () => {
    if (!activeReport) return
    setSavingClass(true)
    setNotice('')
    try {
      const clean = editingClass.trim()
      const res = await fetch('/api/sessions', {
        method: 'PATCH',
        credentials: 'include',
        headers: await authHeaders(true),
        body: JSON.stringify({ scope: mode, id: activeReport.id, classLabel: clean }),
      })
      if (res.ok) {
        await loadServerReports()
      }
      if (mode === 'creator' && user && cloudIdSet.has(activeReport.id)) {
        await updateSessionClassInCloud(activeReport.id, clean)
      }
      setNotice(locale === 'pt' ? 'Turma / grupo atualizado!' : 'Class / cohort updated!')
    } catch {
      setNotice(locale === 'pt' ? 'Erro ao atualizar turma.' : 'Failed to update class label.')
    } finally {
      setSavingClass(false)
    }
  }

  const handleSyncSingle = async (report: SessionReport) => {
    if (mode !== 'creator' || !user) return
    setSyncingId(report.id)
    try {
      await saveSessionToCloud(report)
      setNotice(locale === 'pt' ? 'Relatório sincronizado no Appwrite!' : 'Report synced to Appwrite!')
    } catch {
      setNotice(locale === 'pt' ? 'Erro ao sincronizar no Appwrite.' : 'Failed to sync to Appwrite.')
    } finally {
      setSyncingId(null)
    }
  }

  const totalParticipants = filteredReports.reduce((sum, r) => sum + r.participantCount, 0)
  const overallAccuracy = filteredReports.length
    ? filteredReports.reduce((sum, r) => sum + r.averageAccuracy, 0) / filteredReports.length
    : 0

  return (
    <div className="container-game pb-20 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 animate-in">
        <div>
          <Link href={backHref} className="text-muted inline-flex items-center gap-2 text-sm font-semibold hover:text-white">
            <ArrowLeft className="h-4 w-4" /> {locale === 'pt' ? 'Voltar ao painel' : 'Back to dashboard'}
          </Link>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">{t.historyTitle}</h1>
          <p className="text-muted mt-1 text-sm">{t.historySubtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {mode === 'creator' && user && (
            <>
              <StatPill accent="mint">
                <Cloud className="h-3.5 w-3.5" /> {user.email}
              </StatPill>
              <button
                type="button"
                disabled={syncing}
                onClick={() => void refreshCloudData()}
                className="btn-secondary px-3.5 py-2 text-xs"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                {locale === 'pt' ? 'Atualizar nuvem' : 'Refresh cloud'}
              </button>
            </>
          )}
        </div>
      </div>

      {notice && (
        <div role="status" className="rounded-2xl border border-emerald-400/35 bg-emerald-500/15 px-4 py-3 text-sm font-semibold text-emerald-200 animate-in">
          {notice}
        </div>
      )}

      <section className="glass p-5 sm:p-6 animate-in">
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto_auto_auto] md:items-end">
          <label className="block">
            <span className="label text-xs">{locale === 'pt' ? 'Filtrar por quiz' : 'Filter by quiz'}</span>
            <select className="field py-2.5 text-sm" value={quizFilter} onChange={(e) => setQuizFilter(e.target.value)}>
              <option value="all">{locale === 'pt' ? 'Todos os quizzes' : 'All quizzes'}</option>
              {quizOptions.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="label text-xs">{locale === 'pt' ? 'Filtrar por turma / grupo' : 'Filter by class / cohort'}</span>
            <select className="field py-2.5 text-sm" value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
              <option value="all">{locale === 'pt' ? 'Todas as turmas' : 'All cohorts'}</option>
              {classOptions.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <div className="glass-soft px-4 py-2.5 text-center">
            <div className="text-lg font-extrabold tabular-nums text-[#cbbdff]">{filteredReports.length}</div>
            <div className="text-muted text-[11px] font-bold uppercase tracking-wider">
              {locale === 'pt' ? 'Partidas' : 'Sessions'}
            </div>
          </div>

          <div className="glass-soft px-4 py-2.5 text-center">
            <div className="text-lg font-extrabold tabular-nums text-[#7de2e4]">{totalParticipants}</div>
            <div className="text-muted text-[11px] font-bold uppercase tracking-wider">
              {locale === 'pt' ? 'Participações' : 'Players'}
            </div>
          </div>

          <div className="glass-soft px-4 py-2.5 text-center">
            <div className="text-lg font-extrabold tabular-nums text-[#65f5a3]">{overallAccuracy.toFixed(1)}%</div>
            <div className="text-muted text-[11px] font-bold uppercase tracking-wider">
              {locale === 'pt' ? 'Acurácia média' : 'Avg accuracy'}
            </div>
          </div>
        </div>
      </section>

      {evolutionSeries.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-2 animate-in">
          <section className="glass p-6">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div>
                <p className="eyebrow">{locale === 'pt' ? 'Linha do tempo' : 'Timeline'}</p>
                <h2 className="mt-1 flex items-center gap-2 text-lg font-bold">
                  <TrendingUp className="h-5 w-5 text-[#7de2e4]" />
                  {locale === 'pt' ? 'Evolução de acurácia por partida' : 'Accuracy evolution across sessions'}
                </h2>
              </div>
            </div>
            <div className="space-y-3">
              {evolutionSeries.map((r) => (
                <div key={r.id} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-semibold text-white">
                      {r.quizName}
                      {r.classLabel ? <span className="text-muted ml-2">({r.classLabel})</span> : null}
                    </span>
                    <span className="shrink-0 font-bold tabular-nums text-[#65f5a3]">
                      {r.averageAccuracy.toFixed(1)}% · {r.participantCount}p
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#a58bff] to-[#65f5a3]"
                      style={{ width: `${Math.max(4, Math.min(100, r.averageAccuracy))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="glass p-6">
            <div className="mb-4">
              <p className="eyebrow">{locale === 'pt' ? 'Comparativo' : 'Comparison'}</p>
              <h2 className="mt-1 flex items-center gap-2 text-lg font-bold">
                <BarChart3 className="h-5 w-5 text-[#ffd078]" />
                {locale === 'pt' ? 'Comparação por turma / grupo' : 'Cohort comparison'}
              </h2>
            </div>
            <div className="space-y-3">
              {cohortComparison.map((c) => (
                <div key={c.label} className="glass-soft flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-white">{c.label}</p>
                    <p className="text-muted text-xs">
                      {c.sessions} {c.sessions === 1 ? (locale === 'pt' ? 'partida' : 'session') : (locale === 'pt' ? 'partidas' : 'sessions')} · {c.participants} {locale === 'pt' ? 'participantes' : 'players'}
                    </p>
                  </div>
                  <div className="text-right">
                    <strong className="text-lg font-extrabold tabular-nums text-[#ffe0a6]">{c.avgAccuracy.toFixed(1)}%</strong>
                    <span className="text-muted block text-[10px] uppercase tracking-wider">
                      {locale === 'pt' ? 'Média' : 'Average'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {loading && mergedReports.length === 0 ? (
        <div className="glass flex min-h-60 items-center justify-center">
          <div className="flex gap-2">
            <span className="loading-dot" />
            <span className="loading-dot" />
            <span className="loading-dot" />
          </div>
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="glass p-12 text-center animate-in">
          <p className="text-lg font-bold">
            {locale === 'pt' ? 'Nenhuma partida registrada ainda.' : 'No completed sessions recorded yet.'}
          </p>
          <p className="text-muted mt-2 text-sm">
            {locale === 'pt'
              ? 'Ao finalizar um quiz ao vivo (com "Salvar sessão" ativado em Configurações), o relatório completo aparece automaticamente aqui.'
              : 'When you finish a live quiz (with "Save session" enabled in Settings), full standings and analytics appear here.'}
          </p>
          <Link href={backHref} className="btn-primary mt-6 inline-flex">
            {locale === 'pt' ? 'Voltar ao painel' : 'Return to dashboard'}
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)] animate-in">
          <div className="space-y-3">
            {filteredReports.map((report) => {
              const isSelected = activeReport?.id === report.id
              const isCloud = cloudIdSet.has(report.id)
              return (
                <button
                  key={report.id}
                  type="button"
                  onClick={() => setSelectedId(report.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    isSelected
                      ? 'border-[#7de2e4]/70 bg-[#7de2e4]/12 shadow-lg'
                      : 'border-white/15 bg-white/5 hover:border-white/30 hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-white leading-snug">{report.quizName}</h3>
                    {isCloud ? (
                      <Cloud className="h-4 w-4 shrink-0 text-emerald-300" aria-label="Synced to cloud" />
                    ) : (
                      <CloudOff className="h-4 w-4 shrink-0 text-white/35" aria-label="Server stored" />
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#b7c2e2]">
                    {report.classLabel && (
                      <span className="rounded-md bg-[#a58bff]/20 px-2 py-0.5 font-bold text-[#cbbdff]">
                        {report.classLabel}
                      </span>
                    )}
                    <span suppressHydrationWarning>
                      {new Date(report.completedAt).toLocaleDateString(locale === 'pt' ? 'pt-BR' : 'en-US')}
                    </span>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between text-xs font-semibold">
                    <span className="inline-flex items-center gap-1 text-[#7de2e4]">
                      <Users className="h-3.5 w-3.5" /> {report.participantCount}
                    </span>
                    <span className="tabular-nums text-[#65f5a3]">{report.averageAccuracy.toFixed(1)}%</span>
                  </div>
                </button>
              )
            })}
          </div>

          {activeReport && (
            <section className="glass p-6 sm:p-7 space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="eyebrow" suppressHydrationWarning>
                    {activeReport.category} · {new Date(activeReport.completedAt).toLocaleString(locale === 'pt' ? 'pt-BR' : 'en-US')}
                  </p>
                  <h2 className="mt-2 text-2xl font-extrabold">{activeReport.quizName}</h2>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => exportReportCsv(activeReport)}
                    className="btn-secondary px-3.5 py-2 text-xs"
                  >
                    <Download className="h-4 w-4" /> {t.exportCsv}
                  </button>
                  <button
                    type="button"
                    onClick={() => exportReportPdf(activeReport)}
                    className="btn-primary px-3.5 py-2 text-xs"
                  >
                    <FileText className="h-4 w-4" /> {t.exportPdf}
                  </button>
                  {mode === 'creator' && user && !cloudIdSet.has(activeReport.id) && (
                    <button
                      type="button"
                      disabled={syncingId === activeReport.id}
                      onClick={() => void handleSyncSingle(activeReport)}
                      className="btn-primary btn-success px-3.5 py-2 text-xs"
                    >
                      <Cloud className="h-4 w-4" />
                      {syncingId === activeReport.id
                        ? '...'
                        : locale === 'pt'
                          ? 'Enviar p/ Nuvem'
                          : 'Sync to Cloud'}
                    </button>
                  )}
                </div>
              </div>

              <div className="glass-soft flex flex-wrap items-end gap-3 p-4">
                <label className="min-w-52 flex-1">
                  <span className="label mb-1 text-xs">{t.classLabelInput}</span>
                  <input
                    type="text"
                    className="field py-2 text-sm"
                    maxLength={80}
                    value={editingClass}
                    onChange={(e) => setEditingClass(e.target.value)}
                    placeholder={t.classLabelPlaceholder}
                  />
                </label>
                <button
                  type="button"
                  disabled={savingClass}
                  onClick={() => void handleSaveClassLabel()}
                  className="btn-secondary px-4 py-2 text-xs"
                >
                  <Check className="h-4 w-4" /> {savingClass ? '...' : locale === 'pt' ? 'Salvar turma' : 'Save cohort'}
                </button>
              </div>

              <div>
                <h3 className="mb-3 text-lg font-bold">
                  {locale === 'pt' ? 'Desempenho por pergunta (diagnóstico)' : 'Question breakdown (diagnostics)'}
                </h3>
                <div className="space-y-2.5">
                  {activeReport.questionStats.map((qs, idx) => {
                    const errorRate = Math.max(0, 100 - qs.accuracyPercent)
                    const needsReview = qs.totalAnswers > 0 && errorRate >= 50
                    return (
                      <div
                        key={qs.questionId}
                        className={`rounded-xl border p-3.5 ${
                          needsReview
                            ? 'border-rose-400/40 bg-rose-500/10'
                            : 'border-white/10 bg-white/5'
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-white">
                            <span className="text-muted mr-2 font-mono">#{idx + 1}</span>
                            {qs.questionBody}
                          </p>
                          <div className="flex items-center gap-2 shrink-0">
                            {needsReview && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/25 px-2.5 py-0.5 text-[11px] font-extrabold text-rose-200">
                                <AlertTriangle className="h-3 w-3" />
                                {errorRate.toFixed(0)}% {locale === 'pt' ? 'erro · Revisar' : 'error · Review'}
                              </span>
                            )}
                            <span className="text-xs font-bold tabular-nums text-[#a5ecf6]">
                              {qs.correctCount}/{qs.totalAnswers} ({qs.accuracyPercent.toFixed(0)}%)
                            </span>
                          </div>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                          <div
                            className={`h-full rounded-full ${needsReview ? 'bg-rose-400' : 'bg-[#65f5a3]'}`}
                            style={{ width: `${Math.max(3, qs.accuracyPercent)}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div>
                <h3 className="mb-3 text-lg font-bold">{t.finalStandings}</h3>
                {activeReport.leaderboard.length === 0 ? (
                  <p className="text-muted text-sm">{locale === 'pt' ? 'Sem participantes.' : 'No participants.'}</p>
                ) : (
                  <div className="space-y-2">
                    {activeReport.leaderboard.map((entry, idx) => (
                      <div key={entry.id} className="glass-soft flex items-center justify-between gap-3 px-4 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="rank-badge text-xs">{String(idx + 1).padStart(2, '0')}</span>
                          <span className="truncate font-bold text-white">{entry.nickname}</span>
                          {entry.bestStreak >= 2 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-bold text-amber-200">
                              <Flame className="h-3 w-3" /> {entry.bestStreak}x
                            </span>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-4 text-sm">
                          <span className="text-[#a5ecf6] font-semibold">
                            {entry.correctCount}/{activeReport.questionCount}
                          </span>
                          <strong className="tabular-nums text-[#cbbdff]">{entry.totalScore} pts</strong>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
