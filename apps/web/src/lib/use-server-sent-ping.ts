'use client'

import { useEffect, useRef } from 'react'

/**
 * Railway/Fastly: corte sujo de HTTP/2 vira ERR_HTTP2_PROTOCOL_ERROR no console.
 * O servidor fecha limpo ~55s (`sse-stream`); aqui reconectamos um pouco depois
 * e, em erro, fechamos o EventSource (senão ele martela reconnect sozinho).
 */
const PROACTIVE_RECONNECT_MS = 60_000
const ERROR_RECONNECT_MS = 5_000

/**
 * Transporte SSE puro: abre `endpoint` com EventSource e chama `onPing` a cada
 * evento. Não interpreta payload — quem consome decide o que refazer/mostrar.
 * `enabled=false` fecha a conexão (ex.: painel de chat colapsado).
 */
export function useServerSentPing(
  endpoint: string,
  onPing: () => void,
  enabled = true,
): void {
  const onPingRef = useRef(onPing)
  useEffect(() => {
    onPingRef.current = onPing
  }, [onPing])

  useEffect(() => {
    if (!enabled || !endpoint) return

    let source: EventSource | null = null
    let disposed = false
    let proactiveTimer: ReturnType<typeof setTimeout> | undefined
    let errorTimer: ReturnType<typeof setTimeout> | undefined

    const clearTimers = () => {
      if (proactiveTimer) clearTimeout(proactiveTimer)
      if (errorTimer) clearTimeout(errorTimer)
      proactiveTimer = undefined
      errorTimer = undefined
    }

    const open = () => {
      if (disposed) return
      clearTimers()
      source?.close()
      source = new EventSource(endpoint)
      source.onmessage = () => onPingRef.current()
      source.onerror = () => {
        // Fecha para desligar o auto-reconnect nativo; reagendamos nós.
        source?.close()
        source = null
        if (disposed) return
        errorTimer = setTimeout(open, ERROR_RECONNECT_MS)
      }
      proactiveTimer = setTimeout(() => {
        open()
      }, PROACTIVE_RECONNECT_MS)
    }

    open()

    return () => {
      disposed = true
      clearTimers()
      source?.close()
    }
  }, [endpoint, enabled])
}
