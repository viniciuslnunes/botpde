import { notFound, redirect } from 'next/navigation'
import { db } from '@torcida/db'
import { auth } from '@/lib/auth'
import { resolverContextoComunidade } from '@/lib/comunidade-contexto'
import {
  getCanalPorId,
  getCanalSeMembroAtivo,
  getOrCreateCanalOficial,
  podeVerCanal,
} from '@/lib/canais'
import { isSuperAdminEmail } from '@/lib/tenant-context'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Unidade — Comunidade' }

/**
 * Resolve o ponteiro do mural oficial sem materializar canal.
 * Prefere SEDE; em Caso B (uma única sede com canal) aceita essa.
 */
async function resolverCanalOficialExistente(
  tenantId: string,
): Promise<string | null> {
  const sedesComCanal: Array<{
    canalConversaId: string | null
    tipo: string
  }> = await db.sede.findMany({
    where: { tenantId, canalConversaId: { not: null } },
    select: { canalConversaId: true, tipo: true },
  })
  const sedeRaiz = sedesComCanal.find((s) => s.tipo === 'SEDE')
  if (sedeRaiz?.canalConversaId) return sedeRaiz.canalConversaId
  if (sedesComCanal.length === 1 && sedesComCanal[0]?.canalConversaId) {
    return sedesComCanal[0].canalConversaId
  }
  return null
}

/**
 * `unidade/[tenantId]` deixou de ter tela própria (fase 2 da unificação de
 * Canais — a "visão de perfil institucional" foi substituída pela visão de
 * canal, que usa o mesmo padrão visual do feed). Esta rota vira só um
 * resolver: obtém o canal oficial da unidade e redireciona para
 * `/canais/[id]`, que concentra a lógica de visibilidade fina.
 *
 * Espelha o bypass de leitura do mural em `/canais/[id]`: super-admin /
 * modo operador não passam por `podeVerCanal` (não têm `SaasMembro` no
 * tenant visitado). Sem isso, links de busca/perfil 404am no operador.
 */
export default async function UnidadePerfilPage({
  params,
}: {
  params: Promise<{ tenantId: string }>
}) {
  const { tenantId: targetTenantId } = await params
  const session = await auth()
  if (!session?.user?.id) redirect('/entrar')

  const ctx = await resolverContextoComunidade(session.user.id, session.user.email)
  if (!ctx) redirect('/')

  const torcidaReal = ctx.torcidaReal ?? (ctx.modo === 'torcida' ? ctx.tenant : null)
  if (!torcidaReal) redirect('/portal/comunidade?escopo=nacional')

  const alvo: { id: string } | null = await db.tenant.findFirst({
    where: { id: targetTenantId, ativo: true, sintetico: false },
    select: { id: true },
  })
  if (!alvo) notFound()

  const superAdmin = isSuperAdminEmail(session.user.email)
  const operador = ctx.modo === 'torcida' && Boolean(ctx.operador)
  const leituraOperador = superAdmin || operador

  const canalExistenteId = await resolverCanalOficialExistente(targetTenantId)

  if (canalExistenteId) {
    if (leituraOperador) {
      redirect(`/portal/comunidade/canais/${canalExistenteId}`)
    }
    const canal =
      (await getCanalPorId(canalExistenteId, torcidaReal.id, session.user.id)) ??
      (await getCanalSeMembroAtivo(canalExistenteId, session.user.id))
    if (!canal) notFound()
    redirect(`/portal/comunidade/canais/${canal.id}`)
  }

  // Sem ponteiro ainda: operador não materializa; sócio só cria se enxerga.
  if (leituraOperador) notFound()

  const podeVer =
    (await podeVerCanal(torcidaReal.id, targetTenantId, 'PUBLICO', session.user.id)) ||
    (await podeVerCanal(torcidaReal.id, targetTenantId, 'ALIADOS', session.user.id)) ||
    (await podeVerCanal(torcidaReal.id, targetTenantId, 'HIERARQUIA', session.user.id))
  if (!podeVer) notFound()

  const canal = await getOrCreateCanalOficial(targetTenantId, session.user.id)
  redirect(`/portal/comunidade/canais/${canal.id}`)
}
