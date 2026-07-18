'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ensureSseNavGateInstalled,
  isSsePausedForNav,
  subscribeSseNavGate,
} from '@/lib/sse-nav-gate'
import { subscribeSharedSse } from '@/lib/sse-shared-source'

/**
 * Railway/Fastly + HTTP/2: stream SSE longo + RST do proxy vira
 * ERR_HTTP2_PROTOCOL_ERROR e pode envenenar soft-nav do App Router.
 *
 * Mitigações (`sse-shared-source` + `sse-nav-gate` + `sse-stream`):
 * - long-poll ≤ ~25s com flush imediato + fecha em ping|idle (evita 502 e H2 RST)
 * - fetch + abort = canceled limpo (não PROTOCOL_ERROR do EventSource)
 * - um ciclo por endpoint; soft-nav fecha antes do fetch RSC; backoff + circuit
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
