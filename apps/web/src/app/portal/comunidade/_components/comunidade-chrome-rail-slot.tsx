import { auth } from '@/lib/auth'
import { resolverContextoComunidade } from '@/lib/comunidade-contexto'
import { getSugestoesCanaisParaAside, getSugestoesCanaisPublicosParaAside } from '@/lib/canais'
import { listSalasAtivas, listSalasNacionais } from '@/lib/salas'
import type { SalaAtivaListItem } from '@/lib/salas'
import type { SugestaoCanalAside } from '@/lib/canais-shared'
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

  // Sócio: tenant ativo. TORCEDOR: unidade do vínculo (aba Minha torcida).
  const tenantId =
    ctx.modo === 'torcida' ? ctx.tenant.id : (ctx.torcidaReal?.id ?? null)
  const afiliacaoId = ctx.afiliacao?.id ?? null

  let salasTorcida: SalaAtivaListItem[] = []
  let canaisTorcida: SugestaoCanalAside[] = []
  let salasNacional: SalaAtivaListItem[] = []
  let canaisNacional: SugestaoCanalAside[] = []

  const tarefas: Promise<void>[] = []

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
      podeEscopoTorcida={ctx.podeEscopoTorcida}
      modoContexto={ctx.modo}
      salasTorcida={salasTorcida}
      canaisTorcida={canaisTorcida}
      salasNacional={salasNacional}
      canaisNacional={canaisNacional}
    />
  )
}
