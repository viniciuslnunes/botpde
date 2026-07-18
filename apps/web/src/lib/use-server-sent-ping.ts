'use client'

import { useEffect, useRef } from 'react'
import { SSE_RECONNECT_DATA } from '@/lib/sse-protocol'

/**
 * Railway/Fastly: corte sujo de HTTP/2 vira ERR_HTTP2_PROTOCOL_ERROR no console.
 * O servidor envia `data: reconnect` ~50s (`sse-stream`); aqui trocamos a
 * conexão *antes* do close — e, em erro, fechamos o EventSource (senão ele
 * martela reconnect sozinho).
 */
const PROACTIVE_RECONNECT_MS = 52_000
const ERROR_RECONNECT_MS = 5_000

/**
 * Transporte SSE puro: abre `endpoint` com EventSource e chama `onPing` a cada
 * evento `data: ping`. Não interpreta payload de negócio — quem consome decide.
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
    let generation = 0
    let proactiveTimer: ReturnType<typeof setTimeout> | undefined
    let errorTimer: ReturnType<typeof setTimeout> | undefined

    const clearTimers = () => {
      if (proactiveTimer) clearTimeout(proactiveTimer)
      if (errorTimer) clearTimeout(errorTimer)
      proactiveTimer = undefined
      errorTimer = undefined
    }

    const detach = (es: EventSource | null) => {
      if (!es) return
      // Evita onerror do close limpo derrubar a próxima conexão.
      es.onerror = null
      es.onmessage = null
      es.close()
    }

    const open = () => {
      if (disposed) return
      clearTimers()
      const id = ++generation
      detach(source)
      source = null

      const next = new EventSource(endpoint)
      source = next
      next.onmessage = (event: MessageEvent<string>) => {
        if (id !== generation || disposed) return
        if (event.data === SSE_RECONNECT_DATA) {
          // Troca limpa pedida pelo servidor — evita RST HTTP/2 do proxy.
          open()
          return
        }
        if (event.data === 'ping') {
          onPingRef.current()
        }
      }
      next.onerror = () => {
        if (id !== generation || disposed) return
        // Fecha para desligar o auto-reconnect nativo; reagendamos nós.
        detach(next)
        if (source === next) source = null
        errorTimer = setTimeout(open, ERROR_RECONNECT_MS)
      }
      proactiveTimer = setTimeout(() => {
        if (id !== generation || disposed) return
        open()
      }, PROACTIVE_RECONNECT_MS)
    }

    open()

    return () => {
      disposed = true
      generation += 1
      clearTimers()
      detach(source)
      source = null
    }
  }, [endpoint, enabled])
}
