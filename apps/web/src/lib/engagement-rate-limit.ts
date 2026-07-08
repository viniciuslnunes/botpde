const WINDOW_MS = 60 * 1000
const MAX_PER_WINDOW = 15

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

export function excedeuLimiteEngajamento(key: string): boolean {
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket) return false
  if (bucket.resetAt <= now) {
    buckets.delete(key)
    return false
  }
  return bucket.count >= MAX_PER_WINDOW
}

export function registrarAcaoEngajamento(key: string): void {
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return
  }
  bucket.count += 1
}
