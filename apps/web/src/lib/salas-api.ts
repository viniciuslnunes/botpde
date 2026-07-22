import { auth } from '@/lib/auth'
import { assertMembroAtivo, assertPodeAcessarSalaNacional } from '@/lib/authz'
import { getTenantFromHost } from '@/lib/tenant'
import { db } from '@torcida/db'

/**
 * Membro ativo do tenant da sala (caminho torcida) ou, quando o viewer não
 * tem vínculo no tenant do host, elegível pelo caminho Comunidade Nacional
 * (`assertPodeAcessarSalaNacional` — sala no sintético ou `ABERTA` do clube).
 */
export async function assertSalaMembro(salaId: string) {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id) throw new Error('Não autenticado.')

  if (tenant) {
    try {
      await assertMembroAtivo(tenant.id, session.user.id)
      const sala = await db.salaReuniao.findFirst({
        where: { id: salaId, tenantId: tenant.id, encerradaEm: null },
        select: { id: true, hostId: true, tenantId: true },
      })
      if (sala) {
        return { session, tenant: { id: tenant.id }, sala, isHost: sala.hostId === session.user.id }
      }
    } catch {
      // Sem vínculo ativo neste tenant — tenta o caminho nacional abaixo.
    }
  }

  const nacional = await assertPodeAcessarSalaNacional(salaId)
  return {
    session: nacional.session,
    tenant: { id: nacional.tenantSinteticoId },
    sala: nacional.sala,
    isHost: nacional.isHost,
  }
}

export async function assertSalaAnfitriao(salaId: string) {
  const ctx = await assertSalaMembro(salaId)
  if (!ctx.isHost) throw new Error('Somente o anfitrião pode fazer isso.')
  return ctx
}
