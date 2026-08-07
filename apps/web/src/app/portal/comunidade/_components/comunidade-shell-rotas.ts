'use client'

import { usePathname } from 'next/navigation'
import { isComunidadeFeedPath } from '@/lib/comunidade-nav'

/**
 * Se a rota atual usa o shell de feed. O layout é síncrono e o rail chega por
 * streaming, então tanto o container quanto o conteúdo do rail derivam a
 * visibilidade daqui — não de dados do servidor.
 */
export function useShellDeFeed(): boolean {
  const pathname = usePathname()
  return isComunidadeFeedPath(pathname)
}

export { isComunidadeFeedPath } from '@/lib/comunidade-nav'
