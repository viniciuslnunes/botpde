/**
 * Helpers para montar filtros Prisma sem `{ in: [] }` — o client rejeita arrays
 * vazios no operador `in` e derruba Server Components / APIs com 500.
 */

/** Retorna `{ in: values }` ou `undefined` quando a lista está vazia. */
export function prismaIn<T>(values: readonly T[]): { in: T[] } | undefined {
  return values.length > 0 ? { in: [...values] } : undefined
}

/** Ramo `OR` com `tenantId in` — `null` quando não há ids. */
export function orTenantIdsIn(
  tenantIds: readonly string[],
): { tenantId: { in: string[] } } | null {
  const filtro = prismaIn(tenantIds)
  return filtro ? { tenantId: filtro } : null
}

/** Remove ramos falsy de um `OR` Prisma. */
export function compactOr<T>(branches: Array<T | null | undefined | false>): T[] {
  return branches.filter((b): b is T => Boolean(b))
}
