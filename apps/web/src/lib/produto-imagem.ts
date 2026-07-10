/** Normaliza URLs de imagem de produto para uso em `<img src>`. */
export function resolveProdutoImagemUrl(raw: string | undefined | null): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('/')
  ) {
    return trimmed
  }

  // Formato legado do bot: base64 bruto sem prefixo data:
  if (/^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length > 100) {
    return `data:image/jpeg;base64,${trimmed}`
  }

  return trimmed
}

/** Retorna a primeira URL de imagem válida do array. */
export function firstProdutoImagemUrl(imagensUrl: string[] | undefined | null): string | null {
  if (!imagensUrl?.length) return null
  for (const url of imagensUrl) {
    const resolved = resolveProdutoImagemUrl(url)
    if (resolved) return resolved
  }
  return null
}
