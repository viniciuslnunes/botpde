import { AsyncLocalStorage } from 'node:async_hooks'

const store = new AsyncLocalStorage()

/**
 * Métricas de query por request.
 * - Sempre ligadas em desenvolvimento (badge/log local).
 * - Em produção, opt-in via `PERF_METRICS=1` (custo desprezível: um
 *   `performance.now()` por query + uma linha de log por rota). Default OFF —
 *   produção fica idêntica sem a env. Serve para coletar p95 real por rota
 *   (contagem de queries e tempo em banco) nos logs do Railway.
 */
export function metricsEnabled() {
  return process.env.NODE_ENV === 'development' || process.env.PERF_METRICS === '1'
}

function getStore() {
  let current = store.getStore()
  if (!current) {
    current = { count: 0, dbMs: 0 }
    store.enterWith(current)
  }
  return current
}

/** Zera os contadores no início de cada request. */
export function resetPrismaQueryCount() {
  if (!metricsEnabled()) return
  const s = getStore()
  s.count = 0
  s.dbMs = 0
}

/** Incrementa após cada operação Prisma. */
export function incrementPrismaQueryCount() {
  if (!metricsEnabled()) return
  getStore().count += 1
}

/** Acumula o tempo (ms) gasto numa operação Prisma. */
export function addPrismaQueryTime(ms) {
  if (!metricsEnabled()) return
  getStore().dbMs += ms
}

/** Lê e zera só a contagem do request atual (compat legado). */
export function getAndResetPrismaQueryCount() {
  if (!metricsEnabled()) return 0
  const current = getStore()
  const count = current.count
  current.count = 0
  current.dbMs = 0
  return count
}

/** Lê e zera contagem + tempo de banco do request atual. */
export function getAndResetPrismaMetrics() {
  if (!metricsEnabled()) return { count: 0, dbMs: 0 }
  const current = getStore()
  const metrics = { count: current.count, dbMs: current.dbMs }
  current.count = 0
  current.dbMs = 0
  return metrics
}
