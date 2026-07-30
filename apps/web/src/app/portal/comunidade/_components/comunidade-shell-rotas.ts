'use client'

import { usePathname } from 'next/navigation'

/** Rotas com o mesmo shell de feed (rail de salas/chat à direita). */
const CANAL_DETALHE_RE = /^\/portal\/comunidade\/canais\/[^/]+$/

/**
 * Se a rota atual usa o shell de feed. O layout é síncrono e o rail chega por
 * streaming, então tanto o container quanto o conteúdo do rail derivam a
 * visibilidade daqui — não de dados do servidor.
 */
export function useShellDeFeed(): boolean {
  const pathname = usePathname()
  return pathname === '/portal/comunidade' || CANAL_DETALHE_RE.test(pathname)
}
