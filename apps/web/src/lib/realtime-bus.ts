import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import type Redis from 'ioredis'
import { isRedisConfigured, getRedisUrl } from '@/lib/env'

const CHANNEL_PREFIX = 'torcida:bus:'
/** Identifica esta réplica para ignorar eco do próprio PUBLISH. */
const INSTANCE_ID = randomUUID()

/**
 * Bridge pub/sub para SSE multi-instância.
 *
 * - Sem REDIS_URL → EventEmitter local (1 réplica Railway, comportamento atual).
 * - Com REDIS_URL (Upstash Free / Redis protocol) → publish/subscribe cruzando
 *   réplicas. Ping só (payload = instance id) — barato no free tier (500k cmds/mês).
 *
 * Padrão LiveKit: opcional; ausência não quebra o app.
 */
const localBus = new EventEmitter()
localBus.setMaxListeners(0)

let publisher: Redis | null = null
let subscriber: Redis | null = null
let bridgeReady: Promise<void> | null = null
let redisFailed = false
const subscribedRedisChannels = new Set<string>()

function redisChannel(logicalKey: string): string {
  return `${CHANNEL_PREFIX}${logicalKey}`
}

function logicalFromRedis(redisKey: string): string | null {
  if (!redisKey.startsWith(CHANNEL_PREFIX)) return null
  return redisKey.slice(CHANNEL_PREFIX.length)
}

async function createRedisClient(role: 'publisher' | 'subscriber'): Promise<Redis | null> {
  if (!isRedisConfigured() || redisFailed) return null

  try {
    const RedisCtor = (await import('ioredis')).default
    const client = new RedisCtor(getRedisUrl(), {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: true,
    })

    client.on('error', (err: Error) => {
      console.warn(`[realtime-bus] Redis ${role} error:`, err.message)
    })

    await client.connect()
    return client
  } catch (err) {
    redisFailed = true
    console.warn(
      '[realtime-bus] Redis indisponível — fallback in-memory:',
      err instanceof Error ? err.message : err,
    )
    return null
  }
}

async function ensureBridge(): Promise<void> {
  if (!isRedisConfigured() || redisFailed) return
  if (bridgeReady) return bridgeReady

  bridgeReady = (async () => {
    publisher = await createRedisClient('publisher')
    if (!publisher) return

    subscriber = await createRedisClient('subscriber')
    if (!subscriber) {
      await publisher.quit().catch(() => undefined)
      publisher = null
      return
    }

    subscriber.on('message', (channel: string, payload: string) => {
      // Eco da própria réplica já foi emitido localmente no publish.
      if (payload === INSTANCE_ID) return
      const logical = logicalFromRedis(channel)
      if (logical) localBus.emit(logical)
    })
  })()

  return bridgeReady
}

/**
 * Publica ping no canal lógico.
 * Sempre emite local (SSE nesta réplica); com Redis também PUBLISH para as outras.
 */
export function publishRealtime(logicalKey: string): void {
  localBus.emit(logicalKey)

  if (!isRedisConfigured() || redisFailed) return

  void (async () => {
    await ensureBridge()
    if (!publisher) return
    try {
      await publisher.publish(redisChannel(logicalKey), INSTANCE_ID)
    } catch (err) {
      console.warn(
        '[realtime-bus] publish falhou (local já notificado):',
        err instanceof Error ? err.message : err,
      )
    }
  })()
}

/**
 * Inscreve listener no canal lógico. Retorna unsubscribe.
 * Garante SUBSCRIBE Redis no canal correspondente quando configurado.
 */
export function subscribeRealtime(logicalKey: string, onPing: () => void): () => void {
  localBus.on(logicalKey, onPing)

  if (isRedisConfigured() && !redisFailed) {
    void (async () => {
      await ensureBridge()
      if (!subscriber) return
      const channel = redisChannel(logicalKey)
      if (subscribedRedisChannels.has(channel)) return
      try {
        await subscriber.subscribe(channel)
        subscribedRedisChannels.add(channel)
      } catch (err) {
        console.warn(
          '[realtime-bus] subscribe falhou:',
          err instanceof Error ? err.message : err,
        )
      }
    })()
  }

  return () => {
    localBus.off(logicalKey, onPing)
  }
}

/** Helpers de canal — exportados para testes. */
export function feedBusKey(tenantId: string): string {
  return `feed:${tenantId}`
}

/** Ping SSE do feed Descobrir/Seguindo da Comunidade Nacional (por afiliação). */
export function feedNacionalBusKey(afiliacaoId: string): string {
  return `feed-nacional:${afiliacaoId}`
}

export function notificacaoBusKey(tenantId: string, userId: string): string {
  return `notif:${tenantId}:${userId}`
}

/** Ping cross-tenant — sino do super-admin assina isto, não um tenant do host. */
export function notificacaoUserBusKey(userId: string): string {
  return `notif-user:${userId}`
}

export function isRealtimeRedisActive(): boolean {
  return isRedisConfigured() && !redisFailed
}
