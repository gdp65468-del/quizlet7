'use client'

import { memo, useRef, useState } from 'react'
import { useQRCode } from 'next-qrcode'
import { ArrowIcon, Delay, StatPill } from '@/components/ui'
import { useI18n } from '@/lib/i18n'
import { soundEngine } from '@/lib/sound-engine'
import type { Participant } from '@/types/game'

const qrOptions = { errorCorrectionLevel: 'M' as const, margin: 2, width: 320 }
const JoinCode = memo(function JoinCode({ url }: { url: string }) {
  const { Canvas } = useQRCode()
  return <Canvas text={url} options={qrOptions} />
})

function canScan(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (
      ['http:', 'https:'].includes(parsed.protocol) &&
      !['localhost', '127.0.0.1', '0.0.0.0', '[::1]'].includes(parsed.hostname)
    )
  } catch {
    return false
  }
}

export default function Lobby({
  participants,
  gameId,
  quizName,
  classLabel,
  defaultJoinUrl,
  onStart,
  onCancel,
  cancelling,
}: {
  participants: Participant[]
  gameId: string
  quizName: string
  classLabel?: string
  defaultJoinUrl: string | null
  onStart: () => void
  onCancel: () => void
  cancelling: boolean
}) {
  const { t, locale } = useI18n()
  const [joinUrl, setJoinUrl] = useState(defaultJoinUrl ?? '')
  const [copied, setCopied] = useState(false)
  const [copyHint, setCopyHint] = useState('')
  const linkInput = useRef<HTMLInputElement>(null)
  const qrUrl = canScan(joinUrl) ? joinUrl : ''

  const copySelectedLink = () => {
    const input = linkInput.current
    if (!input) return false

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    input.focus()
    input.select()
    try {
      const didCopy = document.execCommand('copy')
      if (didCopy) previousFocus?.focus()
      return didCopy
    } catch {
      return false
    }
  }

  const copyLink = async () => {
    soundEngine.unlock()
    let didCopy = false
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(joinUrl)
        didCopy = true
      } catch {
        didCopy = copySelectedLink()
      }
    } else {
      didCopy = copySelectedLink()
    }

    if (didCopy) {
      setCopied(true)
      setCopyHint('')
      window.setTimeout(() => setCopied(false), 1800)
    } else {
      setCopied(false)
      linkInput.current?.focus()
      linkInput.current?.select()
      setCopyHint(
        locale === 'pt'
          ? 'Acesso à área de transferência bloqueado. Pressione Ctrl+C ou Cmd+C.'
          : 'Clipboard access is blocked. Press Ctrl+C or Cmd+C to copy the selected link.',
      )
    }
  }

  return (
    <div className="container-game pb-16">
      <div className="mb-8 animate-in">
        <div className="flex flex-wrap items-center gap-2.5">
          <p className="eyebrow">{t.waitingRoom}</p>
          {classLabel && <StatPill accent="violet">{classLabel}</StatPill>}
        </div>
        <h1 className="mt-3 text-3xl font-extrabold tracking-[-.05em] sm:text-5xl">
          {locale === 'pt' ? (
            <>
              Sua sala está <span className="gradient-text">aberta.</span>
            </>
          ) : (
            <>
              Your room is <span className="gradient-text">open.</span>
            </>
          )}
        </h1>
        <p className="text-muted mt-3 max-w-xl leading-relaxed">
          {locale === 'pt' ? (
            <>
              Convide todos para <strong className="text-white">{quizName}</strong> e inicie quando a turma estiver pronta.
            </>
          ) : (
            <>
              Invite everyone to <strong className="text-white">{quizName}</strong>, then start when the room feels ready.
            </>
          )}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Delay index={1}>
          <section className="glass h-full p-6 sm:p-8" aria-labelledby="players-title">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="eyebrow">{locale === 'pt' ? 'A sala' : 'The room'}</p>
                <h2 id="players-title" className="mt-2 text-2xl font-bold">
                  {t.playersJoined}
                </h2>
              </div>
              <StatPill accent="cyan">
                {participants.length}{' '}
                {participants.length === 1
                  ? locale === 'pt'
                    ? 'jogador'
                    : 'player'
                  : locale === 'pt'
                    ? 'jogadores'
                    : 'players'}
              </StatPill>
            </div>
            <div className="rule my-6" />
            <div className="glass-soft mb-6 flex items-center justify-between gap-4 px-5 py-4">
              <div>
                <p className="eyebrow">{t.roomCode}</p>
                <p className="text-muted mt-1 text-sm">
                  {locale === 'pt' ? 'Código curto para entrar na partida.' : 'The final characters of the join link.'}
                </p>
              </div>
              <strong className="font-mono text-4xl font-extrabold tracking-[.08em] text-white sm:text-5xl">{gameId}</strong>
            </div>
            {participants.length === 0 ? (
              <div className="glass-soft flex min-h-52 flex-col items-center justify-center px-4 text-center">
                <span className="waiting-orbit mb-5" aria-hidden="true">
                  <span />
                </span>
                <p className="font-semibold">{t.waitingPlayers}</p>
                <p className="text-muted mt-1 text-sm">
                  {locale === 'pt' ? 'Compartilhe o link ou o QR Code ao lado.' : 'Share the link or let them scan the code.'}
                </p>
              </div>
            ) : (
              <div className="flex min-h-52 content-start flex-wrap gap-3" aria-live="polite">
                {participants.map((participant, index) => (
                  <span key={participant.id} className="player-chip animate-in" style={{ animationDelay: `${index * 65}ms` }}>
                    <span className="player-avatar">{participant.nickname.slice(0, 1).toUpperCase()}</span>
                    {participant.nickname}
                  </span>
                ))}
              </div>
            )}
            <div className="rule my-6" />
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-muted text-sm">
                {locale === 'pt' ? 'Você pode começar com qualquer quantidade de jogadores.' : 'You can start with any number of participants.'}
              </p>
              <button
                className="btn-primary btn-success min-w-44"
                onClick={() => {
                  soundEngine.unlock()
                  onStart()
                }}
              >
                {t.startQuiz} <ArrowIcon />
              </button>
            </div>
          </section>
        </Delay>

        <Delay index={2}>
          <section className="glass h-full p-6 sm:p-7" aria-labelledby="share-title">
            <p className="eyebrow">{locale === 'pt' ? 'Convide sua turma' : 'Invite your participants'}</p>
            <h2 id="share-title" className="mt-2 text-2xl font-bold">
              {t.scanToJoin}
            </h2>
            <div className="qr-frame mx-auto mt-6 flex aspect-square w-full max-w-[360px] items-center justify-center p-4">
              {qrUrl ? (
                <JoinCode url={qrUrl} />
              ) : (
                <p className="max-w-56 text-center text-sm font-semibold text-slate-700">
                  {locale === 'pt' ? 'Informe um endereço de rede abaixo para gerar o QR Code.' : 'Enter a network address below to generate the QR code.'}
                </p>
              )}
            </div>
            <label className="mt-6 block">
              <span className="label">{t.playerLink}</span>
              <input
                ref={linkInput}
                className="field text-sm"
                value={joinUrl}
                onChange={(event) => {
                  setJoinUrl(event.target.value)
                  setCopied(false)
                  setCopyHint('')
                }}
                aria-label="Player join URL"
              />
            </label>
            <button className="btn-secondary mt-4 w-full" type="button" onClick={copyLink} disabled={!qrUrl} aria-live="polite">
              {copied ? t.copied : t.copyLink}
            </button>
            {copyHint && (
              <p role="status" className="text-muted mt-2 text-xs">
                {copyHint}
              </p>
            )}
          </section>
        </Delay>
      </div>
      <div className="mt-8 flex justify-center animate-in">
        <button className="btn-cancel" type="button" onClick={onCancel} disabled={cancelling}>
          {cancelling ? t.cancelling : t.cancelQuiz}
        </button>
      </div>
    </div>
  )
}
