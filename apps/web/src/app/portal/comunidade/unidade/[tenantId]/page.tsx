import { notFound, redirect } from 'next/navigation'
import { db } from '@torcida/db'
import { auth } from '@/lib/auth'
import { getTenantFromHost } from '@/lib/tenant'
import { getOrCreateCanalOficial, podeVerCanal } from '@/lib/canais'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Unidade — Comunidade' }

/**
 * `unidade/[tenantId]` deixou de ter tela própria (fase 2 da unificação de
 * Canais — a "visão de perfil institucional" foi substituída pela visão de
 * canal, que usa o mesmo padrão visual do feed). Esta rota vira só um
 * resolver: garante/obtém o canal oficial da unidade e redireciona para
 * `/canais/[id]`, que já concentra toda a lógica de visibilidade fina
 * (`getCanalPorId`/`podeVerCanal`). Mantida como rota própria (em vez de
 * removida) porque outros pontos do produto (listagem de canais, busca,
 * menções) ainda linkam para ela. Confere hierarquia/aliança aqui também,
 * antes de criar o canal oficial, para não materializar canais de unidades
 * totalmente fora do alcance do viewer.
 */
export default async function UnidadePerfilPage({
  params,
}: {
  params: Promise<{ tenantId: string }>
}) {
  const { tenantId: targetTenantId } = await params
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id) redirect('/entrar')
  if (!tenant) redirect('/portal')

  const alvo: { id: string } | null = await db.tenant.findFirst({
    where: { id: targetTenantId, ativo: true },
    select: { id: true },
  })
  if (!alvo) notFound()

  const podeVer =
    (await podeVerCanal(tenant.id, targetTenantId, 'PUBLICO', session.user.id)) ||
    (await podeVerCanal(tenant.id, targetTenantId, 'ALIADOS', session.user.id)) ||
    (await podeVerCanal(tenant.id, targetTenantId, 'HIERARQUIA', session.user.id))
  if (!podeVer) notFound()

  const canal = await getOrCreateCanalOficial(targetTenantId)
  redirect(`/portal/comunidade/canais/${canal.id}`)
}
