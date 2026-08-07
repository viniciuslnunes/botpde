'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import type { Prisma } from '@torcida/db'
import { superAdminEmails } from '@/lib/env'
import { invalidateTorcidasSelecaoCache } from '@/lib/tenant-context'
import { z } from 'zod'

/**
 * Transferir e remover presidência saíram daqui: a regra é única em
 * `lib/lideranca.ts` (Caso A e Caso B, auditoria e notificação) e a UI é
 * `/super-admin/liderancas`. Este arquivo ficou só com plano e suspensão do
 * tenant.
 */

const alternarAtivoSchema = z.object({
  tenantId: z.string().uuid('Tenant inválido'),
  ativo: z.enum(['true', 'false']).transform((v) => v === 'true'),
})

export type AlternarAtivoState = {
  success?: boolean
  message?: string
}

/** Suspende (ativo=false) ou reativa (ativo=true) uma torcida — bloqueia/libera login e portal. */
export async function alternarAtivoTenantAction(
  tenantId: string,
  ativo: boolean,
): Promise<AlternarAtivoState> {
  const session = await auth()

  if (!session?.user?.id || !session.user.email || !superAdminEmails.includes(session.user.email)) {
    return { message: 'Acesso negado.' }
  }

  const parsed = alternarAtivoSchema.safeParse({ tenantId, ativo: String(ativo) })
  if (!parsed.success) {
    return { message: 'Dados inválidos.' }
  }

  const tenant = await db.tenant.findUnique({
    where: { id: parsed.data.tenantId },
    select: { id: true, nome: true, ativo: true },
  })
  if (!tenant) return { message: 'Torcida não encontrada.' }

  if (tenant.ativo === parsed.data.ativo) {
    return { success: true, message: `${tenant.nome} já está ${ativo ? 'ativa' : 'suspensa'}.` }
  }

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.tenant.update({
      where: { id: parsed.data.tenantId },
      data: { ativo: parsed.data.ativo },
    })

    await tx.auditLog.create({
      data: {
        tenantId: parsed.data.tenantId,
        atorId: session.user.id,
        acao: parsed.data.ativo ? 'TENANT_REATIVADO' : 'TENANT_SUSPENSO',
        entidade: 'Tenant',
        entidadeId: parsed.data.tenantId,
        detalhes: { nome: tenant.nome },
      },
    })
  })

  invalidateTorcidasSelecaoCache()
  revalidatePath('/super-admin/setup')
  revalidatePath('/super-admin/torcidas')

  return {
    success: true,
    message: `${tenant.nome} ${ativo ? 'reativada' : 'suspensa'} com sucesso.`,
  }
}

const alterarPlanoSchema = z.object({
  tenantId: z.string().uuid('Tenant inválido'),
  plano: z.enum(['FREE', 'BASIC', 'PREMIUM']),
})

export type AlterarPlanoState = {
  success?: boolean
  message?: string
}

/** Troca o plano do tenant. Hoje `plano` é só rótulo — sem gating de feature associado. */
export async function alterarPlanoTenantAction(
  tenantId: string,
  plano: string,
): Promise<AlterarPlanoState> {
  const session = await auth()

  if (!session?.user?.id || !session.user.email || !superAdminEmails.includes(session.user.email)) {
    return { message: 'Acesso negado.' }
  }

  const parsed = alterarPlanoSchema.safeParse({ tenantId, plano })
  if (!parsed.success) {
    return { message: 'Dados inválidos.' }
  }

  const tenant = await db.tenant.findUnique({
    where: { id: parsed.data.tenantId },
    select: { id: true, nome: true, plano: true },
  })
  if (!tenant) return { message: 'Torcida não encontrada.' }

  if (tenant.plano === parsed.data.plano) {
    return { success: true, message: `${tenant.nome} já está no plano ${parsed.data.plano}.` }
  }

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.tenant.update({
      where: { id: parsed.data.tenantId },
      data: { plano: parsed.data.plano },
    })

    await tx.auditLog.create({
      data: {
        tenantId: parsed.data.tenantId,
        atorId: session.user.id,
        acao: 'TENANT_PLANO_ALTERADO',
        entidade: 'Tenant',
        entidadeId: parsed.data.tenantId,
        detalhes: { de: tenant.plano, para: parsed.data.plano },
      },
    })
  })

  revalidatePath('/super-admin/setup')
  revalidatePath('/super-admin/torcidas')

  return {
    success: true,
    message: `${tenant.nome} agora está no plano ${parsed.data.plano}.`,
  }
}
