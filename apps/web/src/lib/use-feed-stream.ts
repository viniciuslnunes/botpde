'use client'

import { useServerSentPing } from '@/lib/use-server-sent-ping'

/**
 * Ping SSE do feed da Comunidade: dispara após fan-out da timeline (fila).
 * Quem consome refetcha o topo se estiver perto do scroll top.
 */
export function useFeedStream(onPing: () => void): void {
  useServerSentPing('/api/comunidade/feed/stream', onPing)
}
