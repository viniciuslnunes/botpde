'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import type { Prisma } from '@torcida/db'
import { superAdminEmails } from '@/lib/env'
import { invalidatePermissionsCache } from '@/lib/tenant'
import { invalidateTorcidasSelecaoCache } from '@/lib/tenant-context'
import { SYSTEM_ROLES } from '@torcida/types'
import { z } from 'zod'

const transferirSchema = z.object({
  tenantId: z.string().uuid('Tenant inválido'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('E-mail inválido'),
})

export type TransferirOwnerState = {
  errors?: Record<string, string[]>
  message?: string
  success?: boolean
  tenantSlug?: string
}

function negarSuperAdmin(): TransferirOwnerState {
  return { message: 'Acesso negado.' }
}

export async function transferirOwnerAction(
  _prev: TransferirOwnerState,
  formData: FormData,
): Promise<TransferirOwnerState> {
  const session = await auth()

  if (!session?.user?.id || !session.user.email || !superAdminEmails.includes(session.user.email)) {
    return negarSuperAdmin()
  }

  const parsed = transferirSchema.safeParse({
    tenantId: formData.get('tenantId'),
    email: formData.get('email'),
  })

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
  }

  const { tenantId, email } = parsed.data

  const [tenant, novoOwner, ownerRole] = await Promise.all([
    db.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, slug: true, nome: true },
    }),
    db.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true },
    }),
    db.role.findFirst({
      where: { tenantId, nome: SYSTEM_ROLES.OWNER, isSystem: true },
      select: { id: true },
    }),
  ])

  if (!tenant) return { message: 'Torcida não encontrada.' }
  if (!novoOwner) {
    return {
      errors: {
        email: ['Usuário não encontrado. A pessoa precisa criar conta (login) antes da transferência.'],
      },
    }
  }
  if (!ownerRole) {
    return { message: 'Cargo owner não encontrado nesta torcida. Rode o seed de cargos de sistema.' }
  }

  const ownersAtuais: { id: string; userId: string }[] = await db.userRole.findMany({
    where: { tenantId, roleId: ownerRole.id },
    select: { id: true, userId: true },
  })

  const jaOwner = ownersAtuais.some((o) => o.userId === novoOwner.id)
  if (jaOwner && ownersAtuais.length === 1) {
    return {
      success: true,
      tenantSlug: tenant.slug,
      message: `${novoOwner.email} já é owner de ${tenant.nome}.`,
    }
  }

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    for (const owner of ownersAtuais) {
      if (owner.userId === novoOwner.id) continue
      await tx.userRole.delete({ where: { id: owner.id } })
    }

    const vinculoExistente = await tx.userRole.findFirst({
      where: { userId: novoOwner.id, tenantId, roleId: ownerRole.id },
    })

    if (!vinculoExistente) {
      await tx.userRole.create({
        data: {
          tenantId,
          userId: novoOwner.id,
          roleId: ownerRole.id,
        },
      })
    }

    await tx.auditLog.create({
      data: {
        tenantId,
        atorId: session.user.id,
        acao: 'OWNER_TRANSFERIDO',
        entidade: 'User',
        entidadeId: novoOwner.id,
        detalhes: {
          novoOwnerEmail: novoOwner.email,
          novoOwnerNome: novoOwner.name,
          ownersAnteriores: ownersAtuais
            .filter((o) => o.userId !== novoOwner.id)
            .map((o) => o.userId),
        },
      },
    })
  })

  for (const owner of ownersAtuais) {
    invalidatePermissionsCache(owner.userId, tenantId)
  }
  invalidatePermissionsCache(novoOwner.id, tenantId)

  return {
    success: true,
    tenantSlug: tenant.slug,
    message: `Propriedade de ${tenant.nome} transferida para ${novoOwner.email}.`,
  }
}

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

  return {
    success: true,
    message: `${tenant.nome} agora está no plano ${parsed.data.plano}.`,
  }
}
