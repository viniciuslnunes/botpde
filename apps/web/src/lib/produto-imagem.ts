/** Extrai URL direta do asset quando veio do wrapper Cloudflare cdn-cgi. */
export function normalizeProdutoSourceUrl(url: string): string {
  const cdn = url.match(/cdn-cgi\/image\/[^/]+\/(https:\/\/[^?\s"']+)/i)
  if (cdn?.[1]) return cdn[1]

  const jet = url.match(/https:\/\/gavioes\.jetassets\.com\.br\/(?:produto(?:\/multifotos)?\/[^\s"']+)/i)
  if (jet?.[0]) return jet[0]

  return url
}

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
    return trimmed.startsWith('http') ? normalizeProdutoSourceUrl(trimmed) : trimmed
  }

  // Formato legado do bot: base64 bruto sem prefixo data:
  if (/^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length > 100) {
    return `data:image/jpeg;base64,${trimmed}`
  }

  return trimmed
}

/** Retorna a primeira URL de imagem válida do array. */
export function firstProdutoImagemUrl(imagensUrl: string[] | undefined | null): string | null {
  return resolveProdutoImagens(imagensUrl)[0] ?? null
}

/** Normaliza todas as URLs válidas do produto (frente, verso, etc.). */
export function resolveProdutoImagens(imagensUrl: string[] | undefined | null): string[] {
  if (!imagensUrl?.length) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of imagensUrl) {
    const resolved = resolveProdutoImagemUrl(raw)
    if (resolved && !seen.has(resolved)) {
      seen.add(resolved)
      out.push(resolved)
    }
  }
  return out
}

/** Rótulos amigáveis para posição na galeria. */
export function rotuloImagemProduto(index: number, total: number): string {
  if (total <= 1) return 'Produto'
  if (index === 0) return 'Frente'
  if (index === 1) return 'Verso'
  return `Foto ${index + 1}`
}
