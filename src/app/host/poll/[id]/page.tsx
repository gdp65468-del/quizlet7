'use client'

import Link from 'next/link'
import { memo, use, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useQRCode } from 'next-qrcode'
import { Brand, Delay, StatPill } from '@/components/ui'
import { LanguageToggle, useI18n } from '@/lib/i18n'
import { useCloudSync } from '@/lib/cloud-sync'
import { usePollView } from '@/lib/use-poll-view'
import { pollColors } from '@/lib/poll-colors'
import type { HostPollView } from '@/types/poll'

const qrOptions = { errorCorrectionLevel: 'M' as const, margin: 2, width: 320 }

function canScan(url: string) {
  try {
    const parsed = new URL(url)
    return ['http:', 'https:'].includes(parsed.protocol) &&
      !['localhost', '127.0.0.1', '0.0.0.0', '[::1]'].includes(parsed.hostname)
  } catch { return false }
}

const SharePoll = memo(function SharePoll({ defaultUrl, id }: { defaultUrl: string | null; id: string }) {
  const { locale, t } = useI18n()
  const isPt = locale === 'pt'
  const { Canvas } = useQRCode()
  const [url, setUrl] = useState(defaultUrl ?? '')
  const [copied, setCopied] = useState(false)
  const [copyHint, setCopyHint] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const qrUrl = canScan(url) ? url : ''

  const copy = async () => {
    let successful = false
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(url); successful = true } catch { /* Use selection below. */ }
    }
    if (!successful && input.current) {
      input.current.focus()
      input.current.select()
      try { successful = document.execCommand('copy') } catch { /* Clipboard may be blocked. */ }
    }
    setCopied(successful)
    setCopyHint(
      successful
        ? ''
        : isPt
          ? 'Pressione Ctrl+C ou Cmd+C para copiar o link selecionado.'
          : 'Press Ctrl+C or Cmd+C to copy the selected link.',
    )
    if (successful) window.setTimeout(() => setCopied(false), 1800)
  }

  return <section className="glass h-full p-6 sm:p-7" aria-labelledby="poll-share-title">
    <p className="eyebrow">{isPt ? 'Convidar participantes' : 'Invite participants'}</p>
    <h2 id="poll-share-title" className="mt-2 text-2xl font-bold">{isPt ? 'Escaneie para votar' : 'Scan to vote'}</h2>
    <div className="qr-frame mx-auto mt-6 flex aspect-square w-full max-w-[360px] items-center justify-center p-4">
      {qrUrl
        ? <Canvas text={qrUrl} options={qrOptions} />
        : <p className="max-w-56 text-center text-sm font-semibold text-slate-700">
            {isPt ? 'Informe um endereço de rede abaixo para gerar o QR Code.' : 'Enter a network address below to generate the QR code.'}
          </p>}
    </div>
    <div className="glass-soft mt-6 flex items-center justify-between gap-4 px-5 py-4">
      <span className="eyebrow">{isPt ? 'Código da enquete' : 'Poll code'}</span><strong className="font-mono text-3xl font-extrabold tracking-[.08em]">{id}</strong>
    </div>
    <label className="mt-5 block">
      <span className="label">{t.playerLink}</span>
      <input ref={input} className="field text-sm" value={url} onChange={(event) => { setUrl(event.target.value); setCopied(false); setCopyHint('') }} />
    </label>
    <p className="text-muted mt-2 text-xs">
      {isPt
        ? 'Compartilhe este link com os participantes. Para uso em rede local, os celulares devem estar na mesma rede.'
        : 'Share this link with participants. For local hosting, their phones must be on the same network.'}
    </p>
    <button className="btn-secondary mt-4 w-full" type="button" disabled={!qrUrl} onClick={copy}>
      {copied ? t.copied : (isPt ? 'Copiar link da enquete' : 'Copy poll link')}
    </button>
    {copyHint && <p className="text-muted mt-2 text-xs" role="status">{copyHint}</p>}
  </section>
})

function PollChart({ view, working, onEnd, onLeave }: {
  view: HostPollView
  working: boolean
  onEnd: () => void
  onLeave: (modify: boolean) => void
}) {
  const { locale } = useI18n()
  const isPt = locale === 'pt'

  return <section className="glass h-full p-6 sm:p-8" aria-labelledby="poll-chart-title">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="eyebrow">
          {view.phase === 'open'
            ? (isPt ? 'Resultados ao vivo' : 'Live results')
            : (isPt ? 'Resultados finais' : 'Final results')}
        </p>
        <h2 id="poll-chart-title" className="mt-2 text-2xl font-bold">{view.question}</h2>
      </div>
      <StatPill accent={view.phase === 'open' ? 'cyan' : 'mint'}>
        {view.phase === 'open' ? (isPt ? 'Aberta' : 'Open') : (isPt ? 'Encerrada' : 'Ended')}
      </StatPill>
    </div>
    <div className="glass-soft mt-7 flex items-baseline justify-between gap-3 px-5 py-4" aria-live="polite">
      <span className="font-semibold">{isPt ? 'Votos recebidos' : 'Submitted'}</span>
      <strong className="text-3xl font-extrabold tabular-nums">{view.submissionCount}</strong>
    </div>
    <div className="mt-8 space-y-5" aria-label={isPt ? 'Distribuição de votos' : 'Vote distribution'}>
      {view.options.map((option, index) => {
        const count = view.voteCounts[option.id] ?? 0
        const percent = view.submissionCount ? Math.round(count / view.submissionCount * 100) : 0
        return <div className="poll-result-row" key={option.id} style={{ '--poll-rgb': pollColors[index] } as CSSProperties}>
          <div className="mb-2 flex items-baseline justify-between gap-3"><span className="min-w-0 font-semibold">{option.text}</span><strong className="shrink-0 tabular-nums">{count} <span className="text-muted text-xs font-medium">({percent}%)</span></strong></div>
          <div className="poll-bar-track"><span className="poll-bar-fill" style={{ width: `${percent}%` }} /></div>
        </div>
      })}
    </div>
    <p className="text-muted mt-8 text-sm">
      {view.phase === 'open'
        ? (isPt ? 'O gráfico é atualizado conforme os participantes votam.' : 'The chart updates as participants submit.')
        : view.endedAutomatically
          ? (isPt ? 'A enquete foi encerrada após uma hora. Os participantes já podem ver o resultado final.' : 'The poll closed after one hour. Participants can see the final results.')
          : (isPt ? 'Os participantes já podem ver estes resultados nos dispositivos.' : 'Participants can now see these results on their devices.')}
    </p>
    <div className="mt-5 flex flex-wrap gap-3">
      {view.phase === 'open'
        ? <button className="btn-cancel" type="button" disabled={working} onClick={onEnd}>
            {working ? (isPt ? 'Encerrando enquete…' : 'Ending poll…') : (isPt ? 'Encerrar enquete' : 'End poll')}
          </button>
        : <>
          <button className="btn-secondary" type="button" disabled={working} onClick={() => onLeave(true)}>
            {isPt ? 'Editar enquete' : 'Modify poll'}
          </button>
          <button className="btn-primary btn-success" type="button" disabled={working} onClick={() => onLeave(false)}>
            {working ? (isPt ? 'Fechando…' : 'Closing…') : (isPt ? 'Fechar e voltar ao início' : 'Close and go home')}
          </button>
        </>}
    </div>
  </section>
}

export default function HostPoll({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { locale, t } = useI18n()
  const { user } = useCloudSync()
  const isPt = locale === 'pt'
  const [hostToken, setHostToken] = useState('')
  const [working, setWorking] = useState(false)
  const { view, applyView, error, setError } = usePollView<HostPollView>(id, 'host', hostToken)

  useEffect(() => {
    const timer = setTimeout(() => {
      const token = localStorage.getItem(`host:poll:${id}`) ?? ''
      setHostToken(token)
      if (!token) {
        setError(
          isPt
            ? 'O acesso de apresentador só está disponível no navegador que criou esta enquete.'
            : 'Host access is only available in the browser that created this poll.',
        )
      }
    }, 0)
    return () => clearTimeout(timer)
  }, [id, isPt, setError])

  const end = async () => {
    if (working) return
    setWorking(true)
    try {
      const response = await fetch(`/api/polls/${id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-host-token': hostToken },
        body: JSON.stringify({ action: 'end' }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || (isPt ? 'Não foi possível encerrar a enquete' : 'Could not end poll'))
      applyView(result)
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (isPt ? 'Não foi possível encerrar a enquete' : 'Could not end poll'))
    } finally { setWorking(false) }
  }

  const leave = async (modify: boolean) => {
    if (working || !view) return
    setWorking(true)
    try {
      const response = await fetch(`/api/polls/${id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-host-token': hostToken },
        body: JSON.stringify({ action: 'close' }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || (isPt ? 'Não foi possível fechar a enquete' : 'Could not close poll'))
      if (modify) sessionStorage.setItem('poll:draft', JSON.stringify({ question: view.question, options: view.options.map((option) => option.text) }))
      localStorage.removeItem(`host:poll:${id}`)
      window.location.assign(modify ? (user ? '/painel/enquete' : '/host/dashboard/polls/new') : '/')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (isPt ? 'Não foi possível fechar a enquete' : 'Could not close poll'))
      setWorking(false)
    }
  }

  return <main className="app-shell"><div className="surface">
    <header className="container-game flex flex-wrap items-center justify-between gap-4 py-5 sm:py-7">
      <Link href="/" aria-label={t.backToHome}><Brand /></Link>
      <div className="flex flex-wrap items-center gap-2.5">
        <LanguageToggle />
        <StatPill accent="mint"><span className="live-dot" /> {isPt ? 'Enquete do host' : 'Host poll'}</StatPill>
      </div>
    </header>
    {error && <div className="container-game"><p className="notice mb-5" role="alert">{error}</p></div>}
    {!view && !error && <div className="container-game glass mt-8 flex min-h-72 items-center justify-center"><p className="text-muted">{isPt ? 'Preparando sua enquete…' : 'Preparing your poll…'}</p></div>}
    {view && <div className="container-game pb-16 animate-in">
      <div className="mb-8">
        <p className="eyebrow">
          {view.phase === 'open'
            ? (isPt ? 'Pronta para respostas' : 'Ready for responses')
            : (isPt ? 'Enquete concluída' : 'Poll complete')}
        </p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-5xl">
          {view.phase === 'open'
            ? (isPt ? 'Sua enquete está ao vivo.' : 'Your poll is live.')
            : (isPt ? 'Resultados da enquete' : 'Poll results')}
        </h1>
        <p className="text-muted mt-3">
          {view.phase === 'open'
            ? (isPt
                ? 'Compartilhe o link ou QR Code. Cada navegador pode votar uma vez nesta enquete.'
                : 'Share the link or QR code. Each browser can submit once to this poll.')
            : view.endedAutomatically
              ? (isPt
                  ? 'Esta enquete foi encerrada automaticamente após uma hora. Todos podem ver os totais finais.'
                  : 'This poll closed automatically after one hour. Everyone can see the final totals.')
              : (isPt
                  ? 'As respostas foram encerradas. Todos podem ver os totais finais.'
                  : 'Responses are closed. Everyone can see the final totals.')}
        </p>
      </div>
      <div className="grid gap-5 lg:grid-cols-2"><Delay index={1}><PollChart view={view} working={working} onEnd={end} onLeave={leave} /></Delay><Delay index={2}><SharePoll key={id} defaultUrl={view.joinUrl} id={id} /></Delay></div>
    </div>}
  </div></main>
}
