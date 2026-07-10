import { PrismaClient } from '@prisma/client'
import {
  incrementPrismaQueryCount,
  resetPrismaQueryCount,
  getAndResetPrismaQueryCount,
} from './query-metrics.js'

export { resetPrismaQueryCount, getAndResetPrismaQueryCount }

// ── Cliente compartilhado (banco principal da plataforma) ─────────────────────
const globalForPrisma = globalThis

function createPrismaClient() {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

  if (process.env.NODE_ENV !== 'development') {
    return base
  }

  return base.$extends({
    query: {
      async $allOperations({ args, query }) {
        incrementPrismaQueryCount()
        return query(args)
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
