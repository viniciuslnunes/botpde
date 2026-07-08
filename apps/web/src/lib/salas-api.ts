import { auth } from '@/lib/auth'
import { assertMembroAtivo } from '@/lib/authz'
import { getTenantFromHost } from '@/lib/tenant'
import { db } from '@torcida/db'

export async function assertSalaMembro(salaId: string) {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])
  if (!session?.user?.id || !tenant) {
    throw new Error('Não autenticado.')
  }

  await assertMembroAtivo(tenant.id, session.user.id)

  const sala = await db.salaReuniao.findFirst({
    where: { id: salaId, tenantId: tenant.id, encerradaEm: null },
    select: { id: true, hostId: true, tenantId: true },
  })
  if (!sala) throw new Error('Sala indisponível.')

  return { session, tenant, sala, isHost: sala.hostId === session.user.id }
}

export async function assertSalaAnfitriao(salaId: string) {
  const ctx = await assertSalaMembro(salaId)
  if (!ctx.isHost) throw new Error('Somente o anfitrião pode fazer isso.')
  return ctx
}
