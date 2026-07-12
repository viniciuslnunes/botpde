'use server'

import { auth } from '@/lib/auth'
import { db } from '@torcida/db'
import type { Prisma } from '@torcida/db'
import { superAdminEmails } from '@/lib/env'
import { invalidatePermissionsCache } from '@/lib/tenant'
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
