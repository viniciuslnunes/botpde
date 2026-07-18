'use client'

import { useEffect, useRef, useState } from 'react'
import { SSE_RECONNECT_DATA } from '@/lib/sse-protocol'

/**
 * Railway/Fastly: corte sujo de HTTP/2 vira ERR_HTTP2_PROTOCOL_ERROR no console
 * e pode envenenar a conexão multiplexada — soft nav do App Router trava.
 *
 * Mitigações:
 * - servidor manda `data: reconnect` cedo (`sse-stream`); trocamos antes do RST
 * - em erro, fechamos o EventSource (senão ele martela sozinho)
 * - backoff exponencial + circuit breaker (pausa longa; polling cobre)
 * - aba oculta: fecha o stream (não disputa o H2 com navegação)
 */
const PROACTIVE_RECONNECT_MS = 27_000
const BASE_ERROR_MS = 8_000
const MAX_ERROR_MS = 60_000
/** Após N falhas seguidas, para de tentar SSE por este tempo. */
const CIRCUIT_OPEN_MS = 120_000
const CIRCUIT_THRESHOLD = 2

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

  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const sync = () => setVisible(document.visibilityState === 'visible')
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [])

  useEffect(() => {
    if (!enabled || !endpoint || !visible) return

    let source: EventSource | null = null
    let disposed = false
    let generation = 0
    let consecutiveFailures = 0
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

    const backoffMs = () => {
      if (consecutiveFailures >= CIRCUIT_THRESHOLD) return CIRCUIT_OPEN_MS
      const exp = Math.max(0, consecutiveFailures - 1)
      return Math.min(BASE_ERROR_MS * 2 ** exp, MAX_ERROR_MS)
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
        consecutiveFailures = 0
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
        consecutiveFailures += 1
        // Fecha para desligar o auto-reconnect nativo; reagendamos nós.
        detach(next)
        if (source === next) source = null
        // Pausa o H2 antes de tentar de novo — senão soft nav fica sem conexão.
        errorTimer = setTimeout(open, backoffMs())
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
  }, [endpoint, enabled, visible])
}
