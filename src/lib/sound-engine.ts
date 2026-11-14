'use client'

class SoundEngine {
  private ctx: AudioContext | null = null
  private muted = false
  private lobbyTimer: ReturnType<typeof setInterval> | null = null
  private lobbyStep = 0

  constructor() {
    if (typeof window !== 'undefined') {
      this.muted = localStorage.getItem('quizlet:muted') === '1'
    }
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined' || this.muted) return null
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioCtx) return null
      this.ctx = new AudioCtx()
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {})
    }
    return this.ctx
  }

  unlock() {
    this.ensureContext()
  }

  isMuted() {
    return this.muted
  }

  setMuted(muted: boolean) {
    this.muted = muted
    if (typeof window !== 'undefined') {
      localStorage.setItem('quizlet:muted', muted ? '1' : '0')
    }
    if (muted) {
      this.stopLobbyMusic()
    } else {
      this.ensureContext()
    }
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType = 'triangle',
    gainLevel = 0.09,
    startOffset = 0,
    endFreq?: number,
  ) {
    const ctx = this.ensureContext()
    if (!ctx) return
    const now = ctx.currentTime + startOffset
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, now)
    if (endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), now + duration)
    }
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(gainLevel, now + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + duration + 0.02)
  }

  startLobbyMusic() {
    if (this.muted || this.lobbyTimer) return
    this.ensureContext()
    // Upbeat energetic synth arpeggio groove (C5 - E5 - G5 - B5 - A5 - E5 - D5 - G5)
    const bassPattern = [130.81, 130.81, 164.81, 196.0, 146.83, 146.83, 174.61, 196.0]
    const leadPattern = [523.25, 659.25, 783.99, 659.25, 587.33, 659.25, 698.46, 783.99]

    const playStep = () => {
      if (this.muted) return
      const step = this.lobbyStep % bassPattern.length
      this.lobbyStep += 1
      if (step % 2 === 0) {
        this.playTone(bassPattern[step], 0.22, 'sine', 0.06)
      }
      this.playTone(leadPattern[step], 0.16, 'triangle', 0.045)
    }

    playStep()
    this.lobbyTimer = setInterval(playStep, 280)
  }

  stopLobbyMusic() {
    if (this.lobbyTimer) {
      clearInterval(this.lobbyTimer)
      this.lobbyTimer = null
    }
  }

  playCountdownTick(secondsLeft: number) {
    if (this.muted || secondsLeft <= 0 || secondsLeft > 5) return
    const pitch = 620 + (6 - secondsLeft) * 110
    this.playTone(pitch, 0.11, 'square', 0.055)
    if (secondsLeft === 1) {
      this.playTone(pitch * 1.25, 0.18, 'triangle', 0.06, 0.12)
    }
  }

  playRevealSound(positive = true) {
    if (this.muted) return
    if (positive) {
      this.playTone(523.25, 0.14, 'triangle', 0.09, 0)
      this.playTone(659.25, 0.14, 'triangle', 0.09, 0.09)
      this.playTone(783.99, 0.25, 'triangle', 0.1, 0.18)
    } else {
      this.playTone(330, 0.16, 'sawtooth', 0.05, 0, 220)
      this.playTone(246.94, 0.22, 'sawtooth', 0.045, 0.12, 185)
    }
  }

  playPlayerCorrect(streak = 1) {
    if (this.muted) return
    const boost = Math.min(4, Math.max(0, streak - 1)) * 45
    this.playTone(523.25 + boost, 0.12, 'triangle', 0.09, 0)
    this.playTone(659.25 + boost, 0.14, 'triangle', 0.09, 0.08)
    this.playTone(783.99 + boost, 0.26, 'sine', 0.1, 0.16)
  }

  playPlayerWrong() {
    if (this.muted) return
    this.playTone(280, 0.16, 'sawtooth', 0.045, 0, 210)
    this.playTone(210, 0.24, 'sawtooth', 0.045, 0.14, 155)
  }

  playLeaderboardSwoosh() {
    if (this.muted) return
    this.playTone(392, 0.12, 'sine', 0.07, 0, 587.33)
    this.playTone(587.33, 0.18, 'triangle', 0.07, 0.09, 783.99)
  }

  playPodiumFanfare() {
    if (this.muted) return
    const notes = [
      { f: 523.25, t: 0, d: 0.14 },
      { f: 659.25, t: 0.13, d: 0.14 },
      { f: 783.99, t: 0.26, d: 0.14 },
      { f: 1046.5, t: 0.4, d: 0.45 },
      { f: 783.99, t: 0.4, d: 0.42 },
      { f: 659.25, t: 0.4, d: 0.42 },
    ]
    for (const n of notes) {
      this.playTone(n.f, n.d, 'triangle', 0.085, n.t)
    }
  }
}

export const soundEngine = new SoundEngine()
