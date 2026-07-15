'use client'

import { Suspense, useState, type ReactNode } from 'react'
import { m, useReducedMotion } from 'motion/react'
import { ComunidadeSearchBar } from './comunidade-search-bar'
import { ComunidadeFeedTabs } from './comunidade-feed-tabs'
import { useScrollChromeVisibility } from '@/lib/use-scroll-chrome-visibility'
import { springSnappy } from '@/lib/motion-presets'

/**
 * Barra sticky (busca + tabs): some no scroll pra baixo / parado;
 * reaparece no scroll pra cima (e no topo). Permanece se a busca estiver em foco.
 */
export function ComunidadeStickySearchChrome({ children }: { children?: ReactNode }) {
  const scrollVisible = useScrollChromeVisibility()
  const reduceMotion = useReducedMotion()
  const [focusLocked, setFocusLocked] = useState(false)
  const visible = focusLocked || scrollVisible

  return (
    <m.div
      className="sticky top-14 z-20 -mx-4 min-w-0 overflow-hidden bg-[rgb(var(--background-subtle))]/90 backdrop-blur-md lg:top-16 lg:mx-0"
      initial={false}
      animate={
        visible
          ? { height: 'auto', opacity: 1, y: 0 }
          : {
              height: 0,
              opacity: 0,
              y: reduceMotion ? 0 : -8,
            }
      }
      transition={reduceMotion ? { duration: 0 } : springSnappy}
      style={{ pointerEvents: visible ? 'auto' : 'none' }}
      aria-hidden={!visible}
      onFocusCapture={() => setFocusLocked(true)}
      onBlurCapture={(event) => {
        const next = event.relatedTarget as Node | null
        if (!event.currentTarget.contains(next)) setFocusLocked(false)
      }}
    >
      <div className="space-y-3 overflow-x-clip px-4 pb-2 pt-1 lg:px-0">
        <ComunidadeSearchBar />
        <Suspense fallback={<div className="h-9 border-b border-[rgb(var(--border))]" />}>
          <ComunidadeFeedTabs />
        </Suspense>
        {children}
      </div>
    </m.div>
  )
}
