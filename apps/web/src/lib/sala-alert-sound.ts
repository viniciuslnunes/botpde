let audioContext: AudioContext | null = null

/** Tom curto para alertar o anfitrião (Web Audio — sem arquivo externo). */
export function playSalaModerationAlert(): void {
  if (typeof window === 'undefined') return

  try {
    audioContext ??= new AudioContext()
    void audioContext.resume()

    const ctx = audioContext
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()

    oscillator.connect(gain)
    gain.connect(ctx.destination)

    const t = ctx.currentTime
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(880, t)
    oscillator.frequency.setValueAtTime(1174, t + 0.1)

    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.12, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4)

    oscillator.start(t)
    oscillator.stop(t + 0.4)
  } catch {
    // Navegador bloqueou áudio ou contexto indisponível
  }
}
