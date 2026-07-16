import { notificacaoBusKey, publishRealtime, subscribeRealtime } from '@/lib/realtime-bus'

/**
 * Bus de pings de notificação (SSE).
 *
 * Sem REDIS_URL: EventEmitter in-memory (1 réplica).
 * Com REDIS_URL (Upstash Free): pub/sub cruzando réplicas Railway.
 * O polling da navbar continua como fallback de UX.
 */
export function emitNotificacaoPing(tenantId: string, userId: string): void {
  publishRealtime(notificacaoBusKey(tenantId, userId))
}

export function subscribeNotificacaoPing(
  tenantId: string,
  userId: string,
  onPing: () => void,
): () => void {
  return subscribeRealtime(notificacaoBusKey(tenantId, userId), onPing)
}
