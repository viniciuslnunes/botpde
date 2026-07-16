/**
 * Seed da lista canônica de departamentos de uma torcida.
 *
 *   pnpm --filter @torcida/db seed:departamentos
 *   TENANT_SLUG=pde-gavioes-fiel pnpm --filter @torcida/db seed:departamentos
 *   CONCURRENCY=8 pnpm --filter @torcida/db seed:departamentos
 *
 * Sem TENANT_SLUG, semeia todos os tenants ativos. Idempotente.
 * Processa vários tenants em paralelo (CONCURRENCY, default 6) e retenta
 * erros de conexão do proxy Railway.
 */
import { PrismaClient } from '@prisma/client'
import { upsertDepartamentosCanonicos, upsertPerfisDepartamentoCanonicos } from '../src/departamentos-canonicos.js'

const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY) || 6)
const SEED_CONNECTION_LIMIT = Math.max(CONCURRENCY + 2, 8)

/**
 * @param {string} url
 * @param {number} limit
 */
function withConnectionLimit(url, limit) {
  if (!url) return url
  try {
    const u = new URL(url)
    u.searchParams.set('connection_limit', String(limit))
    u.searchParams.set('pool_timeout', '30')
    u.searchParams.set('connect_timeout', '30')
    return u.toString()
  } catch {
    const stripped = url.replace(/([?&])connection_limit=\d+/gi, '$1').replace(/[?&]$/, '')
    const sep = stripped.includes('?') ? '&' : '?'
    return `${stripped}${sep}connection_limit=${limit}&pool_timeout=30&connect_timeout=30`
  }
}

const datasourceUrl = withConnectionLimit(process.env.DATABASE_URL ?? '', SEED_CONNECTION_LIMIT)
const db = new PrismaClient(
  datasourceUrl
    ? { datasources: { db: { url: datasourceUrl } } }
    : undefined,
)

/**
 * @param {unknown} error
 */
function isConnectionError(error) {
  const msg = error instanceof Error ? error.message : String(error)
  return /Server has closed the connection|Can't reach database|Connection reset|ECONNRESET|ECONNREFUSED|timed out|P1001|P1017|P2024/i.test(
    msg,
  )
}

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{ label: string, retries?: number }} opts
 * @returns {Promise<T>}
 */
async function withRetry(fn, { label, retries = 3 }) {
  let lastError = /** @type {unknown} */ (undefined)
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (!isConnectionError(error) || attempt === retries) throw error
      const waitMs = 400 * attempt
      console.warn(
        `  · ${label}: conexão caiu — reconectando (${attempt}/${retries - 1}, ${waitMs}ms)…`,
      )
      await db.$disconnect().catch(() => {})
      await new Promise((r) => setTimeout(r, waitMs))
      await db.$connect()
    }
  }
  throw lastError
}

/**
 * @template T, R
 * @param {T[]} items
 * @param {number} concurrency
 * @param {(item: T, index: number) => Promise<R>} worker
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<R[]>}
 */
async function mapPool(items, concurrency, worker, onProgress) {
  const results = /** @type {R[]} */ (new Array(items.length))
  let next = 0
  let done = 0

  async function run() {
    while (true) {
      const i = next
      next += 1
      if (i >= items.length) return
      results[i] = await worker(items[i], i)
      done += 1
      onProgress?.(done, items.length)
    }
  }

  const workers = Math.min(concurrency, items.length)
  await Promise.all(Array.from({ length: workers }, () => run()))
  return results
}

async function resolverTenants() {
  const slug = process.env.TENANT_SLUG
  if (slug) {
    const tenant = await db.tenant.findUnique({
      where: { slug },
      select: { id: true, nome: true, slug: true },
    })
    if (!tenant) throw new Error(`Tenant não encontrado para TENANT_SLUG="${slug}"`)
    return [tenant]
  }
  /** @type {Array<{ id: string, nome: string, slug: string }>} */
  const tenants = await db.tenant.findMany({
    where: { ativo: true },
    orderBy: { criadoEm: 'asc' },
    select: { id: true, nome: true, slug: true },
  })
  if (tenants.length === 0) throw new Error('Nenhum tenant ativo encontrado — informe TENANT_SLUG')
  return tenants
}

async function main() {
  const started = Date.now()
  const tenants = await resolverTenants()
  const verbose = tenants.length === 1
  const concurrency = verbose ? 1 : CONCURRENCY

  console.log(
    verbose
      ? `Seed de departamentos para "${tenants[0].nome}" (${tenants[0].slug})\n`
      : `Seed de departamentos canônicos em ${tenants.length} tenant(s) ativos (concurrency=${concurrency})...\n`,
  )

  /** @type {Set<string>} */
  const sedeTenantIds = new Set()
  if (tenants.length > 0) {
    const sedes = await db.sede.findMany({
      where: {
        tipo: 'SEDE',
        tenantId: { in: tenants.map((t) => t.id) },
      },
      select: { tenantId: true },
    })
    for (const s of sedes) sedeTenantIds.add(s.tenantId)
  }

  let removedLegacy = 0
  let falhas = 0

  await mapPool(
    tenants,
    concurrency,
    async (tenant) => {
      try {
        await withRetry(
          async () => {
            const result = await upsertDepartamentosCanonicos(db, tenant.id, { concurrent: true })
            const perfis = await upsertPerfisDepartamentoCanonicos(db, tenant.id, {
              incluirVice: sedeTenantIds.has(tenant.id),
              concurrent: true,
            })
            removedLegacy += result.removedLegacy
            if (verbose) {
              console.log(`  ✓ ${result.upserted} departamentos sincronizados`)
              console.log(`  ✓ ${perfis.perfisArea} perfis de área · ${perfis.systemUpserted} sistema`)
              if (result.removedLegacy > 0) {
                console.log(`  · removidos ${result.removedLegacy} legado(s) socio/torcedor`)
              }
            }
          },
          { label: tenant.slug },
        )
      } catch (error) {
        falhas += 1
        const msg = error instanceof Error ? error.message : String(error)
        console.error(`  ✗ ${tenant.slug}: ${msg}`)
        if (verbose) throw error
      }
    },
    (done, total) => {
      if (!verbose && (done % 50 === 0 || done === total)) {
        const elapsed = ((Date.now() - started) / 1000).toFixed(0)
        console.log(`  … ${done}/${total} (${elapsed}s)`)
      }
    },
  )

  const elapsedSec = ((Date.now() - started) / 1000).toFixed(1)
  console.log(
    `\n10 departamentos × ${tenants.length} tenant(s) sincronizados` +
      (removedLegacy > 0 ? ` (${removedLegacy} legado(s) removidos)` : '') +
      (falhas > 0 ? ` — ${falhas} falha(s)` : '') +
      ` em ${elapsedSec}s.`,
  )
  if (falhas > 0) process.exitCode = 1
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
