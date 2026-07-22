'use client'

import dynamic from 'next/dynamic'
import { usePathname, useSearchParams } from 'next/navigation'
import { ComunidadeSalasAside } from './comunidade-salas-aside'
import { CanaisSugeridosAside } from './canais-sugeridos-aside'
import { COMUNIDADE_RAIL_SCROLL } from './comunidade-rail-scroll'
import type { SugestaoCanalAside } from '@/lib/canais-shared'
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

/** Rotas com o mesmo shell de feed (aside esquerdo + rail salas/chat à direita). */
const CANAL_DETALHE_RE = /^\/portal\/comunidade\/canais\/[^/]+$/

/**
 * Chrome do layout: children + aside (salas / canais sugeridos / chat) no feed
 * e no canal (mesmo shell visual). Fora dessas rotas o aside fica `display:none`
 * mas montado — evita novo `GET /api/conversas/resumo` ao voltar.
 *
 * O layout (server) não lê `?escopo=` — por isso recebe os dois datasets
 * (torcida/nacional) e este client component decide qual mostrar a partir da
 * query string atual.
 */
export function ComunidadeLayoutChrome({
  currentUserId,
  tenantId,
  tenantSinteticoId,
  podeEscopoTorcida,
  salasTorcida,
  canaisTorcida = [],
  salasNacional,
  canaisNacional = [],
  modoComunidade,
  children,
}: {
  currentUserId: string
  tenantId: string | null
  tenantSinteticoId: string | null
  podeEscopoTorcida: boolean
  salasTorcida: SalaAtivaListItem[]
  canaisTorcida?: SugestaoCanalAside[]
  salasNacional: SalaAtivaListItem[]
  canaisNacional?: SugestaoCanalAside[]
  /** Usuário tem clube resolvido (torcedor global ou sócio com afiliação). */
  modoComunidade: boolean
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isFeed = pathname === '/portal/comunidade' || CANAL_DETALHE_RE.test(pathname)

  const escopo = !podeEscopoTorcida
    ? 'nacional'
    : searchParams.get('escopo') === 'nacional'
      ? 'nacional'
      : 'torcida'
  const modoNacional = escopo === 'nacional'

  const salas = modoNacional ? salasNacional : salasTorcida
  const canaisSugeridos = modoNacional ? canaisNacional : canaisTorcida
  const tenantAtualId = modoNacional ? tenantSinteticoId : tenantId

  const mostrarChrome = modoComunidade && isFeed && Boolean(currentUserId)

  return (
    <div
      className={
        mostrarChrome ? 'xl:grid xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-6' : undefined
      }
    >
      <div className="min-w-0">{children}</div>
      {currentUserId && modoComunidade ? (
        <aside
          className={mostrarChrome ? 'hidden xl:block' : 'hidden'}
          aria-hidden={!mostrarChrome}
        >
          <div className={COMUNIDADE_RAIL_SCROLL}>
            <ComunidadeSalasAside salas={salas} />
            {tenantAtualId && canaisSugeridos.length > 0 ? (
              <CanaisSugeridosAside canais={canaisSugeridos} tenantAtualId={tenantAtualId} />
            ) : null}
            <ComunidadeChatPanel currentUserId={currentUserId} liveUpdates={mostrarChrome} />
          </div>
        </aside>
      ) : null}
    </div>
  )
}
