'use client'

import { useEffect } from 'react'

/** setInterval que só executa quando a aba está visível. */
export function useVisibleInterval(callback: () => void, intervalMs: number): void {
  useEffect(() => {
    function tick() {
      if (document.visibilityState === 'visible') callback()
    }
    const id = window.setInterval(tick, intervalMs)
    return () => window.clearInterval(id)
  }, [callback, intervalMs])
}
