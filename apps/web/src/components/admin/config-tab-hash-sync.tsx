'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Links legados apontam a `/admin/configuracoes#canal-oficial`; as tabs usam
 * `?tab=`. Converte o hash na primeira carga sem exigir Suspense de searchParams.
 */
export function ConfigTabHashSync({ tabIds }: { tabIds: string[] }) {
  const router = useRouter()

  useEffect(() => {
    const hash = window.location.hash.slice(1)
    if (!hash || !tabIds.includes(hash)) return

    const params = new URLSearchParams(window.location.search)
    if (params.get('tab') === hash) {
      if (window.location.hash) {
        const qs = params.toString()
        const path = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
        window.history.replaceState(null, '', path)
      }
      return
    }

    params.set('tab', hash)
    router.replace(`/admin/configuracoes?${params.toString()}`)
  }, [router, tabIds])

  return null
}
