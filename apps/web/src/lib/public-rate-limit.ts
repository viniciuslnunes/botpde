/**
 * Rate limit em memória para endpoints públicos (cadastro / checagem de @).
 * Mesmo trade-off do login (ARCHITECTURE §29): 1 instância Railway.
 */

export type PublicRateScope = 'nicknameCheck' | 'nicknameSuggest' | 'criarConta'

const POLICIES: Record<PublicRateScope, { windowMs: number; max: number }> = {
  /** Debounce na UI ~350ms — 40/min cobre digitação humana; trava scraper. */
  nicknameCheck: { windowMs: 60_000, max: 40 },
  /** Sugestão faz várias queries — teto mais baixo. */
  nicknameSuggest: { windowMs: 60_000, max: 15 },
  /** Criação de conta por IP. */
  criarConta: { windowMs: 60 * 60_000, max: 5 },
}

interface Bucket {
  count: number
  resetAt: number
}

const stores = new Map<PublicRateScope, Map<string, Bucket>>()

function store(scope: PublicRateScope): Map<string, Bucket> {
  let map = stores.get(scope)
  if (!map) {
    map = new Map()
    stores.set(scope, map)
  }
  return map
}

function chaveNormalizada(key: string): string {
  return key.trim().toLowerCase() || 'unknown'
}

export function excedeuLimitePublico(scope: PublicRateScope, key: string): boolean {
  const { max } = POLICIES[scope]
  const map = store(scope)
  const k = chaveNormalizada(key)
  const bucket = map.get(k)
  const now = Date.now()
  if (!bucket) return false
  if (bucket.resetAt <= now) {
    map.delete(k)
    return false
  }
  return bucket.count >= max
}

export function registrarUsoPublico(scope: PublicRateScope, key: string): void {
  const { windowMs } = POLICIES[scope]
  const map = store(scope)
  const k = chaveNormalizada(key)
  const now = Date.now()
  const bucket = map.get(k)
  if (!bucket || bucket.resetAt <= now) {
    map.set(k, { count: 1, resetAt: now + windowMs })
    return
  }
  bucket.count += 1
}

/** Extrai IP do request (Railway / proxy). */
export function clientIpFromHeaders(headers: Headers): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip')?.trim() ||
    'unknown'
  )
}
