'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { GamePhase } from '@/types/game'

type LiveView = {
  serverNow: number
  phase: GamePhase
  isAnswerRevealed: boolean
}

export function useGameView<T extends LiveView>(
  id: string,
  role: 'host' | 'player',
  token = '',
  playerId = '',
) {
  const [view, setView] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [now, setNow] = useState(0)
  const viewRef = useRef<T | null>(null)
  const receivedAt = useRef(0)
  const previousId = useRef(id)

  useEffect(() => {
    if (previousId.current === id) return
    previousId.current = id
    viewRef.current = null
    receivedAt.current = 0
    setView(null)
    setNow(0)
  }, [id])

  const applyView = useCallback((next: T) => {
    viewRef.current = next
    receivedAt.current = Date.now()
    setNow(next.serverNow)
    setView(next)
  }, [])

  useEffect(() => {
    if (role === 'host' && !token) return

    let active = true
    let connecting = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let pollTimer: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | null = null
    let retryDelay = 1000
    let lastEtag = ''
    let pollingMode = false
    const isFinished = () => viewRef.current?.phase === 'result' || viewRef.current?.phase === 'cancelled' || viewRef.current?.phase === 'expired'

    const authHeaders = (): Record<string, string> =>
      role === 'host'
        ? { 'x-host-token': token }
        : token && playerId ? { 'x-player-id': playerId, 'x-player-token': token } : {}

    const pollOnce = async () => {
      if (!active || document.hidden || connecting || isFinished()) return
      connecting = true
      controller = new AbortController()
      const requestController = controller
      try {
        const headers = authHeaders()
        if (lastEtag) headers['if-none-match'] = lastEtag
        const response = await fetch(`/api/games/${id}`, {
          headers,
          cache: 'no-store',
          signal: requestController.signal,
        })
        if (response.status === 304) {
          if (active) setError('')
          retryDelay = 950
          return
        }
        if (!response.ok) {
          throw new Error(
            response.status === 404
              ? 'Game not found. The server may have restarted.'
              : response.status === 403
                ? 'Room access is no longer valid.'
                : 'Could not connect to game',
          )
        }
        const nextEtag = response.headers.get('etag')
        if (nextEtag) lastEtag = nextEtag
        const next = (await response.json()) as T
        if (active) {
          applyView(next)
          setError('')
        }
        retryDelay = 950
      } catch (cause) {
        if (active && !document.hidden && !isFinished()) {
          if (cause instanceof Error && cause.name !== 'AbortError') {
            setError(cause.message)
          }
        }
      } finally {
        controller = null
        connecting = false
        if (active && !document.hidden && !isFinished()) {
          pollTimer = setTimeout(() => { void pollOnce() }, retryDelay)
          retryDelay = Math.min(5000, Math.round(retryDelay * 1.35))
        }
      }
    }

    const connect = async () => {
      if (!active || document.hidden || connecting || isFinished()) return
      if (pollingMode) {
        await pollOnce()
        return
      }
      connecting = true
      controller = new AbortController()
      const requestController = controller
      let switchedToPolling = false
      try {
        const headers = authHeaders()
        const response = await fetch(`/api/games/${id}/events`, {
          headers, cache: 'no-store', signal: requestController.signal,
        })
        if (!response.ok) throw new Error(response.status === 404
          ? 'Game not found. The server may have restarted.'
          : response.status === 403 ? 'Room access is no longer valid.' : 'Could not connect to game')
        if (!response.body) throw new Error('The server did not open a live connection')

        if (response.headers.get('x-live-transport') === 'poll') {
          pollingMode = true
          switchedToPolling = true
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        if (active) setError('')
        while (active && !document.hidden) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          if (buffer.length > 1_000_000) throw new Error('Live update was too large')
          let end = buffer.indexOf('\n\n')
          while (end !== -1) {
            const frame = buffer.slice(0, end)
            buffer = buffer.slice(end + 2)
            const data = frame.split('\n').find((line) => line.startsWith('data: '))
            if (data) {
              const next = JSON.parse(data.slice(6)) as T
              if (active) { applyView(next); setError('') }
              if (next.phase === 'result' || next.phase === 'cancelled' || next.phase === 'expired') {
                requestController.abort()
                return
              }
            }
            end = buffer.indexOf('\n\n')
          }
        }
        if (switchedToPolling) return
        if (active && !document.hidden) throw new Error('Live connection closed')
      } catch (cause) {
        if (active && !document.hidden && !isFinished()) {
          setError(cause instanceof Error && cause.name !== 'AbortError'
            ? cause.message : 'Live connection lost. Reconnecting...')
        }
      } finally {
        requestController.abort()
        controller = null
        connecting = false
        if (active && !document.hidden && !isFinished()) {
          if (pollingMode) {
            retryDelay = 950
            pollTimer = setTimeout(() => { void pollOnce() }, 950)
          } else {
            retryTimer = setTimeout(connect, retryDelay)
            retryDelay = Math.min(8000, retryDelay * 2)
          }
        }
      }
    }

    const onVisibilityChange = () => {
      clearTimeout(retryTimer)
      clearTimeout(pollTimer)
      if (document.hidden) controller?.abort()
      else if (!connecting) void connect()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    void connect()
    return () => {
      active = false
      clearTimeout(retryTimer)
      clearTimeout(pollTimer)
      controller?.abort()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [id, role, token, playerId, applyView])

  useEffect(() => {
    if (view?.phase !== 'quiz' || view.isAnswerRevealed) return
    let timer: ReturnType<typeof setInterval> | undefined
    const tick = () => setNow(view.serverNow + Date.now() - receivedAt.current)
    const onVisibilityChange = () => {
      clearInterval(timer)
      if (!document.hidden) { tick(); timer = setInterval(tick, 250) }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    onVisibilityChange()
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [view?.serverNow, view?.phase, view?.isAnswerRevealed])

  return { view, setView, applyView, error, setError, now }
}
