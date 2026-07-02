'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@torcida/db'
import { assertAdmin } from '@/lib/authz'

/** Nome do departamento padrão por tipo de membro — criado sob demanda no tenant. */
const DEPARTAMENTO_PADRAO_POR_TIPO: Record<'SOCIO' | 'TORCEDOR', string> = {
  SOCIO: 'Sócio',
  TORCEDOR: 'Torcedor',
}

/**
 * Concede acesso básico ao portal quando um membro é aprovado:
 * - Role de sistema 'member' (se ainda não tiver)
 * - Departamento correspondente ao tipo (SOCIO/TORCEDOR), criado sob demanda
 * Idempotente: seguro chamar mais de uma vez para o mesmo usuário/tenant.
 */
async function concederAcessoBasico(tenantId: string, userId: string, tipoMembro: 'SOCIO' | 'TORCEDOR') {
  const memberRole = await db.role.findFirst({
    where: { tenantId, nome: 'member', isSystem: true },
  })

  if (memberRole) {
    await db.userRole.upsert({
      where: { userId_tenantId_roleId: { userId, tenantId, roleId: memberRole.id } },
      create: { userId, tenantId, roleId: memberRole.id },
      update: {},
    })
  }

  const nomeDepartamento = DEPARTAMENTO_PADRAO_POR_TIPO[tipoMembro]
  const departamento = await db.departamento.upsert({
    where: { tenantId_nome: { tenantId, nome: nomeDepartamento } },
    create: { tenantId, nome: nomeDepartamento },
    update: {},
  })

  await db.userDepartamento.upsert({
    where: {
      userId_tenantId_departamentoId: { userId, tenantId, departamentoId: departamento.id },
    },
    create: { userId, tenantId, departamentoId: departamento.id },
    update: {},
  })
}

export async function aprovarMembro(membroId: string) {
  const { session, tenant } = await assertAdmin()

  const membro = await db.saasMembro.update({
    where: { id: membroId, tenantId: tenant.id },
    data: {
      status: 'APROVADO',
      aprovadoPorId: session.user.id,
      aprovadoPorNome: session.user.name ?? 'Admin',
      aprovadoEm: new Date(),
    },
  })

  await concederAcessoBasico(tenant.id, membro.userId, membro.tipo)

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
