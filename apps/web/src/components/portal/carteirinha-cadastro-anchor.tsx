'use client'

import { useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CARTEIRINHA_SECAO_PARAM } from '@/lib/carteirinha-tabs'

/**
 * Bookmarks `#cadastro` viram `?secao=cadastro` (a aba da ficha).
 * O modal de pendência e `/portal/cadastro/associacao` já chegam com a query.
 */
export function CarteirinhaCadastroAnchor() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (window.location.hash !== '#cadastro') return
    if (searchParams.get(CARTEIRINHA_SECAO_PARAM) === 'cadastro') {
      window.history.replaceState(null, '', `${pathname}${window.location.search}`)
      return
    }
    const params = new URLSearchParams(searchParams.toString())
    params.set(CARTEIRINHA_SECAO_PARAM, 'cadastro')
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [pathname, router, searchParams])

  return null
}
