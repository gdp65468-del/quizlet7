'use client'

import { FormEvent, useState } from 'react'
import { ArrowIcon, SparkIcon } from '@/components/ui'
import { useI18n } from '@/lib/i18n'
import { soundEngine } from '@/lib/sound-engine'

export default function Lobby({
  gameId,
  onRegistered,
}: {
  gameId: string
  onRegistered: (player: { id: string; token: string; nickname: string }) => void
}) {
  const { t, locale } = useI18n()
  const [nickname, setNickname] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    soundEngine.unlock()
    setSending(true)
    setError('')
    try {
      const response = await fetch(`/api/games/${gameId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'join', nickname }),
      })
      const player = await response.json()
      if (!response.ok) throw new Error(player.error)
      onRegistered(player)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not join game')
      setSending(false)
    }
  }

  return (
    <div className="container-game flex min-h-[75vh] items-center justify-center pb-16">
      <div className="w-full max-w-md animate-in">
        <div className="mb-7 text-center">
          <p className="eyebrow flex items-center justify-center gap-2">
            <SparkIcon className="h-4 w-4" />{' '}
            {locale === 'pt' ? 'Sua partida está esperando' : 'Your game is waiting'}
          </p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-[-.055em] sm:text-5xl">
            {locale === 'pt' ? (
              <>
                Entrar na <span className="gradient-text">sala.</span>
              </>
            ) : (
              <>
                Join the <span className="gradient-text">session.</span>
              </>
            )}
          </h1>
          <p className="text-muted mt-3">
            {locale === 'pt' ? 'Escolha um apelido para entrar.' : 'Choose a name to enter the room.'}
          </p>
        </div>
        <form onSubmit={submit} className="glass p-7 sm:p-9">
          <div className="glass-soft mb-7 flex items-center justify-between px-4 py-3 text-sm">
            <span className="text-muted">{t.roomCode}</span>
            <span className="font-mono font-bold tracking-widest text-[#cbbdff]">{gameId.slice(0, 8).toUpperCase()}</span>
          </div>
          <label htmlFor="nickname" className="label">
            {locale === 'pt' ? 'Seu apelido' : 'Your nickname'}
          </label>
          <input
            id="nickname"
            className="field text-lg"
            type="text"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            placeholder={locale === 'pt' ? 'Como você quer aparecer?' : 'What should we call you?'}
            maxLength={20}
            required
            autoComplete="nickname"
          />
          <p className="text-muted mt-2 text-xs">
            {locale === 'pt' ? 'Até 20 caracteres.' : 'Up to 20 characters. Make it yours.'}
          </p>
          {error && (
            <p role="alert" className="notice mt-5 text-sm">
              {error}
            </p>
          )}
          <button disabled={sending} className="btn-primary btn-success mt-7 w-full py-4">
            {sending
              ? locale === 'pt'
                ? 'Entrando...'
                : 'Joining room...'
              : locale === 'pt'
                ? 'Entrar no jogo'
                : 'Join the game'}{' '}
            <ArrowIcon />
          </button>
        </form>
        <p className="text-muted mt-5 text-center text-xs">
          {locale === 'pt'
            ? 'O apresentador iniciará quando todos estiverem prontos.'
            : 'The host will start once everyone is here.'}
        </p>
      </div>
    </div>
  )
}
