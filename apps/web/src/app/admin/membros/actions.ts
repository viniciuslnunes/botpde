'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@torcida/db'
import { assertPermission } from '@/lib/authz'
import { PERMISSIONS } from '@torcida/types'

/**
 * Concede acesso básico ao portal quando um membro é aprovado:
 * Role de sistema 'member' (se ainda não tiver).
 * Idempotente: seguro chamar mais de uma vez para o mesmo usuário/tenant.
 *
 * Sócio/Torcedor NÃO são departamentos (ver schema Departamento) — o tipo
 * vive em SaasMembro.tipo; departamentos reais (Financeiro, Comunicação…)
 * são atribuídos depois pelo admin.
 */
async function concederAcessoBasico(tenantId: string, userId: string) {
  const memberRole = await db.role.findFirst({
    where: { tenantId, nome: 'member', isSystem: true },
  })

  if (!memberRole) return

  await db.userRole.upsert({
    where: { userId_tenantId_roleId: { userId, tenantId, roleId: memberRole.id } },
    create: { userId, tenantId, roleId: memberRole.id },
    update: {},
  })
}

export async function aprovarMembro(membroId: string) {
  const { session, tenant } = await assertPermission(PERMISSIONS.MEMBERS_APPROVE)

  const membro = await db.saasMembro.update({
    where: { id: membroId, tenantId: tenant.id },
    data: {
      status: 'APROVADO',
      aprovadoPorId: session.user.id,
      aprovadoPorNome: session.user.name ?? 'Admin',
      aprovadoEm: new Date(),
    },
  })

  await concederAcessoBasico(tenant.id, membro.userId)

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
  const { session, tenant } = await assertPermission(PERMISSIONS.MEMBERS_REJECT)

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
  // Reverte aprovação/reprovação para pendente — reaproveita MEMBERS_APPROVE
  // (não existe permissão dedicada para "reverter"; é a mesma decisão de
  // aprovação sendo desfeita).
  const { session, tenant } = await assertPermission(PERMISSIONS.MEMBERS_APPROVE)

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
