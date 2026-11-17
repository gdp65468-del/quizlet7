'use client'

import { useEffect, useRef, useState } from 'react'
import { Settings } from 'lucide-react'
import { useCloudSync } from '@/lib/cloud-sync'
import { useI18n } from '@/lib/i18n'
import type { LeaderboardVisibility } from '@/types/game'

type SettingsState = {
  choiceRevealSeconds: string
  answerTimeSeconds: string
  leaderboardVisibility: LeaderboardVisibility
  showDistribution: boolean
  saveSession: boolean
}

export default function SettingsButton({ mode = 'admin' }: { mode?: 'admin' | 'creator' }) {
  const { locale, t } = useI18n()
  const { getJwt } = useCloudSync()
  const isPt = locale === 'pt'
  const endpoint = mode === 'creator' ? '/api/creator/settings' : '/api/admin/settings'

  const dialog = useRef<HTMLDialogElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [closing, setClosing] = useState(false)
  const [settings, setSettings] = useState<SettingsState>({
    choiceRevealSeconds: '5',
    answerTimeSeconds: '20',
    leaderboardVisibility: 'all',
    showDistribution: true,
    saveSession: false,
  })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const leaderboardOptions: { value: LeaderboardVisibility; label: string }[] = isPt
    ? [
        { value: 'hide', label: 'Ocultar' },
        { value: 'top1', label: 'Apenas 1º lugar' },
        { value: 'top3', label: 'Mostrar Top 3' },
        { value: 'top10', label: 'Mostrar Top 10' },
        { value: 'all', label: 'Mostrar todos' },
      ]
    : [
        { value: 'hide', label: 'Hide' },
        { value: 'top1', label: 'First place only' },
        { value: 'top3', label: 'Show top three' },
        { value: 'top10', label: 'Show top 10' },
        { value: 'all', label: 'Show all' },
      ]

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }, [])

  const close = () => {
    if (!dialog.current?.open || closeTimer.current) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      dialog.current.close()
      return
    }
    setClosing(true)
    closeTimer.current = setTimeout(() => {
      dialog.current?.close()
      closeTimer.current = null
    }, 220)
  }

  const highlightDialog = () => {
    dialog.current?.animate([
      { borderColor: 'rgba(196,219,255,.3)', boxShadow: '0 30px 85px rgba(3,8,20,.65)' },
      { borderColor: 'rgba(245,207,112,.9)', boxShadow: '0 0 0 5px rgba(245,207,112,.22), 0 30px 85px rgba(3,8,20,.65)' },
      { borderColor: 'rgba(196,219,255,.3)', boxShadow: '0 30px 85px rgba(3,8,20,.65)' },
    ], { duration: 420, easing: 'ease-out' })
  }

  const buildHeaders = async (withJson = false): Promise<HeadersInit> => {
    const headers: Record<string, string> = {}
    if (withJson) headers['Content-Type'] = 'application/json'
    if (mode === 'creator') {
      const jwt = await getJwt()
      if (jwt) headers['x-appwrite-jwt'] = jwt
    }
    return headers
  }

  const open = async () => {
    dialog.current?.showModal()
    body.current?.scrollTo(0, 0)
    setError('')
    setLoading(true)
    try {
      const response = await fetch(endpoint, {
        cache: 'no-store',
        credentials: 'include',
        headers: await buildHeaders(false),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || (isPt ? 'Não foi possível carregar as configurações' : 'Could not load settings'))
      setSettings({
        choiceRevealSeconds: String(result.choiceRevealSeconds),
        answerTimeSeconds: String(result.answerTimeSeconds),
        leaderboardVisibility: result.leaderboardVisibility,
        showDistribution: result.showDistribution ?? true,
        saveSession: result.saveSession ?? false,
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (isPt ? 'Não foi possível carregar as configurações' : 'Could not load settings'))
    } finally {
      setLoading(false)
    }
  }

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (saving || loading) return
    setSaving(true)
    setError('')
    try {
      const response = await fetch(endpoint, {
        method: 'PUT',
        credentials: 'include',
        headers: await buildHeaders(true),
        body: JSON.stringify({
          choiceRevealSeconds: Number(settings.choiceRevealSeconds),
          answerTimeSeconds: Number(settings.answerTimeSeconds),
          leaderboardVisibility: settings.leaderboardVisibility,
          showDistribution: settings.showDistribution,
          saveSession: settings.saveSession,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || (isPt ? 'Não foi possível salvar as configurações' : 'Could not save settings'))
      setSettings({
        choiceRevealSeconds: String(result.choiceRevealSeconds),
        answerTimeSeconds: String(result.answerTimeSeconds),
        leaderboardVisibility: result.leaderboardVisibility,
        showDistribution: result.showDistribution ?? true,
        saveSession: result.saveSession ?? false,
      })
      close()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (isPt ? 'Não foi possível salvar as configurações' : 'Could not save settings'))
      body.current?.scrollTo(0, 0)
    } finally {
      setSaving(false)
    }
  }

  return <>
    <button className="btn-settings whitespace-nowrap px-4 py-2.5 text-sm" type="button" onClick={open}>
      <Settings aria-hidden="true" className="h-4 w-4" />
      {t.navSettings}
    </button>
    <dialog ref={dialog} className={`settings-dialog ${closing ? 'is-closing' : ''}`} aria-labelledby="settings-title"
      onClick={(event) => { if (event.target === dialog.current) highlightDialog() }}
      onCancel={(event) => { event.preventDefault(); close() }}
      onClose={() => setClosing(false)}>
      <form onSubmit={save} className="settings-panel">
        <div className="settings-panel-header">
          <h2 id="settings-title" className="text-2xl font-bold">{isPt ? 'Configurações do quiz' : 'Quiz settings'}</h2>
          <button className="settings-close" type="button" onClick={close} aria-label={isPt ? 'Fechar configurações' : 'Close settings'}>×</button>
        </div>
        <div ref={body} className="settings-panel-body">
          <p className="text-muted text-sm leading-relaxed">
            {isPt
              ? 'As alterações valem apenas para suas próximas salas. Salas já abertas mantêm as configurações originais.'
              : 'Changes apply only to your upcoming rooms. Open rooms keep their original settings.'}
          </p>
          {error && <p className="notice mt-5" role="alert">{error}</p>}
          <div className="mt-7 space-y-5">
            <label className="block">
              <span className="label">{isPt ? 'Mostrar alternativas após' : 'Show choices after'}</span>
              <span className="settings-input-wrap">
                <input className="field" type="number" min="0" max="20" step="1" required disabled={loading || saving} value={settings.choiceRevealSeconds} onChange={(event) => setSettings({ ...settings, choiceRevealSeconds: event.target.value })} />
                <span>{isPt ? 'segundos' : 'seconds'}</span>
              </span>
              <span className="text-muted mt-2 block text-xs">{isPt ? '0–20 segundos; padrão 5.' : '0–20 seconds; default 5.'}</span>
            </label>
            <label className="block">
              <span className="label">{isPt ? 'Tempo para responder' : 'Time to answer'}</span>
              <span className="settings-input-wrap">
                <input className="field" type="number" min="10" max="100" step="1" required disabled={loading || saving} value={settings.answerTimeSeconds} onChange={(event) => setSettings({ ...settings, answerTimeSeconds: event.target.value })} />
                <span>{isPt ? 'segundos' : 'seconds'}</span>
              </span>
              <span className="text-muted mt-2 block text-xs">{isPt ? '10–100 segundos; padrão 20.' : '10–100 seconds; default 20.'}</span>
            </label>
            <fieldset>
              <legend className="label">{isPt ? 'Ranking final' : 'Final leaderboard'}</legend>
              <p className="text-muted mt-1 text-xs">
                {isPt
                  ? 'Ocultar remove nomes e posições. O gráfico de acertos da turma é controlado separadamente. Cada jogador continua vendo o próprio resultado.'
                  : 'Hide removes names and standings. The distribution switch controls the class chart separately. Every player still sees their own result.'}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {leaderboardOptions.map((option) => <label key={option.value} className={`settings-choice ${settings.leaderboardVisibility === option.value ? 'is-selected' : ''}`}>
                  <input type="radio" name="leaderboardVisibility" value={option.value} checked={settings.leaderboardVisibility === option.value} disabled={loading || saving} onChange={() => setSettings({ ...settings, leaderboardVisibility: option.value })} />
                  <span>{option.label}</span>
                </label>)}
              </div>
            </fieldset>
            <label className="settings-switch-row">
              <span>
                <strong className="block text-sm">{isPt ? 'Mostrar distribuição de acertos' : 'Show correct-answer distribution'}</strong>
                <span className="text-muted mt-1 block text-xs">
                  {isPt
                    ? 'Exibe o gráfico da turma na tela final do apresentador, mesmo quando o ranking estiver oculto.'
                    : 'Display the class chart on the final host screen, even when the leaderboard is hidden.'}
                </span>
              </span>
              <input className="settings-switch-input" type="checkbox" role="switch" checked={settings.showDistribution} disabled={loading || saving} onChange={(event) => setSettings({ ...settings, showDistribution: event.target.checked })} />
            </label>
            <label className="settings-switch-row">
              <span>
                <strong className="block text-sm">{isPt ? 'Salvar sessão' : 'Save session'}</strong>
                <span className="text-muted mt-1 block text-xs">
                  {isPt
                    ? 'Salva a classificação final das suas partidas concluídas no histórico privado.'
                    : 'Save completed quiz standings to your private history.'}
                </span>
              </span>
              <input className="settings-switch-input" type="checkbox" role="switch" checked={settings.saveSession} disabled={loading || saving} onChange={(event) => setSettings({ ...settings, saveSession: event.target.checked })} />
            </label>
          </div>
        </div>
        <div className="settings-panel-footer">
          <button className="btn-ghost" type="button" onClick={close}>{isPt ? 'Fechar' : 'Close'}</button>
          <button className="btn-primary btn-success" type="submit" disabled={loading || saving || closing}>
            {saving ? (isPt ? 'Salvando…' : 'Saving…') : (isPt ? 'Salvar configurações' : 'Save settings')}
          </button>
        </div>
      </form>
    </dialog>
  </>
}
