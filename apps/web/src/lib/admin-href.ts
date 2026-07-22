/** Monta href de página admin com query string, omitindo params vazios/undefined. */
export function buildAdminHref(
  basePath: string,
  params: Record<string, string | number | undefined>,
): string {
  const search = new URLSearchParams()
  for (const [chave, valor] of Object.entries(params)) {
    if (valor === undefined || valor === '') continue
    search.set(chave, String(valor))
  }
  const qs = search.toString()
  return qs ? `${basePath}?${qs}` : basePath
}
