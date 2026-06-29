'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import { getTenantFromHost } from '@/lib/tenant'

async function assertAdmin() {
  const [session, tenant] = await Promise.all([auth(), getTenantFromHost()])

  if (!session?.user?.id || !tenant) {
    throw new Error('Não autorizado')
  }

  const userRole = await db.userRole.findFirst({
    where: {
      userId: session.user.id,
      tenantId: tenant.id,
      role: { isSystem: true, nome: { in: ['owner', 'admin'] } },
    },
  })

  if (!userRole) throw new Error('Sem permissão')

  return { session, tenant }
}

export async function aprovarMembro(membroId: string) {
  const { session, tenant } = await assertAdmin()

  await db.saasMembro.update({
    where: { id: membroId, tenantId: tenant.id },
    data: {
      status: 'APROVADO',
      aprovadoPorId: session.user.id,
      aprovadoPorNome: session.user.name ?? 'Admin',
      aprovadoEm: new Date(),
    },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'MEMBRO_APROVADO',
      entidade: 'SaasMembro',
      entidadeId: membroId,
    },
  })

  revalidatePath('/admin/membros')
  revalidatePath('/admin')
}

export async function reprovarMembro(membroId: string, motivo?: string) {
  const { session, tenant } = await assertAdmin()

  await db.saasMembro.update({
    where: { id: membroId, tenantId: tenant.id },
    data: {
      status: 'REPROVADO',
      aprovadoPorId: session.user.id,
      aprovadoPorNome: session.user.name ?? 'Admin',
      aprovadoEm: new Date(),
    },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'MEMBRO_REPROVADO',
      entidade: 'SaasMembro',
      entidadeId: membroId,
      detalhes: motivo ? { motivo } : undefined,
    },
  })

  revalidatePath('/admin/membros')
  revalidatePath('/admin')
}

export async function reverterMembro(membroId: string) {
  const { session, tenant } = await assertAdmin()

  await db.saasMembro.update({
    where: { id: membroId, tenantId: tenant.id },
    data: {
      status: 'PENDENTE',
      aprovadoPorId: null,
      aprovadoPorNome: null,
      aprovadoEm: null,
    },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'MEMBRO_REVERTIDO_PENDENTE',
      entidade: 'SaasMembro',
      entidadeId: membroId,
    },
  })

  revalidatePath('/admin/membros')
}
