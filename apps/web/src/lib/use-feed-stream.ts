'use client'

import { useServerSentPing } from '@/lib/use-server-sent-ping'

/**
 * Ping SSE do feed da Comunidade: dispara a cada post novo no tenant. Quem
 * consome (FeedLiveBanner) só conta os pings — a lista continua SSR.
 */
export function useFeedStream(onPing: () => void): void {
  useServerSentPing('/api/comunidade/feed/stream', onPing)
}
