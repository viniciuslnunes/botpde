const WINDOW_MS = 60 * 1000
const MAX_REQUESTS = 20

interface RequestBucket {
  total: number
  resetAt: number
}

const requestBuckets = new Map<string, RequestBucket>()

export function excedeuLimiteIngest(chave: string): boolean {
  const bucket = requestBuckets.get(chave)
  const now = Date.now()
  if (!bucket) return false
  if (bucket.resetAt <= now) {
    requestBuckets.delete(chave)
    return false
  }
  return bucket.total >= MAX_REQUESTS
}

export function registrarTentativaIngest(chave: string): void {
  const now = Date.now()
  const bucket = requestBuckets.get(chave)
  if (!bucket || bucket.resetAt <= now) {
    requestBuckets.set(chave, { total: 1, resetAt: now + WINDOW_MS })
    return
  }
  bucket.total += 1
}
