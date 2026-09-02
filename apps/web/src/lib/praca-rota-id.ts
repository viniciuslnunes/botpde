/**
 * Next.js 16 cola `?query` no último segmento quando o param tem `:` —
 * o tree fica `noticias-demo:gavioes:assembleia?escopo=torcida` e o
 * findUnique não acha o artigo.
 */
export function idDeRotaPraca(raw: string): string {
  const cortado = (raw.split(/[?#]/)[0] ?? raw).trim()
  try {
    return decodeURIComponent(cortado)
  } catch {
    return cortado
  }
}

/**
 * IDs de seed antigos usavam `:` (`noticias-demo:gavioes:assembleia`);
 * os novos usam `-` porque o App Router 404a no dois-pontos. Tenta os dois.
 */
export function idsCandidatosRotaPraca(raw: string): string[] {
  const id = idDeRotaPraca(raw)
  if (!id.includes(':')) return [id]
  const hifen = id.replaceAll(':', '-')
  return hifen === id ? [id] : [id, hifen]
}
