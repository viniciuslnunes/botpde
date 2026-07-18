'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ensureSseNavGateInstalled,
  isSsePausedForNav,
  subscribeSseNavGate,
} from '@/lib/sse-nav-gate'
import { subscribeSharedSse } from '@/lib/sse-shared-source'

/**
 * Railway/Fastly + HTTP/2: EventSource + RST do proxy vira ERR_HTTP2_PROTOCOL_ERROR
 * e pode envenenar soft-nav do App Router.
 *
 * Mitigações (`sse-shared-source` + `sse-nav-gate` + `sse-stream`):
 * - fetch+stream (abort = canceled, não PROTOCOL_ERROR do EventSource)
 * - um stream por endpoint; vida ~12 min (cap Railway 15 min), não ~20s
 * - soft-nav fecha o stream antes do fetch RSC; backoff + circuit breaker
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
