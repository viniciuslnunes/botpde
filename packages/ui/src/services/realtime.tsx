'use client'

import { useCallback, useEffect, useRef } from 'react'

type RealtimeCallback = (data: unknown) => void

/**
 * Serviço de Realtime — abstração sobre o provedor atual.
 *
 * Estágio 1 (MVP): polling via setInterval
 * Estágio 2: trocar a implementação interna para WebSockets/SSE
 *            sem alterar nenhum componente que usa este hook.
 */
export function useRealtime(
  channel: string,
  callback: RealtimeCallback,
  options: {
    /** Intervalo de polling em ms (padrão: 5000). Ignorado quando WebSockets estiver ativo. */
    interval?: number
    enabled?: boolean
    /** URL para polling. Se omitida, usa /api/realtime/:channel */
    pollUrl?: string
  } = {},
) {
  const { interval = 5000, enabled = true, pollUrl } = options
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  const lastDataRef = useRef<string>('')

  const poll = useCallback(async () => {
    const url = pollUrl ?? `/api/realtime/${encodeURIComponent(channel)}`
    try {
      const res = await fetch(url, { credentials: 'include' })
      if (!res.ok) return

      const data = await res.json()
      const serialized = JSON.stringify(data)

      // Só dispara callback se os dados mudaram
      if (serialized !== lastDataRef.current) {
        lastDataRef.current = serialized
        callbackRef.current(data)
      }
    } catch {
      // Silencioso em erros de rede — não interrompe a UX
    }
  }, [channel, pollUrl])

  useEffect(() => {
    if (!enabled) return

    // Poll imediato ao montar
    poll()

    const timer = setInterval(poll, interval)
    return () => clearInterval(timer)
  }, [enabled, interval, poll])
}
