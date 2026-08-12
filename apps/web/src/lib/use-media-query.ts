'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * Media query como estado reativo, via `useSyncExternalStore`.
 *
 * O caminho antigo — `useEffect` + `setState(mql.matches)` — é setState
 * síncrono dentro de efeito (`react-hooks/set-state-in-effect`) e ainda pisca:
 * o primeiro paint sai com o valor errado e o efeito corrige depois.
 * `useSyncExternalStore` lê o valor no próprio render, sem passo intermediário.
 *
 * No servidor o snapshot é `false` — não há viewport. Ou seja: **não** decida
 * conteúdo só por isto, senão o HTML do SSR diverge do primeiro render do
 * cliente. Serve para ajuste pós-hidratação (qual âncora usar, se colapsa um
 * painel); layout de verdade continua sendo CSS.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {}
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    [query],
  )

  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia(query).matches
  }, [query])

  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
