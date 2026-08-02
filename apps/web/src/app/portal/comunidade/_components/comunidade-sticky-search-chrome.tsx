'use client'

import { Suspense, useState, type ReactNode } from 'react'
import { m, useReducedMotion } from 'motion/react'
import { ComunidadeSearchBar } from './comunidade-search-bar'
import { ComunidadeFeedTabs } from './comunidade-feed-tabs'
import { useScrollChromeVisibilityShared } from '@/lib/scroll-chrome-context'
import { springSnappy } from '@/lib/motion-presets'
import type { EscopoComunidade } from '@/lib/comunidade-escopo'

/**
 * Barra sticky (busca + tabs): some no scroll pra baixo / parado;
 * reaparece no scroll pra cima (e no topo). Permanece se a busca estiver em foco.
 */
export function ComunidadeStickySearchChrome({
  children,
  escopo = 'torcida',
  modoContexto = 'torcida',
  /** Mural de canal (Sede/unidade): mantém busca, esconde Descobrir/Seguindo/Grupos. */
  ocultarFiltrosFeed = false,
}: {
  children?: ReactNode
  escopo?: EscopoComunidade
  modoContexto?: 'nacional' | 'torcida'
  ocultarFiltrosFeed?: boolean
}) {
  const scrollVisible = useScrollChromeVisibilityShared()
  const reduceMotion = useReducedMotion()
  const [focusLocked, setFocusLocked] = useState(false)
  const visible = focusLocked || scrollVisible

  return (
    <m.div
      className="sticky top-14 z-20 -mx-4 min-w-0 bg-[rgb(var(--background-subtle))]/90 backdrop-blur-md lg:top-16 lg:mx-0"
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
      transition={
        reduceMotion
          ? { duration: 0 }
          : { ...springSnappy, height: { type: 'tween', duration: 0.18, ease: 'easeOut' } }
      }
      style={{ pointerEvents: visible ? 'auto' : 'none', overflow: visible ? 'visible' : 'hidden' }}
      aria-hidden={!visible}
      onFocusCapture={() => setFocusLocked(true)}
      onBlurCapture={(event) => {
        const next = event.relatedTarget as Node | null
        if (!event.currentTarget.contains(next)) setFocusLocked(false)
      }}
    >
      <div className="space-y-3 overflow-x-clip px-4 pb-2 pt-1 lg:px-0">
        <Suspense fallback={<div className="h-11 animate-pulse rounded-xl bg-[rgb(var(--border))]" />}>
          <ComunidadeSearchBar escopo={escopo} modoContexto={modoContexto} />
        </Suspense>
        {!ocultarFiltrosFeed ? (
          <Suspense fallback={<div className="h-9 border-b border-[rgb(var(--border))]" />}>
            <ComunidadeFeedTabs escopo={escopo} modoContexto={modoContexto} />
          </Suspense>
        ) : null}
        {children}
      </div>
    </m.div>
  )
}
