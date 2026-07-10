import { AsyncLocalStorage } from 'node:async_hooks'

const store = new AsyncLocalStorage()

function getStore() {
  let current = store.getStore()
  if (!current) {
    current = { count: 0 }
    store.enterWith(current)
  }
  return current
}

/** Zera o contador no início de cada request (dev). */
export function resetPrismaQueryCount() {
  if (process.env.NODE_ENV !== 'development') return
  getStore().count = 0
}

/** Incrementa após cada operação Prisma (dev). */
export function incrementPrismaQueryCount() {
  if (process.env.NODE_ENV !== 'development') return
  getStore().count += 1
}

/** Lê e zera o contador do request atual (dev). */
export function getAndResetPrismaQueryCount() {
  if (process.env.NODE_ENV !== 'development') return 0
  const current = getStore()
  const count = current.count
  current.count = 0
  return count
}
