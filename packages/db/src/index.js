import { PrismaClient } from '@prisma/client'
import {
  incrementPrismaQueryCount,
  addPrismaQueryTime,
  resetPrismaQueryCount,
  getAndResetPrismaQueryCount,
  getAndResetPrismaMetrics,
  metricsEnabled,
} from './query-metrics.js'

export {
  resetPrismaQueryCount,
  getAndResetPrismaQueryCount,
  getAndResetPrismaMetrics,
  metricsEnabled,
}

const WEB_CONNECTION_LIMIT = 5
// Timeouts tolerantes a blips do proxy Railway (mesmos parâmetros do
// seed-departamentos.js). Só entram se a URL ainda não os definir.
const WEB_URL_PARAMS = {
  connection_limit: String(WEB_CONNECTION_LIMIT),
  connect_timeout: '15',
  pool_timeout: '20',
}

function resolveDatabaseUrl() {
  const url = process.env.DATABASE_URL ?? ''
  if (!url) return url
  const faltantes = Object.entries(WEB_URL_PARAMS)
    .filter(([key]) => !new RegExp(`[?&]${key}=`, 'i').test(url))
    .map(([key, value]) => `${key}=${value}`)
  if (faltantes.length === 0) return url
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}${faltantes.join('&')}`
}

// ── Resiliência de conexão ────────────────────────────────────────────────────
// Postgres/proxy pode fechar conexões ociosas; o pool do Prisma só descobre ao
// usar o socket morto, lançando P1017 ("Server has closed the connection") no
// primeiro request após o período ocioso. Como a conexão morta é descartada,
// uma nova tentativa pega uma conexão fresca e passa. Só reexecutamos LEITURAS
// (idempotentes) — nunca escritas/transações, para evitar dupla aplicação.
const CONN_LOST_CODES = new Set(['P1001', 'P1002', 'P1017'])
const CONN_LOST_MESSAGE =
  /Server has closed the connection|Can't reach database server|Connection reset|Timed out fetching a new connection/i
const READ_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
])

function isConnectionLost(err) {
  if (!err) return false
  if (err.code && CONN_LOST_CODES.has(err.code)) return true
  return typeof err.message === 'string' && CONN_LOST_MESSAGE.test(err.message)
}

async function runWithRetry(exec, retryable, attempts = 3) {
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try {
      return await exec()
    } catch (err) {
      lastErr = err
      if (!retryable || i === attempts - 1 || !isConnectionLost(err)) throw err
      await new Promise((resolve) => setTimeout(resolve, 50 * (i + 1)))
    }
  }
  throw lastErr
}

// ── Cliente compartilhado (banco principal da plataforma) ─────────────────────
const globalForPrisma = globalThis

function createPrismaClient() {
  const datasourceUrl = resolveDatabaseUrl()
  const base = new PrismaClient({
    ...(datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : {}),
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

  return base.$extends({
    query: {
      async $allOperations({ operation, args, query }) {
        const retryable = READ_OPERATIONS.has(operation)
        // Sem métricas (produção sem PERF_METRICS): só a camada de resiliência.
        if (!metricsEnabled()) {
          return runWithRetry(() => query(args), retryable)
        }
        incrementPrismaQueryCount()
        const start = performance.now()
        try {
          return await runWithRetry(() => query(args), retryable)
        } finally {
          addPrismaQueryTime(performance.now() - start)
        }
      },
    },
  })
}

export const db =
  globalForPrisma.prisma ??
  createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// ── Cache de clientes por tenant (banco próprio por torcida) ──────────────────
const tenantClients = new Map()

/**
 * Retorna o cliente Prisma correto para o tenant.
 *
 * - Se o tenant tem `databaseUrl` própria → usa um cliente isolado para aquele banco
 * - Se não tem → usa o banco compartilhado da plataforma
 *
 * Isso permite que cada torcida tenha seu próprio banco PostgreSQL quando necessário,
 * mantendo total isolamento de dados — mesmo sem Row-Level Security.
 *
 * @param {{ id: string, databaseUrl?: string | null }} tenant
 * @returns {PrismaClient}
 */
export function getDbForTenant(tenant) {
  // Sem banco próprio: usa o compartilhado
  if (!tenant?.databaseUrl) {
    return db
  }

  // Cache por tenant para não criar uma nova conexão a cada request
  if (tenantClients.has(tenant.id)) {
    return tenantClients.get(tenant.id)
  }

  const client = new PrismaClient({
    datasources: { db: { url: tenant.databaseUrl } },
    log: ['error'],
  }).$extends({
    query: {
      async $allOperations({ operation, args, query }) {
        return runWithRetry(() => query(args), READ_OPERATIONS.has(operation))
      },
    },
  })

  tenantClients.set(tenant.id, client)
  return client
}

/**
 * Encerra todas as conexões de bancos de tenants.
 * Chamar no shutdown da aplicação.
 */
export async function disconnectAll() {
  await db.$disconnect()
  for (const client of tenantClients.values()) {
    await client.$disconnect()
  }
  tenantClients.clear()
}

export * from '@prisma/client'
export {
  normalizeNome,
  chaveMatch,
  chaveGrupoClube,
  saoMesmoClube,
  indiceAfiliacaoCanonica,
} from './data/afiliacoes-normalize.js'
export {
  DEPARTAMENTOS_CANONICOS,
  DEPARTAMENTOS_CANONICOS_SLUGS,
  DEPARTAMENTOS_SLUGS_LEGADOS,
  isDepartamentoCanonico,
  upsertDepartamentosCanonicos,
  upsertPerfisDepartamentoCanonicos,
  syncMembershipFromRoles,
  bootstrapAcessoTenant,
} from './departamentos-canonicos.js'

export { calcularMenorValorEstimadosConhecido } from './data/torcedores-estimados.js'

export { withDbRetry } from './with-db-retry.js'
