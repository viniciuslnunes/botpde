/**
 * Regras puras da nav lateral da Comunidade (ativo / path de feed).
 * Sem React — testável sem NextAuth.
 */

const CANAL_DETALHE_RE = /^\/portal\/comunidade\/canais\/[^/]+\/?$/
const CANAIS_LISTAGEM = '/portal/comunidade/canais'

/** Mural principal ou mural de um canal (`/canais/[id]`). */
export function isComunidadeFeedPath(pathname: string): boolean {
  return pathname === '/portal/comunidade' || CANAL_DETALHE_RE.test(pathname)
}

/**
 * Feed ativo no mural do canal; Canais ativo só na listagem (não no detalhe).
 */
export function isComunidadeNavActive(pathname: string, href: string): boolean {
  const pathOnly = (href.split('?')[0] ?? href).replace(/\/$/, '') || '/'
  if (pathOnly === '/portal/comunidade') {
    return isComunidadeFeedPath(pathname)
  }
  if (pathOnly === CANAIS_LISTAGEM) {
    return pathname === CANAIS_LISTAGEM
  }
  return pathname === pathOnly || pathname.startsWith(`${pathOnly}/`)
}
