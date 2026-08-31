'use client'

import { useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { resolverTabDeHash } from '../_lib/tabs'

/**
 * Bookmarks e links antigos (`#areas`, `#projetos`, `#equipe`…) viram `?tab=`.
 * Roda uma vez no cliente; se a URL já tem `tab`, o hash perde.
 */
export function DepartamentoHashRedirect() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    const hash = window.location.hash
    const tab = resolverTabDeHash(hash)
    if (!tab) return
    if (searchParams.get('tab') === tab) {
      history.replaceState(null, '', `${pathname}${window.location.search}`)
      return
    }
    const params = new URLSearchParams(searchParams.toString())
    if (tab === 'painel') params.delete('tab')
    else params.set('tab', tab)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [pathname, router, searchParams])

  return null
}
