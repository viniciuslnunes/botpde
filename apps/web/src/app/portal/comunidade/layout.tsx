import { Suspense } from 'react'
import { ComunidadeRouteTransition } from './_components/comunidade-route-transition'
import { ComunidadeLayoutChrome } from './_components/comunidade-layout-chrome'
import { ComunidadeChromeRailSlot } from './_components/comunidade-chrome-rail-slot'
import { ComunidadeDockSlot } from './_components/comunidade-dock-slot'
import { ComunidadeNavbarSlot } from './_components/comunidade-navbar-slot'
import { COMUNIDADE_RAIL_SCROLL } from './_components/comunidade-rail-scroll'
import { ComunidadeQueryProvider } from '@/components/portal/comunidade-query-provider'
import { ComunidadeRailSkeleton } from '@/components/portal/feed-skeletons'
import { ScrollChromeVisibilityProvider } from '@/lib/scroll-chrome-context'

/**
 * Layout da Comunidade: dock mobile, QueryProvider (cache do feed) e rail de
 * chat/salas persistente no feed (sem remount ao ir/voltar).
 *
 * Síncrono de propósito. `loading.tsx` cobre os filhos do layout, não o layout
 * — enquanto o layout espera dados, o fallback visível é o do boundary de fora
 * (`portal/loading.tsx`, genérico) e o skeleton da rota nunca aparece. Todo
 * dado do chrome vive em slots com Suspense próprio.
 */
export default function ComunidadeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ComunidadeQueryProvider>
      <Suspense fallback={null}>
        <ComunidadeNavbarSlot />
      </Suspense>
      <div className="pb-28 lg:pb-0">
        <ScrollChromeVisibilityProvider>
          <ComunidadeLayoutChrome
            aside={
              <Suspense
                fallback={
                  <div className={COMUNIDADE_RAIL_SCROLL} aria-hidden="true">
                    <ComunidadeRailSkeleton />
                  </div>
                }
              >
                <ComunidadeChromeRailSlot />
              </Suspense>
            }
          >
            <ComunidadeRouteTransition>{children}</ComunidadeRouteTransition>
          </ComunidadeLayoutChrome>
          <Suspense fallback={null}>
            <ComunidadeDockSlot />
          </Suspense>
        </ScrollChromeVisibilityProvider>
      </div>
    </ComunidadeQueryProvider>
  )
}
