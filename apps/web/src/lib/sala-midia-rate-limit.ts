const WINDOW_MS = 60 * 1000
const MAX_PER_WINDOW = 20

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

/** Rate limit para aprovações/revogações de mídia por anfitrião. */
export function excedeuLimiteMidiaSala(hostId: string): boolean {
  const now = Date.now()
  const bucket = buckets.get(hostId)
  if (!bucket) return false
  if (bucket.resetAt <= now) {
    buckets.delete(hostId)
    return false
  }
  return bucket.count >= MAX_PER_WINDOW
}

export function registrarAcaoMidiaSala(hostId: string): void {
  const now = Date.now()
  const bucket = buckets.get(hostId)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(hostId, { count: 1, resetAt: now + WINDOW_MS })
    return
  }
  bucket.count += 1
}
