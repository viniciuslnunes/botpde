'use client'

import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'
import { ComunidadeSalasAside } from './comunidade-salas-aside'
import { CanaisSugeridosAside } from './canais-sugeridos-aside'
import { COMUNIDADE_RAIL_SCROLL } from './comunidade-rail-scroll'
import { useShellDeFeed } from './comunidade-shell-rotas'
import { Skeleton } from '@/components/portal/feed-skeletons'
import {
  resolverEscopoComunidadePorModo,
  type EscoposDisponiveis,
} from '@/lib/comunidade-escopo'
import type { SugestaoCanalAside } from '@/lib/canais-shared'
import type { SalaAtivaListItem } from '@/lib/salas'

const ComunidadeChatPanel = dynamic(
  () =>
    import('@/components/portal/comunidade-chat-panel').then((mod) => mod.ComunidadeChatPanel),
  {
    loading: () => <Skeleton className="h-56 rounded-2xl" soft />,
    ssr: false,
  },
)

/**
 * Coluna direita do chrome (salas, canais sugeridos e chat). Recebe os dois
 * datasets (torcida/nacional) porque quem a resolve é um server component sem
 * acesso a `?escopo=` — a escolha é feita aqui, pela query string atual.
 */
export function ComunidadeChromeRail({
  currentUserId,
  tenantId,
  tenantSinteticoId,
  escopos,
  modoContexto = 'torcida',
  salasTorcida,
  canaisTorcida = [],
  salasNacional,
  canaisNacional = [],
  tenantAtivoEhUnidade = false,
  podeCriarGrupo = false,
}: {
  currentUserId: string
  tenantId: string | null
  tenantSinteticoId: string | null
  escopos: EscoposDisponiveis
  /** TORCEDOR = nacional (default CN); sócio = torcida. */
  modoContexto?: 'nacional' | 'torcida'
  /** Unidade Caso B ativa: o default do escopo é ela, não a Sede raiz. */
  tenantAtivoEhUnidade?: boolean
  salasTorcida: SalaAtivaListItem[]
  canaisTorcida?: SugestaoCanalAside[]
  salasNacional: SalaAtivaListItem[]
  canaisNacional?: SugestaoCanalAside[]
  podeCriarGrupo?: boolean
}) {
  const searchParams = useSearchParams()
  const noFeed = useShellDeFeed()

  const escopo = resolverEscopoComunidadePorModo(
    modoContexto,
    escopos,
    searchParams.get('escopo'),
    { tenantAtivoEhUnidade },
  )
  const modoNacional = escopo === 'nacional'
  // Mesma regra do `ComunidadeFeedShell`: sub-rota só carrega `?escopo=` quando
  // o escopo ativo não é o default do contexto.
  const sufixoEscopo = escopo === modoContexto ? '' : `?escopo=${escopo}`

  const salas = modoNacional ? salasNacional : salasTorcida
  const canaisSugeridos = modoNacional ? canaisNacional : canaisTorcida
  const tenantAtualId = modoNacional ? tenantSinteticoId : tenantId

  return (
    <div className={COMUNIDADE_RAIL_SCROLL}>
      <ComunidadeSalasAside salas={salas} sufixoEscopo={sufixoEscopo} />
      {tenantAtualId && canaisSugeridos.length > 0 ? (
        <CanaisSugeridosAside canais={canaisSugeridos} tenantAtualId={tenantAtualId} />
      ) : null}
      <ComunidadeChatPanel
        currentUserId={currentUserId}
        liveUpdates={noFeed}
        podeCriarGrupo={podeCriarGrupo}
      />
    </div>
  )
}
