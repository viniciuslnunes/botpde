'use client'

import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { ComunidadeSalasAside } from './comunidade-salas-aside'
import type { SalaAtivaListItem } from '@/lib/salas'

const ComunidadeChatPanel = dynamic(
  () =>
    import('@/components/portal/comunidade-chat-panel').then((mod) => mod.ComunidadeChatPanel),
  {
    loading: () => (
      <div className="h-56 animate-pulse rounded-2xl border border-[rgb(var(--border))] bg-[rgb(var(--surface))]" />
    ),
    ssr: false,
  },
)

/**
 * Chrome do layout: children + aside (salas/chat) no feed.
 * Fora do feed o aside fica `display:none` mas montado — evita novo
 * `GET /api/conversas/resumo` ao voltar.
 */
export function ComunidadeLayoutChrome({
  currentUserId,
  salas,
  modoTorcida,
  children,
}: {
  currentUserId: string
  salas: SalaAtivaListItem[]
  modoTorcida: boolean
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const isFeed = pathname === '/portal/comunidade'
  const showRail = modoTorcida && isFeed && Boolean(currentUserId)

  return (
    <div
      className={
        showRail ? 'xl:grid xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-6' : undefined
      }
    >
      <div className="min-w-0">{children}</div>
      {currentUserId && modoTorcida ? (
        <aside
          className={showRail ? 'hidden xl:block' : 'hidden'}
          aria-hidden={!showRail}
        >
          <div className="sticky top-20 space-y-4">
            <ComunidadeSalasAside salas={salas} />
            <ComunidadeChatPanel currentUserId={currentUserId} liveUpdates={showRail} />
          </div>
        </aside>
      ) : null}
    </div>
  )
}
