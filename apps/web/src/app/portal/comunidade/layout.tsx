import { Suspense } from 'react'
import { auth } from '@/lib/auth'
import { ComunidadeDock } from './_components/comunidade-dock'
import { ComunidadeRouteTransition } from './_components/comunidade-route-transition'
import { ComunidadeLayoutChrome } from './_components/comunidade-layout-chrome'
import { ComunidadeEscopoNavbarOverride } from './_components/comunidade-escopo-navbar-override'
import { ComunidadeQueryProvider } from '@/components/portal/comunidade-query-provider'
import { ScrollChromeVisibilityProvider } from '@/lib/scroll-chrome-context'
import { resolverContextoComunidade, type AfiliacaoComunidade } from '@/lib/comunidade-contexto'
import { getSugestoesCanaisParaAside, getSugestoesCanaisPublicosParaAside } from '@/lib/canais'
import type { SugestaoCanalAside } from '@/lib/canais-shared'
import { listSalasAtivas, listSalasNacionais } from '@/lib/salas'
import type { SalaAtivaListItem } from '@/lib/salas'
import { getAvatarAtualDoUsuario } from '@/lib/perfil-social'

/**
 * Layout da Comunidade: dock mobile, QueryProvider (cache do feed) e
 * aside de chat/salas persistente no feed (sem remount ao ir/voltar).
 * O layout não lê `?escopo=` (server component fora do client tree) — por
 * isso carrega os dois datasets (torcida/nacional) quando aplicável e deixa
 * o chrome (client) decidir qual mostrar a partir da query string.
 */
export default async function ComunidadeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  let modoComunidade = false
  let podeEscopoTorcida = false
  let salasTorcida: SalaAtivaListItem[] = []
  let canaisTorcida: SugestaoCanalAside[] = []
  let salasNacional: SalaAtivaListItem[] = []
  let canaisNacional: SugestaoCanalAside[] = []
  let tenantId: string | null = null
  let tenantSinteticoId: string | null = null
  let afiliacaoId: string | null = null
  let afiliacao: AfiliacaoComunidade | null = null

  if (session?.user?.id) {
    const ctx = await resolverContextoComunidade(session.user.id, session.user.email)
    if (ctx) {
      afiliacao = ctx.afiliacao
      afiliacaoId = ctx.afiliacao?.id ?? null
      podeEscopoTorcida = ctx.podeEscopoTorcida
      tenantSinteticoId = ctx.tenantSintetico?.id ?? null
      // Chrome (salas/chat) sempre que há contexto de comunidade — sócio sem
      // afiliação ainda vê o rail da torcida; torcedor exige clube.
      modoComunidade = ctx.modo === 'torcida' || Boolean(ctx.afiliacao)

      const tarefas: Promise<void>[] = []

      if (ctx.modo === 'torcida') {
        tenantId = ctx.tenant.id
        tarefas.push(
          Promise.all([
            listSalasAtivas(ctx.tenant.id),
            getSugestoesCanaisParaAside(ctx.tenant.id, session.user.id),
          ]).then(([salas, canais]) => {
            salasTorcida = salas
            canaisTorcida = canais
          }),
        )
      }

      if (afiliacaoId) {
        tarefas.push(
          Promise.all([
            listSalasNacionais(afiliacaoId),
            getSugestoesCanaisPublicosParaAside(afiliacaoId, session.user.id),
          ]).then(([salas, canais]) => {
            salasNacional = salas
            canaisNacional = canais
          }),
        )
      }

      await Promise.all(tarefas)
    }
  }

  const currentUser = {
    id: session?.user?.id ?? '',
    nome: session?.user?.name ?? null,
    avatarUrl: session?.user?.id
      ? await getAvatarAtualDoUsuario(session.user.id)
      : null,
  }

  return (
    <ComunidadeQueryProvider>
      <Suspense fallback={null}>
        <ComunidadeEscopoNavbarOverride
          afiliacao={afiliacao}
          podeEscopoTorcida={podeEscopoTorcida}
        />
      </Suspense>
      <div className="pb-28 lg:pb-0">
        <ScrollChromeVisibilityProvider>
          <ComunidadeLayoutChrome
            currentUserId={currentUser.id}
            tenantId={tenantId}
            tenantSinteticoId={tenantSinteticoId}
            podeEscopoTorcida={podeEscopoTorcida}
            salasTorcida={salasTorcida}
            canaisTorcida={canaisTorcida}
            salasNacional={salasNacional}
            canaisNacional={canaisNacional}
            modoComunidade={modoComunidade}
          >
            <ComunidadeRouteTransition>{children}</ComunidadeRouteTransition>
          </ComunidadeLayoutChrome>
          {currentUser.id && (
            <Suspense fallback={null}>
              <ComunidadeDock currentUser={currentUser} />
            </Suspense>
          )}
        </ScrollChromeVisibilityProvider>
      </div>
    </ComunidadeQueryProvider>
  )
}
