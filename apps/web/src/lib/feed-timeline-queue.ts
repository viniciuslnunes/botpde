import { getRedisCommandClient } from '@/lib/redis-client'
import { isRedisConfigured } from '@/lib/env'
import { fanoutSeguidoresPostParaRede } from '@/lib/feed-timeline'
import { emitFeedPing } from '@/lib/feed-bus'

const QUEUE_KEY = 'torcida:queue:fanout-timeline'

export type FanoutJob = {
  postId: string
  autorId: string
  tenantId: string
  /** ISO string — JSON-safe */
  criadoEm: string
}

const localQueue: FanoutJob[] = []
let localDraining = false
let redisWorkerStarted = false

function toJob(seed: {
  postId: string
  autorId: string
  tenantId: string
  criadoEm: Date
}): FanoutJob {
  return {
    postId: seed.postId,
    autorId: seed.autorId,
    tenantId: seed.tenantId,
    criadoEm: seed.criadoEm.toISOString(),
  }
}

async function processJob(job: FanoutJob): Promise<void> {
  try {
    await fanoutSeguidoresPostParaRede({
      postId: job.postId,
      autorId: job.autorId,
      criadoEm: new Date(job.criadoEm),
    })
  } finally {
    // Ping só depois do fan-out: "Seguindo" já tem a linha na timeline.
    if (job.tenantId) emitFeedPing(job.tenantId)
  }
}

async function drainLocalQueue(): Promise<void> {
  if (localDraining) return
  localDraining = true
  try {
    while (localQueue.length > 0) {
      const job = localQueue.shift()
      if (!job) break
      try {
        await processJob(job)
      } catch (err) {
        console.error('[fanout-queue] job local falhou:', err)
      }
    }
  } finally {
    localDraining = false
  }
}

async function startRedisWorker(): Promise<void> {
  if (redisWorkerStarted || !isRedisConfigured()) return
  redisWorkerStarted = true

  const redis = await getRedisCommandClient()
  if (!redis) {
    redisWorkerStarted = false
    return
  }

  void (async () => {
    while (true) {
      try {
        // BRPOP bloqueia até 5s — libera o event loop entre ciclos.
        const popped: [string, string] | null = await redis.brpop(QUEUE_KEY, 5)
        if (!popped) continue
        const raw = popped[1]
        const job = JSON.parse(raw) as FanoutJob
        await processJob(job)
      } catch (err) {
        console.error('[fanout-queue] worker Redis:', err)
        await new Promise((r) => setTimeout(r, 2000))
      }
    }
  })()
}

/**
 * Enfileira fan-out da timeline — não bloqueia a Server Action / route.
 * Com REDIS_URL: lista Redis (várias réplicas podem consumir via BRPOP).
 * Sem Redis: fila in-process no mesmo Node.
 * Após cada job: `emitFeedPing` (SSE) para o tenant.
 */
export function scheduleFanoutPostParaRede(seed: {
  postId: string
  autorId: string
  tenantId: string
  criadoEm: Date
}): void {
  const job = toJob(seed)

  if (!isRedisConfigured()) {
    localQueue.push(job)
    void drainLocalQueue()
    return
  }

  void (async () => {
    await startRedisWorker()
    const redis = await getRedisCommandClient()
    if (!redis) {
      localQueue.push(job)
      void drainLocalQueue()
      return
    }
    try {
      await redis.lpush(QUEUE_KEY, JSON.stringify(job))
    } catch (err) {
      console.warn('[fanout-queue] LPUSH falhou — fallback local:', err)
      localQueue.push(job)
      void drainLocalQueue()
    }
  })()
}
