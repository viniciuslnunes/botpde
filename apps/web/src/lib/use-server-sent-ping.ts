'use client'

import { useEffect, useRef } from 'react'

/**
 * Transporte SSE puro: abre `endpoint` com EventSource e chama `onPing` a cada
 * evento. Não interpreta payload — quem consome decide o que refazer/mostrar.
 */
export function useServerSentPing(endpoint: string, onPing: () => void): void {
  const onPingRef = useRef(onPing)
  useEffect(() => {
    onPingRef.current = onPing
  }, [onPing])

  useEffect(() => {
    const source = new EventSource(endpoint)
    source.onmessage = () => onPingRef.current()
    return () => source.close()
  }, [endpoint])
}
