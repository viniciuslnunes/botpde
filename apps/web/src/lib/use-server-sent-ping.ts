'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ensureSseNavGateInstalled,
  isSsePausedForNav,
  subscribeSseNavGate,
} from '@/lib/sse-nav-gate'
import { subscribeSharedSse } from '@/lib/sse-shared-source'

/**
 * Railway/Fastly: corte sujo de HTTP/2 vira ERR_HTTP2_PROTOCOL_ERROR no console
 * e pode envenenar a conexão multiplexada — soft nav do App Router trava.
 *
 * Mitigações (em `sse-shared-source` + `sse-nav-gate` + `sse-stream`):
 * - um EventSource por endpoint (navbar/chat/banner não duplicam)
 * - servidor manda `data: reconnect` cedo; cliente troca limpo
 * - backoff + circuit breaker; aba oculta e soft-nav fecham o stream
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

  const [navPaused, setNavPaused] = useState(false)
  useEffect(() => {
    const uninstall = ensureSseNavGateInstalled()
    const sync = () => setNavPaused(isSsePausedForNav())
    sync()
    const unsubscribe = subscribeSseNavGate(sync)
    return () => {
      unsubscribe()
      uninstall()
    }
  }, [])

  useEffect(() => {
    if (!enabled || !endpoint || !visible || navPaused) return
    return subscribeSharedSse(endpoint, () => {
      onPingRef.current()
    })
  }, [endpoint, enabled, visible, navPaused])
}
