import {
  feedBusKey,
  feedNacionalBusKey,
  publishRealtime,
  subscribeRealtime,
} from '@/lib/realtime-bus'

/**
 * Bus de push do feed da Comunidade.
 *
 * Sem REDIS_URL: EventEmitter in-memory (1 réplica).
 * Com REDIS_URL (Upstash Free): pub/sub cruzando réplicas Railway.
 * Ver `docs/data/modulo-comunidade-performance.md` (Fase D1).
 */
export function emitFeedPing(tenantId: string): void {
  publishRealtime(feedBusKey(tenantId))
}

export function subscribeFeedPing(tenantId: string, onPing: () => void): () => void {
  return subscribeRealtime(feedBusKey(tenantId), onPing)
}

export function emitFeedNacionalPing(afiliacaoId: string): void {
  publishRealtime(feedNacionalBusKey(afiliacaoId))
}

export function subscribeFeedNacionalPing(afiliacaoId: string, onPing: () => void): () => void {
  return subscribeRealtime(feedNacionalBusKey(afiliacaoId), onPing)
}
