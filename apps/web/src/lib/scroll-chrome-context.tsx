'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { useScrollChromeVisibility } from './use-scroll-chrome-visibility'

const ScrollChromeVisibilityContext = createContext(true)

/**
 * Fonte única de `useScrollChromeVisibility` para uma árvore com múltiplos
 * chromes flutuantes (dock mobile + barra de busca sticky) — evita dois
 * listeners de scroll/rAF/setState independentes reagindo ao mesmo evento.
 */
export function ScrollChromeVisibilityProvider({ children }: { children: ReactNode }) {
  const visible = useScrollChromeVisibility()
  return (
    <ScrollChromeVisibilityContext.Provider value={visible}>
      {children}
    </ScrollChromeVisibilityContext.Provider>
  )
}

export function useScrollChromeVisibilityShared(): boolean {
  return useContext(ScrollChromeVisibilityContext)
}
