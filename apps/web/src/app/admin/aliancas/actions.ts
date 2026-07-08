'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@torcida/db'
import type { Alianca, StatusAlianca } from '@torcida/db'
import { z } from 'zod'
import { assertPermission } from '@/lib/authz'
import { normalizeTenantPair } from '@/lib/aliancas'
import { PERMISSIONS } from '@torcida/types'

const uuidSchema = z.string().uuid('ID inválido')

interface TenantLite {
  id: string
  nome: string
  slug: string
}

async function loadAliancaInTenant(aliancaId: string, tenantId: string): Promise<Alianca | null> {
  const alianca: Alianca | null = await db.alianca.findFirst({
    where: {
      id: aliancaId,
      OR: [{ tenantOrigemId: tenantId }, { tenantAliadoId: tenantId }],
    },
  })
  return alianca
}

function assertStatus(alianca: Alianca, expected: StatusAlianca): void {
  if (alianca.status !== expected) {
    throw new Error(`A aliança precisa estar em ${expected.toLowerCase()} para esta ação`)
  }
}

export async function proporAlianca(tenantAliadoId: string): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.ALLIANCES_MANAGE)

  const parsed = uuidSchema.safeParse(tenantAliadoId)
  if (!parsed.success) throw new Error('Torcida aliada inválida')
  if (parsed.data === tenant.id) throw new Error('Você não pode propor aliança para a própria torcida')

  const [tenantOrigemId, tenantDestinoId] = normalizeTenantPair(tenant.id, parsed.data)

  const aliado: TenantLite | null = await db.tenant.findFirst({
    where: { id: parsed.data, ativo: true },
    select: { id: true, nome: true, slug: true },
  })
  if (!aliado) throw new Error('Torcida aliada não encontrada')

  const existente: Alianca | null = await db.alianca.findUnique({
    where: {
      tenantOrigemId_tenantAliadoId: {
        tenantOrigemId,
        tenantAliadoId: tenantDestinoId,
      },
    },
  })

  let aliancaId = existente?.id ?? null
  if (!existente) {
    const criada: Alianca = await db.alianca.create({
      data: {
        tenantOrigemId,
        tenantAliadoId: tenantDestinoId,
        propostaPorId: session.user.id,
        status: 'PENDENTE',
      },
    })
    aliancaId = criada.id
  } else if (existente.status === 'ENCERRADA') {
    const reaberta: Alianca = await db.alianca.update({
      where: { id: existente.id },
      data: {
        status: 'PENDENTE',
        propostaPorId: session.user.id,
        confirmadaPorId: null,
        confirmadaEm: null,
      },
    })
    aliancaId = reaberta.id
  } else if (existente.status === 'PENDENTE') {
    throw new Error('Já existe uma proposta de aliança pendente com esta torcida')
  } else {
    throw new Error('Esta torcida já possui aliança ativa com você')
  }

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'ALIANCA_PROPOSTA',
      entidade: 'Alianca',
      entidadeId: aliancaId,
      detalhes: {
        tenantAliadoId: aliado.id,
        tenantAliadoSlug: aliado.slug,
        tenantAliadoNome: aliado.nome,
      },
    },
  })

  revalidatePath('/admin/aliancas')
}

export async function aceitarAlianca(aliancaId: string): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.ALLIANCES_MANAGE)

  const parsed = uuidSchema.safeParse(aliancaId)
  if (!parsed.success) throw new Error('Aliança inválida')

  const alianca = await loadAliancaInTenant(parsed.data, tenant.id)
  if (!alianca) throw new Error('Aliança não encontrada')
  if (alianca.tenantAliadoId !== tenant.id) {
    throw new Error('Somente o tenant aliado pode aceitar a proposta')
  }
  assertStatus(alianca, 'PENDENTE')

  await db.alianca.update({
    where: { id: alianca.id },
    data: {
      status: 'ATIVA',
      confirmadaPorId: session.user.id,
      confirmadaEm: new Date(),
    },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'ALIANCA_ACEITA',
      entidade: 'Alianca',
      entidadeId: alianca.id,
      detalhes: {
        tenantOrigemId: alianca.tenantOrigemId,
        tenantAliadoId: alianca.tenantAliadoId,
      },
    },
  })

  revalidatePath('/admin/aliancas')
}

export async function rejeitarAlianca(aliancaId: string): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.ALLIANCES_MANAGE)

  const parsed = uuidSchema.safeParse(aliancaId)
  if (!parsed.success) throw new Error('Aliança inválida')

  const alianca = await loadAliancaInTenant(parsed.data, tenant.id)
  if (!alianca) throw new Error('Aliança não encontrada')
  if (alianca.tenantAliadoId !== tenant.id) {
    throw new Error('Somente o tenant aliado pode rejeitar a proposta')
  }
  assertStatus(alianca, 'PENDENTE')

  await db.alianca.update({
    where: { id: alianca.id },
    data: {
      status: 'ENCERRADA',
      confirmadaPorId: session.user.id,
      confirmadaEm: new Date(),
    },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'ALIANCA_REJEITADA',
      entidade: 'Alianca',
      entidadeId: alianca.id,
      detalhes: {
        tenantOrigemId: alianca.tenantOrigemId,
        tenantAliadoId: alianca.tenantAliadoId,
      },
    },
  })

  revalidatePath('/admin/aliancas')
}

export async function encerrarAlianca(aliancaId: string): Promise<void> {
  const { session, tenant } = await assertPermission(PERMISSIONS.ALLIANCES_MANAGE)

  const parsed = uuidSchema.safeParse(aliancaId)
  if (!parsed.success) throw new Error('Aliança inválida')

  const alianca = await loadAliancaInTenant(parsed.data, tenant.id)
  if (!alianca) throw new Error('Aliança não encontrada')

  if (alianca.status === 'ENCERRADA') {
    throw new Error('Esta aliança já está encerrada')
  }

  await db.alianca.update({
    where: { id: alianca.id },
    data: { status: 'ENCERRADA' },
  })

  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      atorId: session.user.id,
      acao: 'ALIANCA_ENCERRADA',
      entidade: 'Alianca',
      entidadeId: alianca.id,
      detalhes: {
        tenantOrigemId: alianca.tenantOrigemId,
        tenantAliadoId: alianca.tenantAliadoId,
      },
    },
  })

  revalidatePath('/admin/aliancas')
}
