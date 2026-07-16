'use client'

import { useEffect, useRef } from 'react'

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
    const source = new EventSource(endpoint)
    source.onmessage = () => onPingRef.current()
    return () => source.close()
  }, [endpoint, enabled])
}
