import { auth } from '@/lib/auth'
import { resolverContextoComunidade } from '@/lib/comunidade-contexto'
import { getSugestoesCanaisParaAside, getSugestoesCanaisPublicosParaAside } from '@/lib/canais'
import { listSalasAtivas, listSalasNacionais } from '@/lib/salas'
import type { SalaAtivaListItem } from '@/lib/salas'
import type { SugestaoCanalAside } from '@/lib/canais-shared'
import { podeCriarGrupoInbox } from '@/lib/mensageria-api'
import { ComunidadeChromeRail } from './comunidade-chrome-rail'

/**
 * Salas/canais/chat do rail persistente. Fica em um slot próprio, dentro de
 * Suspense, para o layout da Comunidade não bloquear: layout que espera dados
 * empurra o fallback para o boundary de fora dele (`portal/loading.tsx`) e o
 * `loading.tsx` de cada rota nunca aparece.
 */
export async function ComunidadeChromeRailSlot() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return null

  const ctx = await resolverContextoComunidade(userId, session.user.email)
  if (!ctx) return null

  // Sócio sem afiliação ainda vê o rail da torcida; torcedor exige clube.
  const modoComunidade = ctx.modo === 'torcida' || Boolean(ctx.afiliacao)
  if (!modoComunidade) return null

  // Sócio: organizada (Sede raiz) — portal ativo pode ser PDE Caso B.
  // TORCEDOR: tenant do vínculo (sem aba da torcida; rail fora da CN).
  const tenantId =
    ctx.modo === 'torcida'
      ? (ctx.torcidaReal?.id ?? ctx.tenant.id)
      : (ctx.torcidaReal?.id ?? null)
  const afiliacaoId = ctx.afiliacao?.id ?? null

  let salasTorcida: SalaAtivaListItem[] = []
  let canaisTorcida: SugestaoCanalAside[] = []
  let salasNacional: SalaAtivaListItem[] = []
  let canaisNacional: SugestaoCanalAside[] = []
  let podeCriarGrupo = false

  const tarefas: Promise<void>[] = [
    podeCriarGrupoInbox(userId, session.user.email).then((v) => {
      podeCriarGrupo = v
    }),
  ]

  if (tenantId) {
    tarefas.push(
      Promise.all([
        listSalasAtivas(tenantId),
        getSugestoesCanaisParaAside(tenantId, userId),
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
        getSugestoesCanaisPublicosParaAside(afiliacaoId, userId),
      ]).then(([salas, canais]) => {
        salasNacional = salas
        canaisNacional = canais
      }),
    )
  }

  await Promise.all(tarefas)

  return (
    <ComunidadeChromeRail
      currentUserId={userId}
      tenantId={tenantId}
      tenantSinteticoId={ctx.tenantSintetico?.id ?? null}
      escopos={ctx.escopos}
      modoContexto={ctx.modo}
      tenantAtivoEhUnidade={ctx.modo === 'torcida' && Boolean(ctx.tenantAtivoEhUnidade)}
      salasTorcida={salasTorcida}
      canaisTorcida={canaisTorcida}
      salasNacional={salasNacional}
      canaisNacional={canaisNacional}
      podeCriarGrupo={podeCriarGrupo}
    />
  )
}
