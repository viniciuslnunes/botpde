import type Redis from 'ioredis'
import { isRedisConfigured, getRedisUrl } from '@/lib/env'

/**
 * Cliente Redis para comandos (fila, etc.) — separado do subscriber pub/sub.
 * Lazy; null se REDIS_URL ausente ou conexão falhar.
 */
let commandClient: Redis | null = null
let commandFailed = false
let commandReady: Promise<Redis | null> | null = null

export async function getRedisCommandClient(): Promise<Redis | null> {
  if (!isRedisConfigured() || commandFailed) return null
  if (commandClient) return commandClient
  if (commandReady) return commandReady

  commandReady = (async () => {
    try {
      const RedisCtor = (await import('ioredis')).default
      const client = new RedisCtor(getRedisUrl(), {
        maxRetriesPerRequest: 2,
        enableReadyCheck: true,
        lazyConnect: true,
      })
      client.on('error', (err: Error) => {
        console.warn('[redis-client] error:', err.message)
      })
      await client.connect()
      commandClient = client
      return client
    } catch (err) {
      commandFailed = true
      console.warn(
        '[redis-client] indisponível:',
        err instanceof Error ? err.message : err,
      )
      return null
    } finally {
      commandReady = null
    }
  })()

  return commandReady
}
