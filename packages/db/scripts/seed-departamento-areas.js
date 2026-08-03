/**
 * Seed das áreas de atuação canônicas dentro de cada departamento
 * (`DEPARTAMENTO_AREAS_CANONICAS` em packages/types).
 *
 *   pnpm --filter @torcida/db seed:departamento-areas
 *   TENANT_SLUG=pde-gavioes-fiel pnpm --filter @torcida/db seed:departamento-areas
 *   CONCURRENCY=8 pnpm --filter @torcida/db seed:departamento-areas
 *
 * Sem TENANT_SLUG, semeia todos os tenants ativos. Idempotente e
 * NÃO-DESTRUTIVO: no update só toca descricao/icone/ordem/sazonal — nunca
 * sobrescreve `ativa`/`nome` (a torcida pode ter renomeado/desativado) nem
 * `meta`. Para cada `Departamento` do tenant cujo slug esteja no registry,
 * faz upsert das áreas por unique (departamentoId, slug).
 */
import { PrismaClient } from '@prisma/client'
import { DEPARTAMENTO_AREAS_CANONICAS } from '../../types/src/departamento-areas-canonicas.js'

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

const AREAS_POR_DEPTO_SLUG = new Map(
  DEPARTAMENTO_AREAS_CANONICAS.map((entry) => [entry.deptoSlug, entry.areas]),
)

/**
 * Semeia as áreas canônicas de um tenant. Idempotente por (departamentoId, slug).
 * @param {import('@prisma/client').PrismaClient} client
 * @param {string} tenantId
 * @returns {Promise<{ upserted: number, created: number, updated: number }>}
 */
async function upsertAreasDoTenant(client, tenantId) {
  /** @type {Array<{ id: string, slug: string }>} */
  const departamentos = await client.departamento.findMany({
    where: { tenantId, slug: { in: [...AREAS_POR_DEPTO_SLUG.keys()] } },
    select: { id: true, slug: true },
  })

  let created = 0
  let updated = 0

  for (const departamento of departamentos) {
    const areas = AREAS_POR_DEPTO_SLUG.get(departamento.slug) ?? []
    for (let ordem = 0; ordem < areas.length; ordem += 1) {
      const area = areas[ordem]
      const result = await client.departamentoArea.upsert({
        where: { departamentoId_slug: { departamentoId: departamento.id, slug: area.slug } },
        create: {
          tenantId,
          departamentoId: departamento.id,
          nome: area.nome,
          slug: area.slug,
          descricao: area.descricao,
          icone: area.icone,
          ordem,
          ativa: true,
          sazonal: area.sazonal,
        },
        update: {
          // Nunca sobrescreve `ativa`/`nome`/`meta` — a torcida pode ter customizado.
          descricao: area.descricao,
          icone: area.icone,
          ordem,
          sazonal: area.sazonal,
        },
      })
      if (result.criadoEm.getTime() === result.atualizadoEm.getTime()) created += 1
      else updated += 1
    }
  }

  return { upserted: created + updated, created, updated }
}

async function main() {
  const started = Date.now()
  const tenants = await resolverTenants()
  const verbose = tenants.length === 1
  const concurrency = verbose ? 1 : CONCURRENCY

  console.log(
    verbose
      ? `Seed de áreas de departamento para "${tenants[0].nome}" (${tenants[0].slug})\n`
      : `Seed de áreas de departamento canônicas em ${tenants.length} tenant(s) ativos (concurrency=${concurrency})...\n`,
  )

  let totalCreated = 0
  let totalUpdated = 0
  let falhas = 0

  await mapPool(
    tenants,
    concurrency,
    async (tenant) => {
      try {
        await withRetry(
          async () => {
            const result = await upsertAreasDoTenant(db, tenant.id)
            totalCreated += result.created
            totalUpdated += result.updated
            if (verbose) {
              console.log(`  ✓ ${result.created} área(s) criada(s) · ${result.updated} atualizada(s)`)
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
    `\n${totalCreated} área(s) criada(s) · ${totalUpdated} atualizada(s) em ${tenants.length} tenant(s)` +
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
