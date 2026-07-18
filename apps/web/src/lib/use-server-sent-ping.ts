'use client'

import { useEffect, useRef } from 'react'

/**
 * Railway fecha HTTP/2 ~5 min — reconectamos limpo antes disso para evitar
 * `ERR_HTTP2_PROTOCOL_ERROR` no console. EventSource já reconecta em erro;
 * o timer só antecipa o corte sujo do proxy.
 */
const RECONNECT_MS = 4 * 60 * 1000

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
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined

    const open = () => {
      if (disposed) return
      source?.close()
      source = new EventSource(endpoint)
      source.onmessage = () => onPingRef.current()
      // Erro: o browser reconecta sozinho; só limpamos se já descartamos o hook.
      source.onerror = () => {
        if (disposed) source?.close()
      }
      if (reconnectTimer) clearTimeout(reconnectTimer)
      reconnectTimer = setTimeout(() => {
        // Fecha limpo e reabre antes do timeout do Railway (~5 min).
        open()
      }, RECONNECT_MS)
    }

    open()

    return () => {
      disposed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      source?.close()
    }
  }, [endpoint, enabled])
}
