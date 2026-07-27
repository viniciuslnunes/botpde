export type SortDir = 'asc' | 'desc'

/** Aceita só colunas conhecidas; fallback seguro. */
export function parseSortParam(
  raw: string | undefined,
  allowed: readonly string[],
  fallback: string,
): string {
  if (raw && allowed.includes(raw)) return raw
  return fallback
}

export function parseDirParam(
  raw: string | undefined,
  fallback: SortDir = 'asc',
): SortDir {
  if (raw === 'asc' || raw === 'desc') return raw
  return fallback
}

/**
 * Próxima direção ao clicar no cabeçalho.
 * Coluna nova → `defaultDir`; coluna ativa → inverte.
 */
export function nextSortDir(
  column: string,
  currentSort: string,
  currentDir: SortDir,
  defaultDir: SortDir = 'asc',
): SortDir {
  if (column !== currentSort) return defaultDir
  return currentDir === 'asc' ? 'desc' : 'asc'
}
